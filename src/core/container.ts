import {
  Token,
  Constructor,
  Factory,
  AsyncFactory,
  Lifetime,
  RegistrationOptions,
  IContainer,
  ServiceDefinition,
} from "../types/index.js";
import { Registry } from "./registry.js";
import { Resolver } from "./resolver.js";
import { LifecycleManager } from "./lifecycle.js";
import { CircularDependencyError, UnregisteredServiceError, ValidationError } from "../errors/index.js";
import { validateGraph, type GraphNode } from "./validation.js";

/**
 * The resolver is stateless, so every container shares one instance
 */
const sharedResolver = new Resolver();

/**
 * Main dependency injection container
 */
export class Container implements IContainer {
  private readonly registry: Registry;
  private readonly resolver: Resolver;
  private readonly lifecycle: LifecycleManager;
  private readonly parent?: Container;

  constructor(parent?: Container) {
    this.registry = new Registry();
    this.resolver = sharedResolver;
    // Scopes get their own lifecycle manager. Singletons owned by an ancestor are
    // always resolved through that ancestor, so nothing needs to be copied here
    // and creating a scope stays O(1) regardless of how many singletons exist.
    this.lifecycle = new LifecycleManager(parent?.lifecycle);
    this.parent = parent;
  }

  /**
   * Register a service
   */
  register<T>(
    tokenOrConstructor: Token<T> | Constructor<T>,
    targetOrOptions?: Constructor<T> | Factory<T> | RegistrationOptions,
    options?: RegistrationOptions,
  ): void {
    // Handle overloaded signatures
    let token: Token<T>;
    let target: Constructor<T> | Factory<T>;
    let opts: RegistrationOptions;

    if (typeof targetOrOptions === "undefined") {
      // Case 1: register(Constructor)
      token = tokenOrConstructor as Constructor<T>;
      target = tokenOrConstructor as Constructor<T>;
      opts = {};
    } else if (typeof targetOrOptions === "function") {
      // Case 2: register(Token, Constructor|Factory, options?)
      token = tokenOrConstructor;
      target = targetOrOptions as Constructor<T> | Factory<T>;
      opts = options || {};
    } else {
      // Case 3: register(Constructor, options)
      token = tokenOrConstructor as Constructor<T>;
      target = tokenOrConstructor as Constructor<T>;
      opts = targetOrOptions as RegistrationOptions;
    }

    this.add(Registry.createDefinition(token, target, opts));
  }

  /**
   * Register a value directly
   */
  registerValue<T>(token: Token<T>, value: T, options?: RegistrationOptions): void {
    this.add(Registry.createValueDefinition(token, value, options));
  }

  /**
   * Register a factory function
   */
  registerFactory<T>(token: Token<T>, factory: Factory<T>, options?: RegistrationOptions): void {
    const definition = Registry.createDefinition(token, factory, options);
    // Whatever its shape, a target registered here is called, never constructed
    definition.isFactory = true;
    definition.dependencies = [];
    definition.optional = undefined;
    this.add(definition);
  }

  /**
   * Register an async factory function
   */
  registerAsyncFactory<T>(token: Token<T>, factory: AsyncFactory<T>, options?: RegistrationOptions): void {
    const definition = Registry.createDefinition(token, factory, options);
    // A promise-returning function is async even when not declared with `async`
    definition.isFactory = true;
    definition.isAsync = true;
    definition.dependencies = [];
    definition.optional = undefined;
    this.add(definition);
  }

