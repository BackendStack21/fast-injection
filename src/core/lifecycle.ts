import type { Lifecycle, Token } from "../types/index.js";
import { Lifetime } from "../types/index.js";

/**
 * Time-to-live for failed token tracking (5 seconds)
 */
const FAILED_TOKEN_TTL = 5000;

/**
 * Lifecycle manager handles service instance creation and disposal
 */
export class LifecycleManager {
  private readonly singletons = new Map<Token, any>();
  private readonly scopedInstances = new Map<Token, any>();
  private readonly disposables: Lifecycle[] = [];
  private readonly pendingAsync = new Map<Token, Promise<any>>();
  private readonly failedTokens = new Map<Token, { error: Error; timestamp: number }>();

  /**
   * Get or create a singleton instance
   */
  getSingleton<T>(token: Token<T>, factory: () => T): T {
    let instance = this.singletons.get(token);
    if (instance === undefined) {
      instance = factory();
      this.singletons.set(token, instance);
      this.trackDisposable(instance);
    }
    return instance;
  }

  /**
   * Get or create a scoped instance
   */
  getScoped<T>(token: Token<T>, factory: () => T): T {
    let instance = this.scopedInstances.get(token);
    if (instance === undefined) {
      instance = factory();
      this.scopedInstances.set(token, instance);
      this.trackDisposable(instance);
    }
    return instance;
  }

  /**
   * Get or create an async singleton instance
   */
  async getSingletonAsync<T>(token: Token<T>, factory: () => Promise<T>): Promise<T> {
    let instance = this.singletons.get(token);
    if (instance !== undefined) {
      return instance;
    }

    // Check for recently failed resolutions (with TTL)
    const failed = this.failedTokens.get(token);
    if (failed && Date.now() - failed.timestamp < FAILED_TOKEN_TTL) {
      throw failed.error;
    }

    // Clean up expired failures to prevent unbounded growth
    this.cleanupExpiredFailures();

    // Check for pending async resolution
    const pending = this.pendingAsync.get(token);
    if (pending) {
      return pending;
    }

    // Create promise and cache it
    const promise = (async () => {
      try {
        const inst = await factory();
        this.singletons.set(token, inst);
        this.trackDisposable(inst);
        // Clean up pending and failed maps
        this.failedTokens.delete(token);
        return inst;
      } catch (error) {
        // Track failure with timestamp for TTL
        this.failedTokens.set(token, { error: error as Error, timestamp: Date.now() });
        throw error;
      } finally {
        this.pendingAsync.delete(token);
      }
    })();

    this.pendingAsync.set(token, promise);
    return promise;
  }

  /**
   * Get or create an async scoped instance
   */
  async getScopedAsync<T>(token: Token<T>, factory: () => Promise<T>): Promise<T> {
    let instance = this.scopedInstances.get(token);
    if (instance !== undefined) {
      return instance;
    }

    // Check for recently failed resolutions (with TTL)
    const failed = this.failedTokens.get(token);
    if (failed && Date.now() - failed.timestamp < FAILED_TOKEN_TTL) {
      throw failed.error;
    }

    // Clean up expired failures to prevent unbounded growth
    this.cleanupExpiredFailures();

    // Check for pending async resolution
    const pending = this.pendingAsync.get(token);
    if (pending) {
      return pending;
    }

    // Create promise and cache it
    const promise = (async () => {
      try {
        const inst = await factory();
        this.scopedInstances.set(token, inst);
        this.trackDisposable(inst);
        // Clean up pending and failed maps
        this.failedTokens.delete(token);
        return inst;
      } catch (error) {
        // Track failure with timestamp for TTL
        this.failedTokens.set(token, { error: error as Error, timestamp: Date.now() });
        throw error;
      } finally {
        this.pendingAsync.delete(token);
      }
    })();

    this.pendingAsync.set(token, promise);
    return promise;
  }

