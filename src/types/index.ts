/**
 * Base constructor type for classes that can be instantiated.
 *
 * This type represents any class constructor that can create instances of type T.
 * It accepts any number of arguments and returns an instance of type T.
 *
 * @template T - The type of instance the constructor creates
 *
 * @example
 * ```typescript
 * class UserService {
 *   constructor(private logger: Logger) {}
 * }
 *
 * const constructor: Constructor<UserService> = UserService;
 * const instance = new constructor(logger);
 * ```
 *
 * @example
 * ```typescript
 * // Used in container registration
 * container.register<UserService>(UserService);
 * ```
 */
export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Abstract constructor type for abstract classes that cannot be directly instantiated.
 *
 * This type represents abstract class constructors that define a contract for derived classes.
 * Abstract classes cannot be instantiated directly but can be used as tokens for dependency injection.
 *
 * @template T - The type that the abstract constructor defines
 *
 * @example
 * ```typescript
 * abstract class BaseService {
 *   abstract execute(): void;
 * }
 *
 * class ConcreteService extends BaseService {
 *   execute() { console.log('executed'); }
 * }
 *
 * // Register concrete implementation for abstract class
 * container.register<BaseService>(BaseService, ConcreteService);
 * const service = container.resolve(BaseService); // Returns ConcreteService instance
 * ```
 */
export type AbstractConstructor<T = any> = abstract new (...args: any[]) => T;

/**
 * Token used to uniquely identify and retrieve services from the dependency injection container.
 *
 * Tokens provide a flexible way to reference services. They can be:
 * - **String**: Simple string identifiers (e.g., 'database', 'logger')
 * - **Symbol**: Unique symbols for guaranteed uniqueness (e.g., Symbol.for('cache'))
 * - **Constructor**: Class constructors as self-documenting tokens
 *
 * @template T - The type of service this token represents
 *
 * @example
 * ```typescript
 * // Using class constructor as token
 * class UserService {}
 * container.register(UserService);
 * const service = container.resolve(UserService);
 * ```
 *
 * @example
 * ```typescript
 * // Using string token
 * container.register('logger', ConsoleLogger);
 * const logger = container.resolve<Logger>('logger');
 * ```
 *
 * @example
 * ```typescript
 * // Using symbol token for guaranteed uniqueness
 * const DATABASE_TOKEN = Symbol('database');
 * container.register(DATABASE_TOKEN, PostgresDatabase);
 * const db = container.resolve<Database>(DATABASE_TOKEN);
 * ```
 */
export type Token<T = any> = string | symbol | Constructor<T>;

/**
 * Service lifetime options that control instance creation and caching strategies.
 *
 * Determines how and when service instances are created and whether they are reused:
 * - **Singleton**: One instance shared across the entire container hierarchy
 * - **Transient**: New instance created every time the service is resolved
 * - **Scoped**: One instance per scope (child container), ideal for request-scoped services
 *
 * @example
 * ```typescript
 * // Singleton - shared database connection
 * container.register(DatabaseConnection, { lifetime: Lifetime.Singleton });
 * const db1 = container.resolve(DatabaseConnection);
 * const db2 = container.resolve(DatabaseConnection);
 * // db1 === db2 (same instance)
 * ```
 *
 * @example
 * ```typescript
 * // Transient - new logger per use
 * container.register(RequestLogger, { lifetime: Lifetime.Transient });
 * const logger1 = container.resolve(RequestLogger);
 * const logger2 = container.resolve(RequestLogger);
 * // logger1 !== logger2 (different instances)
 * ```
 *
 * @example
 * ```typescript
 * // Scoped - one per request in web applications
 * container.register(RequestContext, { lifetime: Lifetime.Scoped });
 * const scope1 = container.createScope();
 * const ctx1a = scope1.resolve(RequestContext);
 * const ctx1b = scope1.resolve(RequestContext);
 * // ctx1a === ctx1b (same within scope)
 *
 * const scope2 = container.createScope();
 * const ctx2 = scope2.resolve(RequestContext);
 * // ctx2 !== ctx1a (different across scopes)
 * ```
 */
export enum Lifetime {
  /**
   * Single instance per container - created once and reused for all resolutions.
   * Use for expensive resources like database connections, configuration, or stateful services.
   */
  Singleton = "singleton",

  /**
   * New instance on every resolution - never cached or reused.
   * Use for lightweight, stateless services or when fresh state is required each time.
   */
  Transient = "transient",

