import {
  Token,
  Constructor,
  ServiceDefinition,
  Factory,
  AsyncFactory,
  Lifetime,
  RegistrationOptions,
  METADATA_KEYS,
} from "../types/index.js";
import { RegistrationError } from "../errors/index.js";
import { getDecoratorMetadata } from "../decorators/index.js";

/**
 * Service registry manages the registration and lookup of services
 */
export class Registry {
  private readonly services = new Map<Token, ServiceDefinition>();
  private readonly multiServices = new Map<Token, ServiceDefinition[]>();

  /**
   * Validate token to prevent prototype pollution attacks
   */
  private static validateToken(token: Token): void {
    const tokenStr = String(token);
    const dangerousTokens = ["__proto__", "constructor", "prototype"];
    if (dangerousTokens.includes(tokenStr)) {
      throw new RegistrationError(token, "Token name is reserved and cannot be used for security reasons");
    }
  }

  /**
   * Register a service definition
   */
  register<T>(definition: ServiceDefinition<T>): void {
    Registry.validateToken(definition.token);
    const { token, replace = false } = definition as ServiceDefinition<T> & {
      replace?: boolean;
    };

    if (this.services.has(token) && !replace) {
      const tokenStr = typeof token === "function" ? token.name : String(token);
      throw new RegistrationError(token, `Service already registered: ${tokenStr}. Use replace: true to override.`);
    }

    this.services.set(token, definition);
  }

  /**
   * Register multiple implementations for a token
   */
  registerMulti<T>(definition: ServiceDefinition<T>): void {
    Registry.validateToken(definition.token);
    const { token } = definition;
    let arr = this.multiServices.get(token);

    if (arr === undefined) {
      arr = [];
      this.multiServices.set(token, arr);
    }

    arr.push(definition);
  }

  /**
   * Check if a service is registered
   */
  has(token: Token): boolean {
    return this.services.has(token);
  }

  /**
   * Get a service definition
   */
  get<T>(token: Token<T>): ServiceDefinition<T> | undefined {
    return this.services.get(token) as ServiceDefinition<T> | undefined;
  }

  /**
   * Get all implementations for a token
   */
  getAll<T>(token: Token<T>): ServiceDefinition<T>[] {
    return (this.multiServices.get(token) as ServiceDefinition<T>[]) || [];
  }

  /**
   * Get all registered tokens
   */
  getTokens(): Token[] {
    return Array.from(this.services.keys());
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
    this.multiServices.clear();
  }

  /**
   * Create a service definition from various input types
   */
  static createDefinition<T>(
    token: Token<T>,
    target: Constructor<T> | Factory<T> | AsyncFactory<T> | T,
    options: RegistrationOptions = {},
  ): ServiceDefinition<T> {
    // Determine if target is a factory
    const isConstructor = typeof target === "function" && target.prototype;
    const isFactory = typeof target === "function" && !isConstructor;
    const isAsync = isFactory && target.constructor.name === "AsyncFunction";

    // Determine lifetime: explicit option > decorator metadata > default
    let lifetime = options.lifetime;
    if (lifetime === undefined && isConstructor) {
      // Check for decorator metadata
      const decoratorLifetime = getDecoratorMetadata(METADATA_KEYS.LIFETIME, target);
      lifetime = decoratorLifetime ?? Lifetime.Transient;
    } else if (lifetime === undefined) {
      lifetime = Lifetime.Transient;
    }

    // Extract dependencies for constructors
    let dependencies: Token[] = [];
    if (isConstructor) {
      dependencies = Registry.extractDependencies(target as Constructor<T>);
    }

    return {
      token,
      target,
      lifetime,
      isFactory,
      isAsync,
      dependencies,
    } as ServiceDefinition<T> & { replace?: boolean };
  }

  /**
   * Extract constructor dependencies using metadata or parameter analysis
   */
  private static extractDependencies<T>(constructor: Constructor<T>): Token[] {
    // First, check for explicit @inject decorators
    const injectMetadata = getDecoratorMetadata(METADATA_KEYS.INJECT, constructor);
    if (injectMetadata && Array.isArray(injectMetadata)) {
      // Filter out undefined values (parameters without @inject decorator)
      const explicitDeps = injectMetadata.filter((token: Token | undefined) => token !== undefined);
      if (explicitDeps.length > 0) {
        // If we have explicit injections, use them
        // Note: This assumes ALL dependencies are decorated if ANY are
        return injectMetadata;
      }
    }

    // Try to get metadata from TypeScript decorators (for decorated classes)
    const metadata = (Reflect as any).getMetadata?.("design:paramtypes", constructor);
    if (metadata) {
      // If we have @inject metadata, merge it with design:paramtypes
      if (injectMetadata && Array.isArray(injectMetadata)) {
        return metadata.map((type: Token, index: number) => {
          // Use explicit @inject token if provided, otherwise use design type
          return injectMetadata[index] ?? type;
        });
      }
      return metadata;
    }

    // Without metadata, we cannot reliably extract constructor dependencies.
    // Users should use decorators (@inject) or explicit registration with dependencies.
    // Previous regex-based parsing was removed due to potential ReDoS vulnerabilities.
    return [];
  }
}
