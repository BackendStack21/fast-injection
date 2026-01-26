import type { Token, ServiceDefinition, IContainer } from "../types/index.js";
import { CircularDependencyError, UnregisteredServiceError, ResolutionError } from "../errors/index.js";

/**
 * Maximum depth for dependency resolution to prevent stack overflow attacks
 * This prevents DoS attacks via deeply nested legitimate dependency chains
 */
const MAX_RESOLUTION_DEPTH = 100;

/**
 * Resolver handles dependency resolution with circular dependency detection
 */
export class Resolver {
  /**
   * Resolve a service with circular dependency detection
   */
  resolve<T>(
    token: Token<T>,
    definition: ServiceDefinition<T>,
    container: IContainer,
    _instanceCache: Map<Token, any>,
    stack: Set<Token> = new Set(),
  ): T {
    // Check for circular dependencies
    if (stack.has(token)) {
      throw new CircularDependencyError([...stack, token]);
    }

    // Check for excessive dependency depth (DoS prevention)
    if (stack.size >= MAX_RESOLUTION_DEPTH) {
      throw new ResolutionError(
        token,
        `Maximum dependency depth (${MAX_RESOLUTION_DEPTH}) exceeded. This may indicate a misconfigured dependency chain or an attack attempt.`,
      );
    }

    try {
      stack.add(token);

      // Handle factory functions
      if (definition.isFactory) {
        if (definition.isAsync) {
          throw new ResolutionError(token, "Async factory must be resolved using resolveAsync()");
        }
        // Create a wrapper container that passes the stack
        const wrappedContainer = this.wrapContainerWithStack(container, stack);
        return (definition.target as Function)(wrappedContainer) as T;
      }

      // Handle value (already instantiated)
      if (typeof definition.target !== "function") {
        return definition.target as T;
      }

      // Resolve constructor dependencies
      const Constructor = definition.target as new (...args: any[]) => T;
      const dependencies = definition.dependencies.map((depToken) => {
        try {
          // Pass the stack to the container for recursive resolution
          return (container as any).resolve(depToken, stack);
        } catch (error) {
          if (error instanceof UnregisteredServiceError) {
            throw new ResolutionError(token, `Missing dependency: ${this.tokenToString(depToken)}`, error as Error);
          }
          throw error;
        }
      });

      // Create instance
      return new Constructor(...dependencies);
    } finally {
      stack.delete(token);
    }
  }

  /**
   * Resolve a service asynchronously
   */
  async resolveAsync<T>(
    token: Token<T>,
    definition: ServiceDefinition<T>,
    container: IContainer,
    _instanceCache: Map<Token, any>,
    stack: Set<Token> = new Set(),
  ): Promise<T> {
    // Check for circular dependencies
    if (stack.has(token)) {
      throw new CircularDependencyError([...stack, token]);
    }

    // Check for excessive dependency depth (DoS prevention)
    if (stack.size >= MAX_RESOLUTION_DEPTH) {
      throw new ResolutionError(
        token,
        `Maximum dependency depth (${MAX_RESOLUTION_DEPTH}) exceeded. This may indicate a misconfigured dependency chain or an attack attempt.`,
      );
    }

    try {
      stack.add(token);

      // Handle async factory functions
      if (definition.isAsync) {
        const wrappedContainer = this.wrapContainerWithStack(container, stack);
        return (await (definition.target as Function)(wrappedContainer)) as T;
      }

      // Handle regular factory functions
      if (definition.isFactory) {
        const wrappedContainer = this.wrapContainerWithStack(container, stack);
        return (definition.target as Function)(wrappedContainer) as T;
      }

      // Handle value (already instantiated)
      if (typeof definition.target !== "function") {
        return definition.target as T;
      }

      // Resolve constructor dependencies
      const Constructor = definition.target as new (...args: any[]) => T;
      const dependencyPromises = definition.dependencies.map(async (depToken) => {
        try {
          // Pass the stack to the container for recursive resolution
          return await (container as any).resolveAsync(depToken, stack);
        } catch (error) {
          if (error instanceof UnregisteredServiceError) {
            throw new ResolutionError(token, `Missing dependency: ${this.tokenToString(depToken)}`, error as Error);
          }
          throw error;
        }
      });

      const dependencies = await Promise.all(dependencyPromises);

      // Create instance
      return new Constructor(...dependencies);
    } finally {
      stack.delete(token);
    }
  }

  /**
   * Convert token to string for error messages
   */
  private tokenToString(token: Token): string {
    if (typeof token === "function") {
      return token.name || "AnonymousClass";
    }
    return String(token);
  }

  /**
   * Wrap container to pass stack through factory function calls
   */
  private wrapContainerWithStack(container: IContainer, stack: Set<Token>): IContainer {
    return {
      ...container,
      resolve: <T>(token: Token<T>) => (container as any).resolve(token, stack),
      resolveAsync: <T>(token: Token<T>) => (container as any).resolveAsync(token, stack),
      resolveAll: <T>(token: Token<T>) => (container as any).resolveAll(token, stack),
    };
  }

  /**
   * Clear resolution stack (useful for testing)
   */
  clear(): void {
    // This method exists for backward compatibility with tests
    // The stack is now managed per-resolution, so there's nothing to clear
  }
}
