import type {
  Token,
  ServiceDefinition,
  IContainer,
  Constructor,
  Factory,
  AsyncFactory,
  RegistrationOptions,
} from "../types/index.js";
import { CircularDependencyError, UnregisteredServiceError, ResolutionError } from "../errors/index.js";

/**
 * Maximum depth for dependency resolution to prevent stack overflow attacks
 * This prevents DoS attacks via deeply nested legitimate dependency chains
 */
const MAX_RESOLUTION_DEPTH = 100;

/**
 * Container contract used internally: the public API plus the resolution stack
 * that is threaded through nested resolutions for circular dependency detection.
 */
interface StackAwareContainer extends IContainer {
  resolve<T>(token: Token<T>, stack?: Set<Token>): T;
  resolveAsync<T>(token: Token<T>, stack?: Set<Token>): Promise<T>;
  resolveAll<T>(token: Token<T>, stack?: Set<Token>): T[];
  resolveAllAsync<T>(token: Token<T>, stack?: Set<Token>): Promise<T[]>;
}

/**
 * Container view handed to factory functions.
 *
 * Delegates the whole container API while threading the current resolution stack
 * into nested resolutions, so cycles that go through factories are detected.
 * The stack is created lazily: factories that resolve nothing allocate nothing.
 */
class FactoryContext implements IContainer {
  /** True while the factory that received this context is still running */
  private active = true;

  constructor(
    private readonly container: StackAwareContainer,
    private stack: Set<Token> | undefined,
    private readonly token: Token,
  ) {}

  /**
   * Detach from the resolution that created this context. A factory may keep the
   * context (e.g. inside a lazy getter); later calls then start a fresh resolution
   * instead of seeing tokens of a long finished one as still "in progress".
   */
  release(): void {
    this.active = false;
    this.stack = undefined;
  }

  private ensureStack(): Set<Token> | undefined {
    if (this.stack === undefined && this.active) {
      this.stack = new Set<Token>().add(this.token);
    }
    return this.stack;
  }

  resolve<T>(token: Token<T>): T {
    return this.container.resolve(token, this.ensureStack());
  }

  resolveAsync<T>(token: Token<T>): Promise<T> {
    return this.container.resolveAsync(token, this.ensureStack());
  }

  resolveAll<T>(token: Token<T>): T[] {
    return this.container.resolveAll(token, this.ensureStack());
  }

  resolveAllAsync<T>(token: Token<T>): Promise<T[]> {
    return this.container.resolveAllAsync(token, this.ensureStack());
  }

  tryResolve<T>(token: Token<T>): T | undefined {
    return this.container.has(token) ? this.resolve(token) : undefined;
  }

  async tryResolveAsync<T>(token: Token<T>): Promise<T | undefined> {
    return this.container.has(token) ? this.resolveAsync(token) : undefined;
  }

  has(token: Token): boolean {
    return this.container.has(token);
  }

  register<T>(
    token: Token<T> | Constructor<T>,
    targetOrOptions?: Constructor<T> | Factory<T> | RegistrationOptions,
    options?: RegistrationOptions,
  ): void {
    (this.container.register as Function).call(this.container, token, targetOrOptions, options);
  }

  registerValue<T>(token: Token<T>, value: T, options?: RegistrationOptions): void {
    this.container.registerValue(token, value, options);
  }

  registerFactory<T>(token: Token<T>, factory: Factory<T>, options?: RegistrationOptions): void {
    this.container.registerFactory(token, factory, options);
  }

  registerAsyncFactory<T>(token: Token<T>, factory: AsyncFactory<T>, options?: RegistrationOptions): void {
    this.container.registerAsyncFactory(token, factory, options);
  }

  registerAll<T>(token: Token<T>, implementations: Constructor<T>[], options?: RegistrationOptions): void {
    this.container.registerAll(token, implementations, options);
  }

  validate(): void {
    this.container.validate();
  }

  createScope(): IContainer {
    return this.container.createScope();
  }

