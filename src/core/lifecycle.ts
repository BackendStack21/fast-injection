import type { Lifecycle, Token } from "../types/index.js";
import { Lifetime } from "../types/index.js";

/**
 * Time-to-live for failed token tracking (5 seconds)
 */
const FAILED_TOKEN_TTL = 5000;

/**
 * An async creation that has not settled yet.
 *
 * `stale` is set when the registration it belongs to was replaced or its container
 * disposed while the creation was still running: the result is then handed to the
 * callers already waiting for it, but must not be written to the caches.
 */
interface PendingCreation {
  promise: Promise<any>;
  stale: boolean;
  settled: boolean;
}

/**
 * Check if an instance implements the Lifecycle interface
 */
function hasLifecycleHooks(instance: any): instance is Lifecycle {
  return (
    instance !== null &&
    typeof instance === "object" &&
    (typeof instance.onInit === "function" || typeof instance.onDispose === "function")
  );
}

/**
 * Swallow errors of an async `onInit` hook (hooks never fail a resolution)
 */
function ignoreRejection(): void {
  // Error in onInit hook - intentionally not thrown
}

/**
 * Lifecycle manager handles service instance creation and disposal
 */
export class LifecycleManager {
  private readonly singletons = new Map<unknown, any>();
  private readonly scopedInstances = new Map<unknown, any>();
  /**
   * Insertion-ordered: strong references for cached instances, weak references for
   * transients.
   *
   * Transient instances are owned by their consumers, not by the container. Tracking
   * them strongly would retain every transient ever resolved until the container is
   * disposed, which is an unbounded leak on long-lived containers. They are tracked
   * weakly instead: still disposed with the container while alive, and dropped from
   * this set as soon as they are garbage collected.
   */
  private readonly disposables = new Set<Lifecycle | WeakRef<Lifecycle>>();
  private readonly pendingAsync = new Map<unknown, PendingCreation>();
  private readonly failedTokens = new Map<unknown, { error: Error; timestamp: number }>();
  /** Manager of the parent container, when this one belongs to a scope */
  private readonly parent?: LifecycleManager;
  /**
   * Instances this manager already tracks. An instance reachable through several
   * registrations (e.g. a factory aliasing a singleton) is initialised, tracked
   * and disposed once. Ancestors are consulted too, so a scope never takes over
   * (and later disposes) an instance owned by a container that outlives it.
   */
  private tracked?: WeakSet<object>;
  /**
   * Removes the entry of a transient once it has been collected. Owned by this
   * manager (never module-global): a global registry would keep its held values,
   * and through them this manager's instances, alive for as long as any tracked
   * transient is alive.
   */
  private finalizer?: FinalizationRegistry<WeakRef<Lifecycle>>;
  /** True while the synchronous part of dispose() is calling hooks */
  private runningHooks = false;
  private disposing?: Promise<void>;

  /**
   * @param parent - Lifecycle manager of the parent container, when creating a scope
   */
  constructor(parent?: LifecycleManager) {
    this.parent = parent;
  }

  /**
   * Get or create a singleton instance
   */
  getSingleton<T>(token: Token<T>, factory: () => T): T {
    return this.getCached(this.singletons, token, factory);
  }

  /**
   * Get or create a scoped instance
   */
  getScoped<T>(token: Token<T>, factory: () => T): T {
    return this.getCached(this.scopedInstances, token, factory);
  }

  /**
   * Get or create an async singleton instance
   */
  getSingletonAsync<T>(token: Token<T>, factory: () => Promise<T>): Promise<T> {
    return this.getCachedAsync(this.singletons, token, factory);
  }

  /**
   * Get or create an async scoped instance
   */
  getScopedAsync<T>(token: Token<T>, factory: () => Promise<T>): Promise<T> {
    return this.getCachedAsync(this.scopedInstances, token, factory);
  }

  /**
   * Create a transient instance (always new)
   */
  getTransient<T>(factory: () => T): T {
    const instance = factory();
    if (hasLifecycleHooks(instance)) {
      const init = this.track(instance, true);
      if (init instanceof Promise) init.catch(ignoreRejection);
    }
    return instance;
  }

  /**
   * Create a transient instance asynchronously
   */
  async getTransientAsync<T>(factory: () => Promise<T>): Promise<T> {
    const instance = await factory();
    if (hasLifecycleHooks(instance)) {
      await this.settleInit(this.track(instance, true));
    }
    return instance;
  }