  /**
   * Single instance per scope (child container) - isolated per request/operation.
   * Use for request-specific state in web applications or unit-of-work patterns.
   */
  Scoped = "scoped",
}

/**
 * Factory function for creating service instances with access to the container.
 *
 * Factory functions provide complete control over instance creation and allow resolving
 * dependencies manually from the container. They are synchronous and must return the
 * service instance immediately.
 *
 * @template T - The type of service instance the factory creates
 * @param container - The dependency injection container for resolving dependencies
 * @returns The created service instance
 *
 * @example
 * ```typescript
 * // Simple factory
 * container.registerFactory('config', () => {
 *   return { apiUrl: process.env.API_URL, timeout: 5000 };
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Factory with dependencies
 * container.registerFactory('userRepository', (container) => {
 *   const db = container.resolve<Database>('database');
 *   const logger = container.resolve<Logger>(Logger);
 *   return new UserRepository(db, logger);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Conditional instantiation
 * container.registerFactory('cache', (container) => {
 *   const config = container.resolve<Config>('config');
 *   return config.enableCache
 *     ? new RedisCache(config.redisUrl)
 *     : new MemoryCache();
 * });
 * ```
 */
export type Factory<T = any> = (container: IContainer) => T;

/**
 * Asynchronous factory function for creating service instances that require async initialization.
 *
 * Async factories are useful when service creation involves asynchronous operations like
 * network calls, file I/O, or database connections. Must be resolved using `resolveAsync()`.
 *
 * @template T - The type of service instance the factory creates
 * @param container - The dependency injection container for resolving dependencies
 * @returns A Promise that resolves to the created service instance
 *
 * @example
 * ```typescript
 * // Database connection with async initialization
 * container.registerAsyncFactory('database', async (container) => {
 *   const config = container.resolve<Config>('config');
 *   const db = new Database(config.connectionString);
 *   await db.connect();
 *   return db;
 * });
 *
 * const db = await container.resolveAsync<Database>('database');
 * ```
 *
 * @example
 * ```typescript
 * // Loading configuration from remote source
 * container.registerAsyncFactory('remoteConfig', async () => {
 *   const response = await fetch('https://api.example.com/config');
 *   return await response.json();
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Service with async dependencies
 * container.registerAsyncFactory('userService', async (container) => {
 *   const db = await container.resolveAsync<Database>('database');
 *   const cache = await container.resolveAsync<Cache>('cache');
 *   return new UserService(db, cache);
 * });
 * ```
 */
export type AsyncFactory<T = any> = (container: IContainer) => Promise<T>;

/**
 * Options for customizing service registration behavior in the container.
 *
 * These options control how services are registered and managed, including their
 * lifecycle strategy and handling of duplicate registrations.
 *
 * @example
 * ```typescript
 * // Register as singleton with explicit lifetime
 * container.register(DatabaseService, {
 *   lifetime: Lifetime.Singleton
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Replace existing registration
 * container.register('logger', ConsoleLogger);
 * container.register('logger', FileLogger, { replace: true }); // Replaces ConsoleLogger
 * ```
 *
 * @example
 * ```typescript
 * // Register scoped service for request handling
 * container.register(RequestContext, {
 *   lifetime: Lifetime.Scoped
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Transient service created fresh each time
 * container.register(TemporaryBuffer, {
 *   lifetime: Lifetime.Transient
 * });
 * ```
 */
export interface RegistrationOptions {
  /**
   * Service lifetime strategy controlling instance creation and caching.
   *
   * Defaults to Lifetime.Transient if not specified.
   *
   * - Singleton: One instance for the entire container
   * - Transient: New instance every resolution
   * - Scoped: One instance per scope/child container
   */
  lifetime?: Lifetime;

  /**
   * Whether to replace an existing registration for the same token.
   *
   * By default (false), attempting to register the same token twice throws a RegistrationError.
   * Set to true to allow overwriting existing registrations, useful for testing or reconfiguration.
   *
   * @default false
   */
  replace?: boolean;
}