  /**
   * Register multiple implementations for the same token.
   *
   * Allows registering multiple services under the same token, useful for plugin
   * architectures, event handlers, or any scenario where you need multiple implementations
   * of the same interface. All implementations can be resolved using `resolveAll()`.
   *
   * @template T - The service type
   * @param token - Token to identify the services
   * @param implementations - Array of constructor implementations
   * @param options - Optional registration configuration applied to all implementations
   *
   * @example
   * ```typescript
   * // Plugin system
   * interface Plugin {
   *   name: string;
   *   execute(): void;
   * }
   *
   * class PluginA implements Plugin {
   *   name = 'Plugin A';
   *   execute() { console.log('A executed'); }
   * }
   *
   * class PluginB implements Plugin {
   *   name = 'Plugin B';
   *   execute() { console.log('B executed'); }
   * }
   *
   * container.registerAll('plugin', [PluginA, PluginB]);
   * const plugins = container.resolveAll<Plugin>('plugin');
   * plugins.forEach(p => p.execute());
   * // Output: A executed, B executed
   * ```
   *
   * @example
   * ```typescript
   * // Event handlers
   * abstract class EventHandler {
   *   abstract handle(event: Event): void;
   * }
   *
   * class LoggingHandler extends EventHandler {
   *   handle(event: Event) { console.log('Event:', event); }
   * }
   *
   * class MetricsHandler extends EventHandler {
   *   handle(event: Event) { metrics.increment('events'); }
   * }
   *
   * container.registerAll(EventHandler, [LoggingHandler, MetricsHandler]);
   *
   * // Use in event dispatcher
   * class EventDispatcher {
   *   constructor(private container: IContainer) {}
   *
   *   dispatch(event: Event) {
   *     const handlers = this.container.resolveAll<EventHandler>(EventHandler);
   *     handlers.forEach(h => h.handle(event));
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Middleware pipeline
   * interface Middleware {
   *   process(data: any): any;
   * }
   *
   * container.registerAll<Middleware>('middleware', [
   *   ValidationMiddleware,
   *   AuthenticationMiddleware,
   *   LoggingMiddleware
   * ], { lifetime: Lifetime.Singleton });
   *
   * const pipeline = container.resolveAll<Middleware>('middleware');
   * let result = initialData;
   * for (const middleware of pipeline) {
   *   result = middleware.process(result);
   * }
   * ```
   */
  registerAll<T>(token: Token<T>, implementations: Constructor<T>[], options?: RegistrationOptions): void {
    for (const impl of implementations) {
      const definition = Registry.createDefinition(token, impl, options);
      this.registry.registerMulti(definition);
    }
  }

