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
import { UnregisteredServiceError } from "../errors/index.js";

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
    this.resolver = new Resolver();
    this.lifecycle = parent ? parent.lifecycle.createChild() : new LifecycleManager();
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

    const definition = Registry.createDefinition(token, target, opts);
    this.registry.register(definition);
  }

  /**
   * Register a value directly
   */
  registerValue<T>(token: Token<T>, value: T): void {
    const definition = Registry.createDefinition(token, value, {
      lifetime: Lifetime.Singleton,
    });
    this.registry.register(definition);
  }

  /**
   * Register a factory function
   */
  registerFactory<T>(token: Token<T>, factory: Factory<T>, options?: RegistrationOptions): void {
    const definition = Registry.createDefinition(token, factory, options);
    this.registry.register(definition);
  }

  /**
   * Register an async factory function
   */
  registerAsyncFactory<T>(token: Token<T>, factory: AsyncFactory<T>, options?: RegistrationOptions): void {
    const definition = Registry.createDefinition(token, factory, options);
    this.registry.register(definition);
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
    if (this.registry.has(token)) {
      return true;
    }
    return this.parent?.has(token) ?? false;
  }

  /**
   * Resolve a service instance
   */
  resolve<T>(token: Token<T>, stack: Set<Token> = new Set()): T {
    const definition = this.getDefinition(token);

    if (!definition) {
      throw new UnregisteredServiceError(token);
    }

    // For singletons, always resolve from the container that owns the registration
    if (definition.lifetime === Lifetime.Singleton && !this.registry.has(token) && this.parent) {
      return (this.parent as any).resolve(token, stack);
    }

    return this.lifecycle.applyLifetime(definition.lifetime, token, () =>
      this.resolver.resolve(token, definition, this, new Map(), stack),
    );
  }

  /**
   * Resolve a service instance asynchronously
   */
  async resolveAsync<T>(token: Token<T>, stack: Set<Token> = new Set()): Promise<T> {
    const definition = this.getDefinition(token);

    if (!definition) {
      throw new UnregisteredServiceError(token);
    }

    // For singletons, always resolve from the container that owns the registration
    if (definition.lifetime === Lifetime.Singleton && !this.registry.has(token) && this.parent) {
      return (this.parent as any).resolveAsync(token, stack);
    }

    return this.lifecycle.applyLifetimeAsync(definition.lifetime, token, () =>
      this.resolver.resolveAsync(token, definition, this, new Map(), stack),
    );
  }

  /**
   * Resolve all implementations of a service
   */
  resolveAll<T>(token: Token<T>, stack: Set<Token> = new Set()): T[] {
    const definitions = this.registry.getAll(token);

    if (definitions.length === 0 && this.parent) {
      return (this.parent as any).resolveAll(token, stack);
    }

    return definitions.map((definition) =>
      this.lifecycle.applyLifetime(definition.lifetime, definition.token, () =>
        this.resolver.resolve(definition.token, definition, this, new Map(), stack),
      ),
    );
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
    await this.lifecycle.dispose();
    this.registry.clear();
  }

  /**
   * Get service definition from registry or parent
   */
  private getDefinition<T>(token: Token<T>): ServiceDefinition<T> | undefined {
    const definition = this.registry.get(token);

    if (definition) {
      return definition;
    }

    if (this.parent) {
      return this.parent["getDefinition"](token);
    }

    return undefined;
  }
}

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