/**
 * Internal service definition stored in the registry containing all metadata needed for resolution.
 *
 * This interface represents the complete specification of how a service should be created,
 * cached, and injected. It is created automatically during registration and used by the
 * resolver to instantiate services correctly.
 *
 * @template T - The type of service instance this definition describes
 *
 * @example
 * ```typescript
 * // Internal structure created when registering a class
 * const definition: ServiceDefinition<UserService> = {
 *   token: UserService,
 *   target: UserService,
 *   lifetime: Lifetime.Singleton,
 *   isFactory: false,
 *   isAsync: false,
 *   dependencies: [Database, Logger] // Auto-detected from constructor
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Definition for a factory function
 * const definition: ServiceDefinition<Config> = {
 *   token: 'config',
 *   target: (container) => loadConfig(),
 *   lifetime: Lifetime.Singleton,
 *   isFactory: true,
 *   isAsync: false,
 *   dependencies: []
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Definition for an async factory
 * const definition: ServiceDefinition<Database> = {
 *   token: 'database',
 *   target: async (container) => {
 *     const db = new Database();
 *     await db.connect();
 *     return db;
 *   },
 *   lifetime: Lifetime.Singleton,
 *   isFactory: true,
 *   isAsync: true,
 *   dependencies: []
 * };
 * ```
 */
export interface ServiceDefinition<T = any> {
  /**
   * Token uniquely identifying this service in the container.
   * Used as the key for registration and resolution.
   */
  token: Token<T>;

  /**
   * The actual implementation: constructor, factory function, or pre-instantiated value.
   *
   * - Constructor: Class that will be instantiated with `new`
   * - Factory: Function that returns the service instance
   * - AsyncFactory: Async function that returns a Promise of the instance
   * - Value: Pre-created instance registered directly
   */
  target: Constructor<T> | Factory<T> | AsyncFactory<T> | T;

  /**
   * Lifecycle strategy controlling how instances are created and cached.
   * Determines whether instances are reused (Singleton, Scoped) or recreated (Transient).
   */
  lifetime: Lifetime;

  /**
   * Indicates if the target is a factory function rather than a constructor.
   * Factory functions have direct control over instance creation.
   */
  isFactory: boolean;

  /**
   * Indicates if the target is an async factory that returns a Promise.
   * Async factories must be resolved using `resolveAsync()` instead of `resolve()`.
   */
  isAsync: boolean;

  /**
   * Array of dependency tokens required by this service.
   *
   * For constructors: auto-detected from constructor parameters or @inject decorators
   * For factories: typically empty unless manually specified
   * For values: always empty
   */
  dependencies: Token[];
}

/**
 * Lifecycle interface for services that need initialization or cleanup hooks.
 *
 * Implement this interface on your service classes to receive callbacks when the service
 * is initialized or when the container is disposed. Both methods are optional and can be
 * synchronous or asynchronous.
 *
 * **Lifecycle execution order:**
 * 1. Service constructor is called
 * 2. `onInit()` is called (if implemented)
 * 3. Service is used throughout its lifetime
 * 4. `onDispose()` is called when container.dispose() is invoked
 *
 * @example
 * ```typescript
 * class DatabaseService implements Lifecycle {
 *   private connection?: Connection;
 *
 *   constructor(private config: Config) {}
 *
 *   async onInit() {
 *     // Initialize async resources after construction
 *     this.connection = await createConnection(this.config.dbUrl);
 *     console.log('Database connected');
 *   }
 *
 *   async onDispose() {
 *     // Clean up resources when container is disposed
 *     await this.connection?.close();
 *     console.log('Database disconnected');
 *   }
 *
 *   query(sql: string) {
 *     return this.connection!.execute(sql);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * class FileLogger implements Lifecycle {
 *   private stream?: WriteStream;
 *
 *   onInit() {
 *     this.stream = fs.createWriteStream('app.log', { flags: 'a' });
 *   }
 *
 *   onDispose() {
 *     this.stream?.end();
 *   }
 *
 *   log(message: string) {
 *     this.stream?.write(message + '\n');
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Using with the container
 * const container = new Container();
 * container.register(DatabaseService);
 *
 * const db = await container.resolveAsync(DatabaseService);
 * // onInit() has been called, database is ready
 *
 * await container.dispose();
 * // onDispose() has been called, resources cleaned up
 * ```
 */
export interface Lifecycle {
  /**
   * Called automatically after the service instance is created.
   *
   * Use this for async initialization that cannot be done in the constructor,
   * such as establishing connections, loading resources, or starting background tasks.
   *
   * If this method returns a Promise, it will be awaited before the service is considered ready.
   *
   * @returns void or Promise<void> for async initialization
   */
  onInit?(): void | Promise<void>;

  /**
   * Called automatically when the container is disposed.
   *
   * Use this for cleanup operations like closing connections, releasing resources,
   * or stopping background tasks. This ensures graceful shutdown of your application.
   *
   * If this method returns a Promise, it will be awaited during container disposal.
   *
   * @returns void or Promise<void> for async cleanup
   */
  onDispose?(): void | Promise<void>;
}

