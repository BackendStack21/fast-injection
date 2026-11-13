import {
  Token,
  Dependency,
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
    // Only string tokens can collide with reserved property names. Stringifying
    // class or symbol tokens would be wasted work (a class stringifies to its source).
    if (typeof token === "string" && (token === "__proto__" || token === "constructor" || token === "prototype")) {
      throw new RegistrationError(token, "Token name is reserved and cannot be used for security reasons");
    }
  }

  /**
   * Register a service definition
   */
  register<T>(definition: ServiceDefinition<T>): void {
    Registry.validateToken(definition.token);
    const { token, replace = false } = definition;

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
   * Check if a token has multi-registrations
   */
  hasMulti(token: Token): boolean {
    return this.multiServices.has(token);
  }

  /**
   * Iterate over every definition (single and multi registrations)
   */
  *definitions(): IterableIterator<ServiceDefinition> {
    yield* this.services.values();
    for (const group of this.multiServices.values()) {
      yield* group;
    }
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
   * Create a service definition for a pre-built value.
   * The value is returned as-is on resolution, even when it is a function or a class.
   */
  static createValueDefinition<T>(token: Token<T>, value: T, options: RegistrationOptions = {}): ServiceDefinition<T> {
    return {
      token,
      target: value,
      lifetime: Lifetime.Singleton,
      isFactory: false,
      isAsync: false,
      isValue: true,
      dependencies: [],
      replace: options.replace === true,
    };
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
    const isConstructor = typeof target === "function" && !!target.prototype;
    const isFactory = typeof target === "function" && !isConstructor;
    const isAsync = isFactory && target.constructor.name === "AsyncFunction";

    // Determine lifetime: explicit option > decorator metadata > default
    let lifetime = options.lifetime;
    if (lifetime === undefined) {
      lifetime = (isConstructor && getDecoratorMetadata(METADATA_KEYS.LIFETIME, target)) || Lifetime.Transient;
    }

    const definition: ServiceDefinition<T> = {
      token,
      target,
      lifetime: lifetime as Lifetime,
      isFactory,
      isAsync,
      dependencies: [],
      replace: options.replace === true,
    };

    if (isConstructor) {
      Registry.assignDependencies(definition, target as Constructor<T>, options.dependencies);
    }

    return definition;
  }

  /**
   * Resolve the constructor dependencies of a definition.
   * Precedence: explicit `dependencies` option > `@inject` > `design:paramtypes`.
   */
  private static assignDependencies<T>(
    definition: ServiceDefinition<T>,
    constructor: Constructor<T>,
    explicit: Dependency[] | undefined,
  ): void {
    if (explicit !== undefined) {
      if (!Array.isArray(explicit)) {
        throw new RegistrationError(definition.token, "dependencies must be an array of tokens");
      }

      const tokens: Token[] = new Array(explicit.length);
      let optional: boolean[] | undefined;
      for (let i = 0; i < explicit.length; i++) {
        const dependency = explicit[i];
        if (dependency !== null && typeof dependency === "object") {
          tokens[i] = dependency.token;
          if (dependency.optional) {
            (optional ??= [])[i] = true;
          }
        } else {
          tokens[i] = dependency as Token;
        }
        if (tokens[i] === undefined || tokens[i] === null) {
          throw new RegistrationError(definition.token, `dependency at index ${i} has no token`);
        }
      }
      definition.dependencies = tokens;
      definition.optional = optional;
      return;
    }

    definition.dependencies = Registry.extractDependencies(constructor);
    const optionalFlags = getDecoratorMetadata(METADATA_KEYS.OPTIONAL, constructor);
    if (Array.isArray(optionalFlags)) {
      definition.optional = optionalFlags.slice();
    }
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