  /**
   * Check if a service is registered
   */
  has(token: Token): boolean {
    for (let container: Container | undefined = this; container !== undefined; container = container.parent) {
      if (container.registry.has(token)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolve a service instance
   */
  resolve<T>(token: Token<T>, stack?: Set<Token>): T {
    // Find the definition and the container that owns it
    let owner: Container = this;
    let definition = this.registry.get(token);
    while (definition === undefined) {
      if (owner.parent === undefined) {
        throw new UnregisteredServiceError(token);
      }
      owner = owner.parent;
      definition = owner.registry.get(token);
    }

    // Singletons live in (and resolve their dependencies from) the container that
    // owns the registration; everything else belongs to the resolving container.
    const lifetime = definition.lifetime;
    const target = lifetime === Lifetime.Singleton ? owner : this;
    return target.instantiate(definition, lifetime, token, stack);
  }

  /**
   * Resolve a service instance asynchronously
   */
  async resolveAsync<T>(token: Token<T>, stack?: Set<Token>): Promise<T> {
    let owner: Container = this;
    let definition = this.registry.get(token);
    while (definition === undefined) {
      if (owner.parent === undefined) {
        throw new UnregisteredServiceError(token);
      }
      owner = owner.parent;
      definition = owner.registry.get(token);
    }

    const lifetime = definition.lifetime;
    const target = lifetime === Lifetime.Singleton ? owner : this;
    return target.instantiateAsync(definition, lifetime, token, stack);
  }

  /**
   * Resolve all implementations of a service
   */
  resolveAll<T>(token: Token<T>, stack?: Set<Token>): T[] {
    const owner = this.findMultiOwner(token);
    if (owner === undefined) {
      return [];
    }

    const definitions = owner.registry.getAll(token);
    const instances = new Array<T>(definitions.length);
    for (let i = 0; i < definitions.length; i++) {
      const definition = definitions[i] as ServiceDefinition<T>;
      const target = definition.lifetime === Lifetime.Singleton ? owner : this;
      // Implementations share a token, so each is cached under its own definition
      instances[i] = target.instantiate(definition, definition.lifetime, definition, stack);
    }
    return instances;
  }

  /**
   * Resolve all implementations of a service asynchronously
   */
  async resolveAllAsync<T>(token: Token<T>, stack?: Set<Token>): Promise<T[]> {
    const owner = this.findMultiOwner(token);
    if (owner === undefined) {
      return [];
    }

    const definitions = owner.registry.getAll(token);
    const instances: T[] = [];
    // Sequential on purpose: implementations are created in registration order
    for (const definition of definitions as ServiceDefinition<T>[]) {
      const target = definition.lifetime === Lifetime.Singleton ? owner : this;
      instances.push(await target.instantiateAsync(definition, definition.lifetime, definition, stack));
    }
    return instances;
  }

  /**
   * Resolve a service, or return undefined when the token is not registered
   */
  tryResolve<T>(token: Token<T>): T | undefined {
    return this.has(token) ? this.resolve(token) : undefined;
  }

  /**
   * Resolve a service asynchronously, or return undefined when the token is not registered
   */
  async tryResolveAsync<T>(token: Token<T>): Promise<T | undefined> {
    return this.has(token) ? this.resolveAsync(token) : undefined;
  }

  /**
   * Verify the dependency graph without instantiating anything
   */
  validate(): void {
    const issues = validateGraph(this.visibleNodes(), lookupNode);
    if (issues.length > 0) {
      throw new ValidationError(issues);
    }
  }

  /**
   * Create a child scoped container
   */
  createScope(): IContainer {
    return new Container(this);
  }

  /**
   * Dispose of all disposable services
   */
  async dispose(): Promise<void> {
    try {
      await this.lifecycle.dispose();
    } finally {
      this.registry.clear();
    }
  }

  /**
   * Explicit resource management (`await using scope = container.createScope()`)
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  /**
   * Store a definition, dropping any instance cached for a registration it
   * replaces or (in a scope) for the parent registration it now shadows
   */
  private add(definition: ServiceDefinition): void {
    const replacing = definition.replace === true && this.registry.has(definition.token);
    this.registry.register(definition);
    if (replacing || this.parent !== undefined) {
      this.lifecycle.evict(definition.token);
    }
  }

  /**
   * Create (or fetch the cached) instance of a definition in this container.
   * `key` identifies the instance in the lifetime caches.
   */
  private instantiate<T>(
    definition: ServiceDefinition<T>,
    lifetime: Lifetime,
    key: unknown,
    stack: Set<Token> | undefined,
  ): T {
    if (lifetime !== Lifetime.Transient) {
      // Fast path: no closure allocation for already created instances
      const cached = this.lifecycle.peek(lifetime, key);
      if (cached !== undefined) {
        return cached;
      }
    }

    return this.lifecycle.applyLifetime(lifetime, key as Token<T>, () =>
      this.resolver.resolve(definition.token, definition, this, undefined, stack),
    );
  }

  private instantiateAsync<T>(
    definition: ServiceDefinition<T>,
    lifetime: Lifetime,
    key: unknown,
    stack: Set<Token> | undefined,
  ): Promise<T> {
    if (lifetime !== Lifetime.Transient) {
      const cached = this.lifecycle.peek(lifetime, key);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }

      // A cached lifetime that is still being created would hand back its own
      // pending promise and wait on itself forever; report the cycle instead.
      if (stack !== undefined && stack.has(definition.token)) {
        return Promise.reject(new CircularDependencyError([...stack, definition.token]));
      }
    }

    return this.lifecycle.applyLifetimeAsync(lifetime, key as Token<T>, () =>
      this.resolver.resolveAsync(definition.token, definition, this, undefined, stack),
    );
  }

  /**
   * Find the closest container holding multi-registrations for a token
   */
  private findMultiOwner(token: Token): Container | undefined {
    for (let container: Container | undefined = this; container !== undefined; container = container.parent) {
      if (container.registry.hasMulti(token)) {
        return container;
      }
    }
    return undefined;
  }

  /**
   * Every definition reachable from this container, paired with the container it
   * resolves in; closer registrations shadow ancestors' registrations of the same token.
   */
  private visibleNodes(): GraphNode<Container>[] {
    const nodes: GraphNode<Container>[] = [];
    const seenSingle = new Set<Token>();
    const seenMulti = new Set<Token>();
    for (let container: Container | undefined = this; container !== undefined; container = container.parent) {
      const registry = container.registry;
      const shadowedSingle = new Set(seenSingle);
      const shadowedMulti = new Set(seenMulti);
      for (const definition of registry.definitions()) {
        const multi = registry.get(definition.token) !== definition;
        const shadowed = multi ? shadowedMulti : shadowedSingle;
        if (shadowed.has(definition.token)) {
          continue;
        }
        (multi ? seenMulti : seenSingle).add(definition.token);
        nodes.push({ definition, context: definition.lifetime === Lifetime.Singleton ? container : this });
      }
    }
    return nodes;
  }

  /**
   * What `token` resolves to when requested from this container (mirrors `resolve`)
   */
  static lookup(from: Container, token: Token): GraphNode<Container> | undefined {
    for (let container: Container | undefined = from; container !== undefined; container = container.parent) {
      const definition = container.registry.get(token);
      if (definition !== undefined) {
        return { definition, context: definition.lifetime === Lifetime.Singleton ? container : from };
      }
    }
    return undefined;
  }
}

const lookupNode = (from: Container, token: Token) => Container.lookup(from, token);

/**
 * Create a new dependency injection container instance.
 *
 * Convenience function that instantiates a new Container. This is the recommended
 * way to create a root container for your application. The container starts empty
 * with no pre-registered services.
 *
 * @returns A new root container instance
 *
 * @example
 * ```typescript
 * // Application bootstrap
 * import { createContainer, Lifetime } from 'ts-injection';
 *
 * const container = createContainer();
 *
 * // Register core services
 * container.register(Logger, { lifetime: Lifetime.Singleton });
 * container.register(DatabaseService, { lifetime: Lifetime.Singleton });
 * container.register(UserRepository);
 * container.register(UserService);
 *
 * // Start application
 * const app = container.resolve(Application);
 * await app.start();
 * ```
 *
 * @example
 * ```typescript
 * // Web server setup
 * const container = createContainer();
 *
 * // Register application services
 * container.registerValue('config', loadConfig());
 * container.register('database', DatabaseConnection, { lifetime: Lifetime.Singleton });
 * container.register(UserController);
 *
 * // Create request-scoped container for each request
 * app.use((req, res, next) => {
 *   req.container = container.createScope();
 *   next();
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Testing setup
 * describe('UserService', () => {
 *   let container: IContainer;
 *
 *   beforeEach(() => {
 *     container = createContainer();
 *     // Register test doubles
 *     container.registerValue('database', mockDatabase);
 *   });
 * });
 * ```
 */
export function createContainer(): IContainer {
  return new Container();
}

/**
 * Global container instance for application-wide dependency injection.
 *
 * This provides a singleton container that can be accessed from anywhere in your application.
 * Useful for applications that need a single, shared dependency injection container.
 *
 * @example
 * ```typescript
 * import { getGlobalContainer } from 'fast-injection';
 *
 * // Register services at application startup
 * const container = getGlobalContainer();
 * container.register(DatabaseService);
 * container.register(UserService);
 *
 * // Access from anywhere in your application
 * const userService = getGlobalContainer().resolve(UserService);
 * ```
 *
 * @example
 * ```typescript
 * // Reset global container (useful for testing)
 * import { resetGlobalContainer } from 'fast-injection';
 *
 * afterEach(async () => {
 *   await resetGlobalContainer();
 * });
 * ```
 */
let globalContainerInstance: Container | null = null;

/**
 * Get the global container instance, creating it if it doesn't exist.
 *
 * Returns a singleton container instance that persists across the application lifecycle.
 * This is useful for applications that want a single, shared dependency injection container
 * without manually passing the container instance around.
 *
 * @returns The global container instance
 *
 * @example
 * ```typescript
 * // In your application bootstrap
 * import { getGlobalContainer } from 'fast-injection';
 *
 * const container = getGlobalContainer();
 * container.register(DatabaseService, { lifetime: Lifetime.Singleton });
 * container.register(UserService);
 * ```
 *
 * @example
 * ```typescript
 * // In any module that needs dependencies
 * import { getGlobalContainer } from 'fast-injection';
 *
 * const container = getGlobalContainer();
 * const userService = container.resolve(UserService);
 * ```
 */
export function getGlobalContainer(): Container {
  if (!globalContainerInstance) {
    globalContainerInstance = new Container();
  }
  return globalContainerInstance;
}

/**
 * Reset the global container instance.
 *
 * Disposes of the current global container (if it exists) and sets it to null,
 * so the next call to `getGlobalContainer()` will create a fresh instance.
 * This is particularly useful for testing scenarios where you need to start
 * with a clean container between tests.
 *
 * @returns Promise that resolves when the container is disposed
 *
 * @example
 * ```typescript
 * import { resetGlobalContainer } from 'fast-injection';
 *
 * // In test cleanup
 * afterEach(async () => {
 *   await resetGlobalContainer();
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Reset during application lifecycle
 * import { resetGlobalContainer, getGlobalContainer } from 'fast-injection';
 *
 * // Clean up old container
 * await resetGlobalContainer();
 *
 * // Get fresh container with new registrations
 * const container = getGlobalContainer();
 * container.register(NewDatabaseService);
 * ```
 */
export async function resetGlobalContainer(): Promise<void> {
  if (globalContainerInstance) {
    await globalContainerInstance.dispose();
    globalContainerInstance = null;
  }
}