/**
 * Main dependency injection container interface for registering and resolving services.
 *
 * The container is the central registry for managing service dependencies, lifetimes,
 * and resolution. It supports multiple registration patterns, automatic dependency
 * injection, scoped containers, and lifecycle management.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const container = new Container();
 * container.register(UserService);
 * container.register(DatabaseService, { lifetime: Lifetime.Singleton });
 *
 * const userService = container.resolve(UserService);
 * ```
 *
 * @example
 * ```typescript
 * // With factory functions
 * container.registerFactory('logger', () => new ConsoleLogger());
 * const logger = container.resolve<Logger>('logger');
 * ```
 *
 * @example
 * ```typescript
 * // Scoped containers for request isolation
 * app.use((req, res, next) => {
 *   req.scope = container.createScope();
 *   req.scope.registerValue('requestId', req.id);
 *   next();
 * });
 * ```
 */
export interface IContainer {
  /**
   * Register a service class for automatic dependency resolution.
   *
   * When only a constructor is provided, it's used as both the token and implementation.
   * Dependencies are automatically detected from constructor parameters.
   *
   * @template T - The service type
   * @param token - The constructor to register
   * @param options - Optional registration configuration
   *
   * @example
   * ```typescript
   * class UserService {
   *   constructor(private db: Database) {}
   * }
   *
   * container.register(Database);
   * container.register(UserService); // Database auto-injected
   * const service = container.resolve(UserService);
   * ```
   */
  register<T>(token: Constructor<T>, options?: RegistrationOptions): void;

  /**
   * Register a service with a specific implementation class.
   *
   * Use this overload when you want to register a service using an abstract class,
   * interface token (string/symbol), or when the implementation differs from the token.
   *
   * @template T - The service type
   * @param token - Token to identify the service (string, symbol, or constructor)
   * @param target - The concrete implementation constructor
   * @param options - Optional registration configuration
   *
   * @example
   * ```typescript
   * // Abstract class as token
   * abstract class Logger {
   *   abstract log(msg: string): void;
   * }
   *
   * class ConsoleLogger extends Logger {
   *   log(msg: string) { console.log(msg); }
   * }
   *
   * container.register(Logger, ConsoleLogger);
   * const logger = container.resolve(Logger); // Returns ConsoleLogger
   * ```
   *
   * @example
   * ```typescript
   * // String token for interface-like registration
   * container.register('IDatabase', PostgresDatabase);
   * const db = container.resolve<IDatabase>('IDatabase');
   * ```
   */
  register<T>(token: Token<T>, target: Constructor<T>, options?: RegistrationOptions): void;

  /**
   * Register a service using a factory function.
   *
   * Factory functions provide full control over service instantiation and allow
   * complex initialization logic or conditional creation.
   *
   * @template T - The service type
   * @param token - Token to identify the service
   * @param factory - Function that creates the service instance
   * @param options - Optional registration configuration
   *
   * @example
   * ```typescript
   * // Factory with conditional logic
   * container.register('cache', (container) => {
   *   const config = container.resolve<Config>('config');
   *   return config.useRedis
   *     ? new RedisCache(config.redis)
   *     : new MemoryCache();
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Factory resolving dependencies
   * container.register('repository', (container) => {
   *   const db = container.resolve<Database>('database');
   *   const cache = container.resolve<Cache>('cache');
   *   return new CachedRepository(db, cache);
   * });
   * ```
   */
  register<T>(token: Token<T>, factory: Factory<T>, options?: RegistrationOptions): void;

  /**
   * Register a pre-instantiated value as a singleton.
   *
   * Use this for configuration objects, constants, or pre-created instances
   * that should be shared throughout the application.
   *
   * @template T - The value type
   * @param token - Token to identify the value
   * @param value - The pre-instantiated value
   *
   * @example
   * ```typescript
   * const config = { apiUrl: 'https://api.example.com', timeout: 5000 };
   * container.registerValue('config', config);
   * const resolvedConfig = container.resolve<Config>('config');
   * // resolvedConfig === config
   * ```
   *
   * @example
   * ```typescript
   * // Register environment variables
   * container.registerValue('PORT', process.env.PORT || 3000);
   * container.registerValue('NODE_ENV', process.env.NODE_ENV || 'development');
   * ```
   */
  registerValue<T>(token: Token<T>, value: T): void;