  dispose(): Promise<void> {
    return this.container.dispose();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.container.dispose();
  }
}

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
    _instanceCache?: Map<Token, any>,
    stack?: Set<Token>,
  ): T {
    // Handle value (already instantiated)
    if (definition.isValue || typeof definition.target !== "function") {
      return definition.target as T;
    }

    if (stack !== undefined) {
      this.guard(token, stack);
    }

    // Handle factory functions
    if (definition.isFactory) {
      if (definition.isAsync) {
        throw new ResolutionError(token, "Async factory must be resolved using resolveAsync()");
      }
      const context = new FactoryContext(container as StackAwareContainer, stack, token);
      stack?.add(token);
      try {
        return (definition.target as Factory<T>)(context);
      } finally {
        stack?.delete(token);
        context.release();
      }
    }

    const Constructor = definition.target as Constructor<T>;
    const dependencies = definition.dependencies;
    const count = dependencies.length;

    // Leaf services need no stack bookkeeping at all
    if (count === 0) {
      return new Constructor();
    }

    const optional = definition.optional;
    const args = new Array(count);
    stack ??= new Set();
    stack.add(token);
    try {
      for (let i = 0; i < count; i++) {
        const depToken = dependencies[i] as Token;
        if (optional !== undefined && optional[i] === true && !container.has(depToken)) {
          args[i] = undefined;
          continue;
        }
        try {
          // Pass the stack to the container for recursive resolution
          args[i] = (container as StackAwareContainer).resolve(depToken, stack);
        } catch (error) {
          if (error instanceof UnregisteredServiceError) {
            throw new ResolutionError(token, `Missing dependency: ${this.tokenToString(depToken)}`, error);
          }
          throw error;
        }
      }

      // Create instance
      return new Constructor(...args);
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
    _instanceCache?: Map<Token, any>,
    stack?: Set<Token>,
  ): Promise<T> {
    // Handle value (already instantiated)
    if (definition.isValue || typeof definition.target !== "function") {
      return definition.target as T;
    }

    if (stack !== undefined) {
      this.guard(token, stack);
    }

    const isFactory = definition.isFactory || definition.isAsync;
    const dependencies = definition.dependencies;
    const count = dependencies.length;

    if (!isFactory && count === 0) {
      return new (definition.target as Constructor<T>)();
    }

    // Sibling dependencies resolve concurrently, so each branch of an async
    // resolution owns a private copy of the path. Sharing one mutable stack would
    // let siblings see each other's in-flight tokens and report false cycles.
    const branch = new Set(stack).add(token);

    if (isFactory) {
      const context = new FactoryContext(container as StackAwareContainer, branch, token);
      try {
        return (await (definition.target as AsyncFactory<T>)(context)) as T;
      } finally {
        context.release();
      }
    }

    const optional = definition.optional;
    const pending = new Array<Promise<unknown> | undefined>(count);
    for (let i = 0; i < count; i++) {
      const depToken = dependencies[i] as Token;
      if (optional !== undefined && optional[i] === true && !container.has(depToken)) {
        pending[i] = undefined;
        continue;
      }
      pending[i] = this.resolveDependencyAsync(token, depToken, container as StackAwareContainer, branch);
    }

    const args = await Promise.all(pending);

    // Create instance
    return new (definition.target as Constructor<T>)(...args);
  }

  /**
   * Clear resolution stack (useful for testing)
   */
  clear(): void {
    // This method exists for backward compatibility with tests
    // The stack is now managed per-resolution, so there's nothing to clear
  }

  private async resolveDependencyAsync(
    token: Token,
    depToken: Token,
    container: StackAwareContainer,
    stack: Set<Token>,
  ): Promise<unknown> {
    try {
      return await container.resolveAsync(depToken, stack);
    } catch (error) {
      if (error instanceof UnregisteredServiceError) {
        throw new ResolutionError(token, `Missing dependency: ${this.tokenToString(depToken)}`, error);
      }
      throw error;
    }
  }

  /**
   * Reject circular dependencies and excessive dependency depth (DoS prevention)
   */
  private guard(token: Token, stack: Set<Token>): void {
    if (stack.has(token)) {
      throw new CircularDependencyError([...stack, token]);
    }

    if (stack.size >= MAX_RESOLUTION_DEPTH) {
      throw new ResolutionError(
        token,
        `Maximum dependency depth (${MAX_RESOLUTION_DEPTH}) exceeded. This may indicate a misconfigured dependency chain or an attack attempt.`,
      );
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
}