  /**
   * Apply lifecycle based on lifetime type
   */
  applyLifetime<T>(lifetime: Lifetime, token: Token<T>, factory: () => T): T {
    switch (lifetime) {
      case Lifetime.Singleton:
        return this.getCached(this.singletons, token, factory);
      case Lifetime.Scoped:
        return this.getCached(this.scopedInstances, token, factory);
      case Lifetime.Transient:
      default:
        return this.getTransient(factory);
    }
  }

  /**
   * Apply lifecycle based on lifetime type (async)
   */
  applyLifetimeAsync<T>(lifetime: Lifetime, token: Token<T>, factory: () => Promise<T>): Promise<T> {
    switch (lifetime) {
      case Lifetime.Singleton:
        return this.getCachedAsync(this.singletons, token, factory);
      case Lifetime.Scoped:
        return this.getCachedAsync(this.scopedInstances, token, factory);
      case Lifetime.Transient:
      default:
        return this.getTransientAsync(factory);
    }
  }

  /**
   * Return the cached instance for a lifetime, or `undefined` when not created yet.
   * Allocation-free fast path for the container.
   */
  peek(lifetime: Lifetime, key: unknown): any {
    if (lifetime === Lifetime.Singleton) return this.singletons.get(key);
    if (lifetime === Lifetime.Scoped) return this.scopedInstances.get(key);
    return undefined;
  }

  /**
   * Forget the cached instance and failure state of a key (used when a registration
   * is replaced). The evicted instance stays tracked and is disposed with the container.
   */
  evict(key: unknown): void {
    if (this.singletons.size > 0) this.singletons.delete(key);
    if (this.scopedInstances.size > 0) this.scopedInstances.delete(key);
    if (this.failedTokens.size > 0) this.failedTokens.delete(key);
    if (this.pendingAsync.size > 0) {
      const pending = this.pendingAsync.get(key);
      if (pending !== undefined) {
        pending.stale = true;
        this.pendingAsync.delete(key);
      }
    }
  }

  /**
   * Dispose of all tracked instances
   */
  dispose(): Promise<void> {
    // Concurrent callers share one disposal and all wait for its hooks
    if (this.disposing !== undefined) {
      return this.disposing;
    }
    // A hook disposing its own container: this disposal is already under way
    if (this.runningHooks) {
      return Promise.resolve();
    }

    // Snapshot first so hooks can never run twice. The instance caches stay
    // untouched until the hooks have settled: a hook (or a late caller during a
    // graceful shutdown) resolving a service must get the existing instance, not
    // build a fresh one that nothing would ever dispose.
    let asyncHooks: Promise<void>[] | undefined;
    if (this.disposables.size > 0) {
      const entries = Array.from(this.disposables);
      this.disposables.clear();
      this.runningHooks = true;

      // Call onDispose on all tracked instances in reverse order
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        let instance: Lifecycle | undefined;
        if (entry instanceof WeakRef) {
          instance = entry.deref();
        } else {
          instance = entry;
        }

        if (instance?.onDispose) {
          try {
            const result = instance.onDispose();
            if (result instanceof Promise) {
              (asyncHooks ??= []).push(result);
            }
          } catch {
            // Continue disposing other instances
          }
        }
      }
      this.runningHooks = false;
    }

    if (asyncHooks === undefined) {
      // Nothing to wait for: finish synchronously
      this.reset();
      return Promise.resolve();
    }