  /**
   * Register a synchronous factory function.
   *
   * Explicit method for registering factory functions. Equivalent to using
   * `register()` with a factory, but more self-documenting in code.
   *
   * @template T - The service type
   * @param token - Token to identify the service
   * @param factory - Function that creates the service instance
   * @param options - Optional registration configuration
   *
   * @example
   * ```typescript
   * container.registerFactory('timestamp', () => Date.now(), {
   *   lifetime: Lifetime.Transient // New timestamp each time
   * });
   *
   * const time1 = container.resolve<number>('timestamp');
   * const time2 = container.resolve<number>('timestamp');
   * // time2 > time1
   * ```
   */
  registerFactory<T>(token: Token<T>, factory: Factory<T>, options?: RegistrationOptions): void;

  /**
   * Register an asynchronous factory function for services requiring async initialization.
   *
   * Use for services that need to perform async operations during creation,
   * such as database connections, API calls, or file I/O. Must be resolved
   * using `resolveAsync()`.
   *
   * @template T - The service type
   * @param token - Token to identify the service
   * @param factory - Async function that creates the service instance
   * @param options - Optional registration configuration
   *
   * @example
   * ```typescript
   * // Database with async connection
   * container.registerAsyncFactory('database', async () => {
   *   const db = new Database('connection-string');
   *   await db.connect();
   *   await db.runMigrations();
   *   return db;
   * }, { lifetime: Lifetime.Singleton });
   *
   * const db = await container.resolveAsync<Database>('database');
   * ```
   *
   * @example
   * ```typescript
   * // Load remote configuration
   * container.registerAsyncFactory('config', async () => {
   *   const response = await fetch('https://config.example.com/app');
   *   return await response.json();
   * });
   * ```
   */
  registerAsyncFactory<T>(token: Token<T>, factory: AsyncFactory<T>, options?: RegistrationOptions): void;

  /**
   * Check if a service is registered in the container.
   *
   * Useful for conditional registration or checking availability before resolution.
   *
   * @param token - The token to check
   * @returns true if the service is registered, false otherwise
   *
   * @example
   * ```typescript
   * if (!container.has('logger')) {
   *   container.register('logger', ConsoleLogger);
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Conditional feature enablement
   * if (container.has('cache')) {
   *   const cache = container.resolve<Cache>('cache');
   *   cache.warm();
   * }
   * ```
   */
  has(token: Token): boolean;

  /**
   * Resolve and return a service instance synchronously.
   *
   * Creates a new instance or returns a cached instance based on the service's
   * lifetime. Automatically resolves and injects all dependencies. Throws if
   * the service is not registered or if dependencies are missing.
   *
   * @template T - The service type
   * @param token - Token identifying the service to resolve
   * @returns The resolved service instance
   * @throws {UnregisteredServiceError} If the service is not registered
   * @throws {CircularDependencyError} If circular dependencies are detected
   * @throws {ResolutionError} If resolution fails for any reason
   *
   * @example
   * ```typescript
   * class UserService {
   *   constructor(private db: Database, private logger: Logger) {}
   * }
   *
   * container.register(Database);
   * container.register(Logger);
   * container.register(UserService);
   *
   * const service = container.resolve(UserService);
   * // UserService instance with Database and Logger injected
   * ```
   *
   * @example
   * ```typescript
   * // Resolve by string token
   * const config = container.resolve<Config>('config');
   * ```
   */
  resolve<T>(token: Token<T>): T;

  /**
   * Resolve and return a service instance asynchronously.
   *
   * Required for services registered with async factories or those with
   * async lifecycle hooks. Can also be used with sync services for consistency.
   *
   * @template T - The service type
   * @param token - Token identifying the service to resolve
   * @returns Promise resolving to the service instance
   * @throws {UnregisteredServiceError} If the service is not registered
   * @throws {CircularDependencyError} If circular dependencies are detected
   * @throws {ResolutionError} If resolution fails for any reason
   *
   * @example
   * ```typescript
   * // Resolve async factory
   * container.registerAsyncFactory('database', async () => {
   *   const db = new Database();
   *   await db.connect();
   *   return db;
   * });
   *
   * const db = await container.resolveAsync<Database>('database');
   * ```
   *
   * @example
   * ```typescript
   * // Service with async onInit
   * class EmailService implements Lifecycle {
   *   async onInit() {
   *     await this.loadTemplates();
   *   }
   * }
   *
   * const email = await container.resolveAsync(EmailService);
   * ```
   */
  resolveAsync<T>(token: Token<T>): Promise<T>;