  /**
   * Create a transient instance (always new)
   */
  getTransient<T>(factory: () => T): T {
    const instance = factory();
    // Transient instances are not cached, but we still track for disposal
    this.trackDisposable(instance);
    return instance;
  }

  /**
   * Create a transient instance asynchronously
   */
  async getTransientAsync<T>(factory: () => Promise<T>): Promise<T> {
    const instance = await factory();
    // Transient instances are not cached, but we still track for disposal
    this.trackDisposable(instance);
    return instance;
  }

  /**
   * Apply lifecycle based on lifetime type
   */
  applyLifetime<T>(lifetime: Lifetime, token: Token<T>, factory: () => T): T {
    switch (lifetime) {
      case Lifetime.Singleton:
        return this.getSingleton(token, factory);
      case Lifetime.Scoped:
        return this.getScoped(token, factory);
      case Lifetime.Transient:
      default:
        return this.getTransient(factory);
    }
  }

  /**
   * Apply lifecycle based on lifetime type (async)
   */
  async applyLifetimeAsync<T>(lifetime: Lifetime, token: Token<T>, factory: () => Promise<T>): Promise<T> {
    switch (lifetime) {
      case Lifetime.Singleton:
        return this.getSingletonAsync(token, factory);
      case Lifetime.Scoped:
        return this.getScopedAsync(token, factory);
      case Lifetime.Transient:
      default:
        return this.getTransientAsync(factory);
    }
  }

  /**
   * Track an instance for disposal if it implements Lifecycle
   */
  private trackDisposable(instance: any): void {
    if (this.hasLifecycleHooks(instance)) {
      this.disposables.push(instance);

      // Call onInit hook if available
      if (instance.onInit) {
        const result = instance.onInit();
        // If onInit returns a promise, we should handle it
        if (result instanceof Promise) {
          result.catch(() => {
            // Error in onInit hook - logged but not thrown
          });
        }
      }
    }
  }

  /**
   * Check if an instance implements Lifecycle interface
   */
  private hasLifecycleHooks(instance: any): instance is Lifecycle {
    return (
      instance &&
      typeof instance === "object" &&
      (typeof instance.onInit === "function" || typeof instance.onDispose === "function")
    );
  }

  /**
   * Dispose of all tracked instances
   */
  async dispose(): Promise<void> {
    const disposePromises: Promise<void>[] = [];

    // Call onDispose on all tracked instances in reverse order
    for (let i = this.disposables.length - 1; i >= 0; i--) {
      const instance = this.disposables[i];
      if (instance?.onDispose) {
        try {
          const result = instance.onDispose();
          if (result instanceof Promise) {
            disposePromises.push(result);
          }
        } catch (error) {
          // Log error but continue disposing other instances
        }
      }
    }

    await Promise.all(disposePromises);

    // Clear all caches
    this.singletons.clear();
    this.scopedInstances.clear();
    this.pendingAsync.clear();
    this.failedTokens.clear();
    this.disposables.length = 0;
  }

  /**
   * Clear scoped instances only (for creating child scopes)
   */
  clearScoped(): void {
    this.scopedInstances.clear();
    // Note: Don't clear failedTokens for singletons as they persist across scopes
  }

  /**
   * Clean up expired failed token entries to prevent unbounded growth
   */
  private cleanupExpiredFailures(): void {
    const now = Date.now();
    for (const [token, { timestamp }] of this.failedTokens.entries()) {
      if (now - timestamp >= FAILED_TOKEN_TTL) {
        this.failedTokens.delete(token);
      }
    }
  }

  /**
   * Create a child lifecycle manager with inherited singletons
   */
  createChild(): LifecycleManager {
    const child = new LifecycleManager();

    // Share singleton references with child (but not scoped instances)
    for (const [token, instance] of this.singletons.entries()) {
      child.singletons.set(token, instance);
    }

    // Share pending async singletons
    for (const [token, promise] of this.pendingAsync.entries()) {
      child.pendingAsync.set(token, promise);
    }

    return child;
  }
}
