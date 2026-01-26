import type { Token } from "../types/index.js";

/**
 * Base error class for all dependency injection related errors.
 *
 * This is the parent class for all DI-specific errors. It extends the standard Error
 * class and includes the token that caused the error for better debugging and error handling.
 *
 * @example
 * ```typescript
 * try {
 *   const service = container.resolve(MyService);
 * } catch (error) {
 *   if (error instanceof DependencyError) {
 *     console.error('DI Error:', error.message);
 *     console.error('Token:', error.token);
 *   }
 * }
 * ```
 */
export class DependencyError extends Error {
  constructor(
    message: string,
    public readonly token: Token,
  ) {
    super(message);
    this.name = "DependencyError";

    // Maintain proper stack trace in V8
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a circular dependency is detected during service resolution.
 *
 * Circular dependencies occur when Service A depends on Service B, which depends on Service C,
 * which depends back on Service A (or any other cycle in the dependency chain). This creates
 * an infinite loop during resolution and must be avoided.
 *
 * The error includes the complete dependency chain showing the circular reference.
 *
 * @example
 * ```typescript
 * // This will throw CircularDependencyError
 * class ServiceA {
 *   constructor(private b: ServiceB) {}
 * }
 *
 * class ServiceB {
 *   constructor(private c: ServiceC) {}
 * }
 *
 * class ServiceC {
 *   constructor(private a: ServiceA) {} // Circular!
 * }
 *
 * container.register(ServiceA);
 * container.register(ServiceB);
 * container.register(ServiceC);
 *
 * try {
 *   container.resolve(ServiceA);
 * } catch (error) {
 *   if (error instanceof CircularDependencyError) {
 *     console.error(error.message);
 *     // "Circular dependency detected: ServiceA → ServiceB → ServiceC → ServiceA"
 *     console.error('Chain:', error.chain);
 *     // [ServiceA, ServiceB, ServiceC, ServiceA]
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Solution: Break the cycle with a factory or interface
 * class ServiceA {
 *   constructor(private bFactory: () => ServiceB) {}
 *   getB() { return this.bFactory(); }
 * }
 *
 * container.registerFactory('bFactory', (c) => () => c.resolve(ServiceB));
 * ```
 */
export class CircularDependencyError extends DependencyError {
  constructor(public readonly chain: Token[]) {
    const chainStr = chain.map((token) => (typeof token === "function" ? token.name : String(token))).join(" → ");

    super(`Circular dependency detected: ${chainStr}`, chain[0] as Token);
    this.name = "CircularDependencyError";
  }
}

/**
 * Error thrown when attempting to resolve a service that hasn't been registered.
 *
 * This error indicates that the container doesn't know how to create the requested service.
 * The most common cause is forgetting to register a service or its dependencies before
 * attempting to resolve it.
 *
 * @example
 * ```typescript
 * // This will throw UnregisteredServiceError
 * try {
 *   const service = container.resolve(UserService);
 * } catch (error) {
 *   if (error instanceof UnregisteredServiceError) {
 *     console.error(error.message);
 *     // "Service not registered: UserService. Did you forget to register it?"
 *   }
 * }
 *
 * // Solution: Register the service first
 * container.register(UserService);
 * const service = container.resolve(UserService); // Works now
 * ```
 *
 * @example
 * ```typescript
 * // Missing dependency will also throw this error
 * class UserService {
 *   constructor(private db: Database) {}
 * }
 *
 * container.register(UserService); // Registered
 * // But Database is not registered
 *
 * try {
 *   container.resolve(UserService);
 * } catch (error) {
 *   // ResolutionError wrapping UnregisteredServiceError
 *   console.error('Failed to resolve UserService: Missing dependency: Database');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Check before resolving
 * if (container.has(Logger)) {
 *   const logger = container.resolve(Logger);
 * } else {
 *   console.warn('Logger not available, using console');
 * }
 * ```
 */
export class UnregisteredServiceError extends DependencyError {
  constructor(token: Token) {
    const tokenStr = typeof token === "function" ? token.name : String(token);
    super(`Service not registered: ${tokenStr}. Did you forget to register it?`, token);
    this.name = "UnregisteredServiceError";
  }
}

/**
 * Error thrown when registration fails
 */
export class RegistrationError extends DependencyError {
  constructor(token: Token, reason: string) {
    const tokenStr = typeof token === "function" ? token.name : String(token);
    super(`Failed to register service ${tokenStr}: ${reason}`, token);
    this.name = "RegistrationError";
  }
}

/**
 * Error thrown when service resolution fails for any reason.
 *
 * This error wraps various resolution failures including constructor errors, missing dependencies,
 * factory exceptions, or async resolution issues. It includes the original cause for debugging
 * and provides context about which service failed to resolve.
 *
 * @example
 * ```typescript
 * // Constructor throws an error
 * class DatabaseService {
 *   constructor() {
 *     throw new Error('Invalid connection string');
 *   }
 * }
 *
 * container.register(DatabaseService);
 *
 * try {
 *   container.resolve(DatabaseService);
 * } catch (error) {
 *   if (error instanceof ResolutionError) {
 *     console.error(error.message);
 *     // "Failed to resolve service DatabaseService: ..."
 *     console.error('Cause:', error.cause);
 *     // Original Error: Invalid connection string
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Factory function fails
 * container.registerFactory('config', () => {
 *   const data = JSON.parse(invalidJson); // Throws
 *   return data;
 * });
 *
 * try {
 *   container.resolve('config');
 * } catch (error) {
 *   if (error instanceof ResolutionError) {
 *     console.error('Config resolution failed:', error.cause);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Async factory resolved synchronously
 * container.registerAsyncFactory('database', async () => {
 *   await db.connect();
 *   return db;
 * });
 *
 * try {
 *   container.resolve('database'); // Wrong! Should use resolveAsync
 * } catch (error) {
 *   if (error instanceof ResolutionError) {
 *     console.error(error.message);
 *     // "Failed to resolve service database: Async factory must be resolved using resolveAsync()"
 *   }
 * }
 *
 * // Correct usage
 * const db = await container.resolveAsync('database');
 * ```
 */
export class ResolutionError extends DependencyError {
  public override readonly cause?: Error;

  constructor(token: Token, reason: string, cause?: Error) {
    const tokenStr = typeof token === "function" ? token.name : String(token);
    super(`Failed to resolve service ${tokenStr}: ${reason}`, token);
    this.name = "ResolutionError";
    this.cause = cause;

    if (cause && (Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}
