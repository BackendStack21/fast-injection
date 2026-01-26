import type { Token } from "../types/index.js";
import { Lifetime, METADATA_KEYS } from "../types/index.js";

// Polyfill for reflect-metadata methods
const metadataStore = new WeakMap<Object, Map<string | symbol, any>>();

function defineMetadata(key: string | symbol, value: any, target: Object): void {
  if (!metadataStore.has(target)) {
    metadataStore.set(target, new Map());
  }
  metadataStore.get(target)!.set(key, value);
}

function getMetadata(key: string | symbol, target: Object): any {
  return metadataStore.get(target)?.get(key);
}

/**
 * Get decorator metadata (exported for use by Registry)
 */
export function getDecoratorMetadata(key: string | symbol, target: Object): any {
  return getMetadata(key, target);
}

/**
 * Clear decorator metadata for a target class.
 *
 * This function removes all decorator metadata associated with a class.
 * Useful for cleaning up dynamically created classes to prevent memory leaks,
 * as the inner Map in the WeakMap metadata store won't be garbage collected
 * automatically even after the class reference is lost.
 *
 * @param target - The class to clear metadata for
 *
 * @example
 * ```typescript
 * @singleton()
 * class DynamicService {}
 *
 * // Later, when the class is no longer needed
 * clearDecoratorMetadata(DynamicService);
 * ```
 *
 * @example
 * ```typescript
 * // In a test cleanup
 * afterEach(() => {
 *   clearDecoratorMetadata(TestService);
 * });
 * ```
 */
export function clearDecoratorMetadata(target: Object): void {
  metadataStore.delete(target);
}

/**
 * Mark a class as injectable and eligible for dependency injection.
 *
 * This decorator registers metadata on the class, indicating it can be instantiated
 * by the container. While not strictly required for basic usage, it's recommended
 * for explicit declaration and better IDE support.
 *
 * @returns Class decorator that marks the class as injectable
 *
 * @example
 * ```typescript
 * @injectable()
 * class UserService {
 *   constructor(private db: Database, private logger: Logger) {}
 *
 *   async getUser(id: string) {
 *     this.logger.log(`Fetching user ${id}`);
 *     return this.db.users.findById(id);
 *   }
 * }
 *
 * container.register(Database);
 * container.register(Logger);
 * container.register(UserService);
 * const service = container.resolve(UserService);
 * ```
 *
 * @example
 * ```typescript
 * // Combining with explicit lifetime decorators
 * @injectable()
 * class RequestHandler {
 *   constructor(private service: UserService) {}
 * }
 * ```
 */
export function injectable(): ClassDecorator {
  return function (target: Function) {
    defineMetadata(METADATA_KEYS.INJECTABLE, true, target);
    return target as any;
  };
}

/**
 * Explicitly specify a token for constructor parameter injection.
 *
 * Use this decorator when TypeScript's automatic type detection isn't sufficient,
 * such as when using interfaces, abstract classes, or string/symbol tokens.
 * The decorator is applied to constructor parameters to override default resolution.
 *
 * @param token - The token to use for resolving this dependency
 * @returns Parameter decorator that specifies the injection token
 *
 * @example
 * ```typescript
 * // Injecting with string tokens
 * class UserService {
 *   constructor(
 *     @inject('IDatabase') private db: Database,
 *     @inject('ILogger') private logger: Logger
 *   ) {}
 * }
 *
 * container.register('IDatabase', PostgresDatabase);
 * container.register('ILogger', ConsoleLogger);
 * container.register(UserService);
 * ```
 *
 * @example
 * ```typescript
 * // Injecting with symbol tokens
 * const DB_TOKEN = Symbol('database');
 * const CACHE_TOKEN = Symbol('cache');
 *
 * class Repository {
 *   constructor(
 *     @inject(DB_TOKEN) private db: Database,
 *     @inject(CACHE_TOKEN) private cache: Cache
 *   ) {}
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Abstract class injection
 * abstract class Logger {
 *   abstract log(msg: string): void;
 * }
 *
 * class ConsoleLogger extends Logger {
 *   log(msg: string) { console.log(msg); }
 * }
 *
 * class UserService {
 *   constructor(@inject(Logger) private logger: Logger) {}
 * }
 *
 * container.register(Logger, ConsoleLogger);
 * container.register(UserService);
 * ```
 */
export function inject(token: Token): ParameterDecorator {
  return function (target: Object, _propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingInjections = getMetadata(METADATA_KEYS.INJECT, target) || [];
    existingInjections[parameterIndex] = token;
    defineMetadata(METADATA_KEYS.INJECT, existingInjections, target);
  };
}

/**
 * Mark a class as a singleton service with a single shared instance.
 *
 * Singleton services are instantiated once and reused for all subsequent resolutions.
 * This decorator automatically marks the class as injectable and sets its lifetime
 * to Singleton. Ideal for stateful services, configuration, or expensive resources.
 *
 * @returns Class decorator that marks the class as singleton
 *
 * @example
 * ```typescript
 * @singleton()
 * class DatabaseConnection {
 *   private connection?: Connection;
 *
 *   async connect() {
 *     this.connection = await createConnection();
 *   }
 *
 *   query(sql: string) {
 *     return this.connection!.execute(sql);
 *   }
 * }
 *
 * container.register(DatabaseConnection);
 * const db1 = container.resolve(DatabaseConnection);
 * const db2 = container.resolve(DatabaseConnection);
 * // db1 === db2 (same instance)
 * ```
 *
 * @example
 * ```typescript
 * // Configuration singleton
 * @singleton()
 * class AppConfig {
 *   readonly apiUrl = process.env.API_URL || 'http://localhost';
 *   readonly port = parseInt(process.env.PORT || '3000');
 *   readonly env = process.env.NODE_ENV || 'development';
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Shared cache
 * @singleton()
 * class CacheService {
 *   private cache = new Map<string, any>();
 *
 *   set(key: string, value: any) { this.cache.set(key, value); }
 *   get(key: string) { return this.cache.get(key); }
 * }
 * ```
 */