  /**
   * Resolve all registered implementations for a given token.
   *
   * Useful for plugin architectures or when multiple services implement
   * the same interface. Returns an array of all resolved instances.
   *
   * @template T - The service type
   * @param token - Token identifying the services to resolve
   * @returns Array of all resolved instances
   *
   * @example
   * ```typescript
   * // Plugin system
   * interface Plugin {
   *   name: string;
   *   execute(): void;
   * }
   *
   * container.register('plugin', PluginA);
   * container.register('plugin', PluginB);
   * container.register('plugin', PluginC);
   *
   * const plugins = container.resolveAll<Plugin>('plugin');
   * plugins.forEach(p => p.execute());
   * ```
   *
   * @example
   * ```typescript
   * // Multiple event handlers
   * const handlers = container.resolveAll<EventHandler>('eventHandler');
   * handlers.forEach(h => h.handle(event));
   * ```
   */
  resolveAll<T>(token: Token<T>): T[];

  /**
   * Create a child scoped container that inherits parent registrations.
   *
   * Child containers have their own scope for Scoped-lifetime services while
   * sharing Singleton services with the parent. Perfect for request-scoped
   * services in web applications or transaction boundaries.
   *
   * @returns A new child container with isolated scoped instances
   *
   * @example
   * ```typescript
   * // Web application request handling
   * const appContainer = new Container();
   * appContainer.register(DatabaseService, { lifetime: Lifetime.Singleton });
   * appContainer.register(RequestContext, { lifetime: Lifetime.Scoped });
   *
   * app.use((req, res, next) => {
   *   req.scope = appContainer.createScope();
   *   req.scope.registerValue('requestId', req.id);
   *   req.scope.registerValue('user', req.user);
   *   next();
   * });
   *
   * app.get('/api/users', (req, res) => {
   *   const context = req.scope.resolve(RequestContext);
   *   // context is unique per request
   *   const db = req.scope.resolve(DatabaseService);
   *   // db is shared across all requests (singleton)
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Unit of work pattern
   * const scope = container.createScope();
   * scope.register(UnitOfWork, { lifetime: Lifetime.Scoped });
   *
   * const uow = scope.resolve(UnitOfWork);
   * await uow.beginTransaction();
   * // ... perform operations
   * await uow.commit();
   * await scope.dispose(); // Clean up scoped resources
   * ```
   */
  createScope(): IContainer;

  /**
   * Dispose of all services that implement the Lifecycle interface.
   *
   * Calls `onDispose()` on all services in reverse order of creation.
   * Async dispose methods are awaited. Use during application shutdown
   * for graceful cleanup of resources.
   *
   * @returns Promise that resolves when all services are disposed
   *
   * @example
   * ```typescript
   * // Application shutdown
   * const container = new Container();
   * container.register(DatabaseService);
   * container.register(CacheService);
   * container.register(LoggerService);
   *
   * // On application exit
   * process.on('SIGTERM', async () => {
   *   await container.dispose(); // Closes all connections, flushes logs, etc.
   *   process.exit(0);
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Request cleanup
   * app.use(async (req, res, next) => {
   *   req.scope = container.createScope();
   *   res.on('finish', async () => {
   *     await req.scope.dispose(); // Clean up request-scoped resources
   *   });
   *   next();
   * });
   * ```
   */
  dispose(): Promise<void>;
}

/**
 * Metadata key symbols used internally for decorator metadata storage.
 *
 * These symbols are used by decorators to attach metadata to classes and parameters.
 * The metadata is stored using a WeakMap-based polyfill and retrieved during
 * service registration to determine injection behavior.
 *
 * **Keys:**
 * - `INJECTABLE`: Marks a class as eligible for dependency injection
 * - `INJECT`: Stores explicit injection tokens for constructor parameters
 * - `LIFETIME`: Stores the service lifetime (Singleton, Transient, Scoped)
 * - `DEPENDENCIES`: Stores the list of dependencies for a service
 *
 * @internal This is primarily for internal use by the framework
 *
 * @example
 * ```typescript
 * // How decorators use metadata keys internally
 * import { METADATA_KEYS } from './types';
 *
 * function injectable() {
 *   return function(target: Function) {
 *     defineMetadata(METADATA_KEYS.INJECTABLE, true, target);
 *   };
 * }
 * ```
 */
export const METADATA_KEYS = {
  INJECTABLE: Symbol("injectable"),
  INJECT: Symbol("inject"),
  LIFETIME: Symbol("lifetime"),
  DEPENDENCIES: Symbol("dependencies"),
} as const;