    return (this.disposing = this.settleDispose(asyncHooks));
  }

  private async settleDispose(hooks: Promise<void>[]): Promise<void> {
    try {
      const results = await Promise.allSettled(hooks);
      for (const result of results) {
        if (result.status === "rejected") {
          throw result.reason;
        }
      }
    } finally {
      // Always reset, even when a hook failed: no half-disposed state
      this.disposing = undefined;
      this.reset();
    }
  }

  /**
   * Drop every cached instance and all async bookkeeping
   */
  private reset(): void {
    if (this.pendingAsync.size > 0) {
      // Creations still in flight must not repopulate the caches when they settle
      for (const pending of this.pendingAsync.values()) {
        pending.stale = true;
      }
      this.pendingAsync.clear();
    }
    if (this.singletons.size > 0) this.singletons.clear();
    if (this.scopedInstances.size > 0) this.scopedInstances.clear();
    if (this.failedTokens.size > 0) this.failedTokens.clear();
    // A disposed container starts over: instances may be registered and initialised again
    this.tracked = undefined;
  }

  /**
   * Clear scoped instances only (for creating child scopes)
   */
  clearScoped(): void {
    this.scopedInstances.clear();
    // Note: Don't clear failedTokens for singletons as they persist across scopes
  }

  /**
   * Create a child lifecycle manager with inherited singletons
   */
  createChild(): LifecycleManager {
    const child = new LifecycleManager(this);

    // Share singleton references with child (but not scoped instances)
    for (const [token, instance] of this.singletons) {
      child.singletons.set(token, instance);
    }

    // Share pending async singletons
    for (const [token, pending] of this.pendingAsync) {
      child.pendingAsync.set(token, pending);
    }

    return child;
  }

  private getCached<T>(cache: Map<unknown, any>, key: unknown, factory: () => T): T {
    let instance = cache.get(key);
    if (instance === undefined) {
      instance = factory();
      cache.set(key, instance);
      if (hasLifecycleHooks(instance)) {
        const init = this.track(instance, false);
        if (init instanceof Promise) init.catch(ignoreRejection);
      }
    }
    return instance;
  }

  private getCachedAsync<T>(cache: Map<unknown, any>, key: unknown, factory: () => Promise<T>): Promise<T> {
    // An instance is cached as soon as it is built. Callers arriving while its
    // async `onInit` is still running get it right away: making them wait would
    // deadlock an `onInit` that resolves something depending on its own service.
    const instance = cache.get(key);
    if (instance !== undefined) {
      return Promise.resolve(instance);
    }

    // Deduplicate concurrent resolutions
    if (this.pendingAsync.size > 0) {
      const pending = this.pendingAsync.get(key);
      if (pending !== undefined) {
        return pending.promise;
      }
    }

    if (this.failedTokens.size > 0) {
      // Check for recently failed resolutions (with TTL)
      const failed = this.failedTokens.get(key);
      if (failed && Date.now() - failed.timestamp < FAILED_TOKEN_TTL) {
        return Promise.reject(failed.error);
      }

      // Clean up expired failures to prevent unbounded growth
      this.cleanupExpiredFailures();
    }

    const pending: PendingCreation = {
      promise: undefined as any,
      stale: false,
      settled: false,
    };
    pending.promise = this.createCachedAsync(cache, key, factory, pending);
    // A factory that throws synchronously has already settled at this point
    if (!pending.settled) {
      this.pendingAsync.set(key, pending);
    }
    return pending.promise;
  }

  private async createCachedAsync<T>(
    cache: Map<unknown, any>,
    key: unknown,
    factory: () => Promise<T>,
    pending: PendingCreation,
  ): Promise<T> {
    try {
      const instance = await factory();
      if (!pending.stale) {
        cache.set(key, instance);
      }
      if (hasLifecycleHooks(instance)) {
        // A stale result is not cached, so nothing owns it: track it weakly
        await this.settleInit(this.track(instance, pending.stale));
      }
      if (!pending.stale) {
        this.failedTokens.delete(key);
      }
      return instance;
    } catch (error) {
      // Track failure with timestamp for TTL
      if (!pending.stale) {
        this.failedTokens.set(key, {
          error: error as Error,
          timestamp: Date.now(),
        });
      }
      throw error;
    } finally {
      pending.settled = true;
      if (this.pendingAsync.get(key) === pending) {
        this.pendingAsync.delete(key);
      }
    }
  }

  /**
   * Track an instance for disposal and run its `onInit` hook.
   * Returns whatever `onInit` returned so async callers can await it.
   */
  private track(instance: Lifecycle, transient: boolean): void | Promise<void> {
    for (let manager: LifecycleManager | undefined = this; manager !== undefined; manager = manager.parent) {
      if (manager.tracked !== undefined && manager.tracked.has(instance)) {
        return;
      }
    }
    (this.tracked ??= new WeakSet()).add(instance);

    if (typeof instance.onDispose === "function") {
      if (transient) {
        const ref = new WeakRef(instance);
        this.disposables.add(ref);
        // No unregister token: JavaScriptCore's token bookkeeping makes collecting
        // many registrations quadratic. A callback firing after dispose() merely
        // deletes an entry that is already gone.
        (this.finalizer ??= new FinalizationRegistry((collected) => {
          this.disposables.delete(collected);
        })).register(instance, ref);
      } else {
        this.disposables.add(instance);
      }
    }

    if (typeof instance.onInit === "function") {
      return instance.onInit();
    }
  }

  /**
   * Wait for an async `onInit` hook; hook errors never fail a resolution.
   */
  private async settleInit(init: void | Promise<void>): Promise<void> {
    if (init instanceof Promise) {
      try {
        await init;
      } catch {
        ignoreRejection();
      }
    }
  }

  /**
   * Clean up expired failed token entries to prevent unbounded growth
   */
  private cleanupExpiredFailures(): void {
    const now = Date.now();
    for (const [token, { timestamp }] of this.failedTokens) {
      if (now - timestamp >= FAILED_TOKEN_TTL) {
        this.failedTokens.delete(token);
      }
    }
  }
}