export function singleton(): ClassDecorator {
  return function (target: Function) {
    defineMetadata(METADATA_KEYS.LIFETIME, Lifetime.Singleton, target);
    defineMetadata(METADATA_KEYS.INJECTABLE, true, target);
    return target as any;
  };
}

/**
 * Mark a class as transient with a new instance created on every resolution.
 *
 * Transient services are never cached or reused. Each call to resolve creates
 * a fresh instance. This decorator automatically marks the class as injectable
 * and sets its lifetime to Transient. Use for stateless services or when
 * isolation between uses is required.
 *
 * @returns Class decorator that marks the class as transient
 *
 * @example
 * ```typescript
 * @transient()
 * class RequestLogger {
 *   private logs: string[] = [];
 *
 *   log(message: string) {
 *     this.logs.push(`${new Date().toISOString()}: ${message}`);
 *   }
 *
 *   getLogs() { return this.logs; }
 * }
 *
 * container.register(RequestLogger);
 * const logger1 = container.resolve(RequestLogger);
 * const logger2 = container.resolve(RequestLogger);
 * // logger1 !== logger2 (different instances)
 * ```
 *
 * @example
 * ```typescript
 * // Command pattern with transient handlers
 * @transient()
 * class CreateUserCommand {
 *   constructor(private db: Database) {}
 *
 *   async execute(userData: UserData) {
 *     return this.db.users.create(userData);
 *   }
 * }
 *
 * // Each command execution gets a fresh handler
 * const cmd1 = container.resolve(CreateUserCommand);
 * await cmd1.execute(user1Data);
 *
 * const cmd2 = container.resolve(CreateUserCommand);
 * await cmd2.execute(user2Data);
 * ```
 *
 * @example
 * ```typescript
 * // Temporary buffer for data processing
 * @transient()
 * class DataBuffer {
 *   private buffer: any[] = [];
 *
 *   add(item: any) { this.buffer.push(item); }
 *   flush() { return this.buffer.splice(0); }
 * }
 * ```
 */
export function transient(): ClassDecorator {
  return function (target: Function) {
    defineMetadata(METADATA_KEYS.LIFETIME, Lifetime.Transient, target);
    defineMetadata(METADATA_KEYS.INJECTABLE, true, target);
    return target as any;
  };
}

/**
 * Mark a class as scoped with one instance per scope (child container).
 *
 * Scoped services are instantiated once per scope and reused within that scope,
 * but isolated across different scopes. This decorator automatically marks the
 * class as injectable and sets its lifetime to Scoped. Perfect for request-scoped
 * services in web applications or transaction boundaries.
 *
 * @returns Class decorator that marks the class as scoped
 *
 * @example
 * ```typescript
 * @scoped()
 * class RequestContext {
 *   constructor(
 *     @inject('requestId') public requestId: string,
 *     @inject('userId') public userId: string
 *   ) {}
 *
 *   log(message: string) {
 *     console.log(`[${this.requestId}] [${this.userId}] ${message}`);
 *   }
 * }
 *
 * // In web application
 * app.use((req, res, next) => {
 *   req.scope = container.createScope();
 *   req.scope.registerValue('requestId', req.id);
 *   req.scope.registerValue('userId', req.user.id);
 *   next();
 * });
 *
 * app.get('/api/data', (req, res) => {
 *   const ctx1 = req.scope.resolve(RequestContext);
 *   const ctx2 = req.scope.resolve(RequestContext);
 *   // ctx1 === ctx2 (same within scope)
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Database transaction scope
 * @scoped()
 * class UnitOfWork {
 *   private transaction?: Transaction;
 *
 *   async begin() {
 *     this.transaction = await db.beginTransaction();
 *   }
 *
 *   async commit() {
 *     await this.transaction?.commit();
 *   }
 *
 *   async rollback() {
 *     await this.transaction?.rollback();
 *   }
 * }
 *
 * const scope = container.createScope();
 * const uow = scope.resolve(UnitOfWork);
 * await uow.begin();
 * // ... perform operations within transaction
 * await uow.commit();
 * ```
 *
 * @example
 * ```typescript
 * // Request-scoped cache
 * @scoped()
 * class RequestCache {
 *   private cache = new Map<string, any>();
 *
 *   get(key: string) { return this.cache.get(key); }
 *   set(key: string, value: any) { this.cache.set(key, value); }
 * }
 * ```
 */
export function scoped(): ClassDecorator {
  return function (target: Function) {
    defineMetadata(METADATA_KEYS.LIFETIME, Lifetime.Scoped, target);
    defineMetadata(METADATA_KEYS.INJECTABLE, true, target);
    return target as any;
  };
}
