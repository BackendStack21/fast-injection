# fast-injection 🚀

Modern, lightweight TypeScript Dependency Injection optimized for Bun runtime.

[![npm version](https://img.shields.io/npm/v/fast-injection)](https://www.npmjs.com/package/fast-injection)
[![Bundle Size](https://img.shields.io/badge/bundle%20size-%3C10KB-brightgreen)](https://github.com/21no-de/fast-injection)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0%2B-orange)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Built with ❤️ by [21no.de](https://21no.de)

## Features

- ⚡ **Blazing Fast**: Sub-microsecond dependency resolution
- 🪶 **Lightweight**: < 10KB minified + gzipped
- 🔒 **Type-Safe**: Full TypeScript support with inference
- 🛡️ **Secure**: Protected against prototype pollution, memory leaks, ReDoS, and DoS attacks
- 🎯 **Zero Dependencies**: No production dependencies
- 🔄 **Multiple Lifetimes**: Singleton, transient, and scoped
- 🎨 **Flexible API**: Decorators, functional, or imperative style
- 🧩 **Decorator-Free Injection**: Declare constructor dependencies at registration, no `reflect-metadata` needed
- 🏷️ **Typed Tokens**: `createToken<T>()` for interfaces and config, inferred on `resolve()`
- ❓ **Optional Dependencies**: `tryResolve()`, `@optional()` and `{ token, optional: true }`
- ✅ **Graph Validation**: `container.validate()` catches missing, circular and captive dependencies at startup
- 🧹 **`await using` Scopes**: Containers implement `Symbol.asyncDispose`
- 🧪 **Testing Friendly**: Built-in testing utilities
- 🔥 **Bun Optimized**: Leverages Bun's native performance

## Performance

Fast-Injection is optimized for speed with minimal overhead. Here are the key performance metrics:

| Operation            | Ops/Second     | Avg Time | Notes                            |
| -------------------- | -------------- | -------- | -------------------------------- |
| **Registration**     |                |          |                                  |
| Register class       | ~7.3M ops/sec  | 0.137µs  | Simple class registration        |
| Register factory     | ~8.9M ops/sec  | 0.112µs  | Factory function registration    |
| Register value       | ~7.4M ops/sec  | 0.135µs  | Direct value registration        |
| **Resolution**       |                |          |                                  |
| Singleton (cached)   | ~89.1M ops/sec | 0.011µs  | 🚀 **Fastest** - cached instance |
| Scoped (cached)      | ~37.4M ops/sec | 0.027µs  | Cached within scope              |
| Transient            | ~36.4M ops/sec | 0.027µs  | New instance each time           |
| Factory              | ~23.6M ops/sec | 0.042µs  | Factory function call            |
| Value                | ~31.3M ops/sec | 0.032µs  | Direct value retrieval           |
| **Async Operations** |                |          |                                  |
| Async factory        | ~2.6M ops/sec  | 0.387µs  | Async initialization             |
| Async with deps      | ~1.5M ops/sec  | 0.665µs  | Async with dependencies          |
| **Scope Management** |                |          |                                  |
| Create scope         | ~27.8M ops/sec | 0.036µs  | Scope creation is O(1)           |
| Scope disposal       | ~6.1M ops/sec  | 0.163µs  | Create and dispose a scope       |

_Measured with `bun run bench` on Bun 1.4.4, macOS arm64. Results vary by machine._

### Key Performance Insights

- **Singleton is ~2.4x faster than Transient**: Use `Lifetime.Singleton` for services that don't need fresh state
- **Minimal overhead**: Only 0.011µs per resolution for singletons
- **Scoped is ideal for requests**: Fast enough for per-request services with proper isolation
- **Security included**: All metrics include thread-safe circular dependency detection and race-condition protection

> 💡 **Performance Tip**: Use `@singleton()` decorator for services like database connections, configuration, and loggers. Reserve `@transient()` for stateful operations where isolation is required.

Run benchmarks yourself: `bun run bench`

## Installation

```bash
bun add fast-injection
```

Requires TypeScript 5.2 or newer (peer dependency): containers expose `Symbol.asyncDispose`, and `await using` needs `"lib": ["ESNext"]` (or `esnext.disposable`) in your `tsconfig.json`.

## Quick Start

### Basic Usage

```typescript
import { Container } from "fast-injection";
import { singleton, inject } from "fast-injection/decorators";

// Step 1: Define your services
// Use @singleton() decorator to mark this class as a singleton
@singleton()
class Database {
  connect() {
    /* ... */
  }
}

// Step 2: Define a service that depends on Database
// Use @inject() to automatically inject dependencies
@singleton()
class UserService {
  constructor(@inject(Database) private db: Database) {}

  getUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

// Step 3: Create a container
const container = new Container();

// Step 4: Register services
// Decorators control lifetime and dependencies
container.register(Database);
container.register(UserService);

// Step 5: Resolve and use your service
// The container will create UserService and inject Database automatically
const userService = container.resolve(UserService);
```

### Lifecycle Hooks (Basic)

```typescript
import { Container } from "fast-injection";

class Cache {
  private store = new Map<string, string>();

  onInit() {
    console.log("Cache initialized");
  }

  onDispose() {
    this.store.clear();
    console.log("Cache disposed and cleared");
  }

  set(key: string, value: string) {
    this.store.set(key, value);
  }

  get(key: string) {
    return this.store.get(key);
  }
}

const c = new Container();
// Register as singleton so onInit/onDispose are called once for the app
c.register(Cache);

const cache = c.resolve(Cache);
cache.set("foo", "bar");
console.log(cache.get("foo")); // -> "bar"

// When finished, dispose the container to run onDispose
await c.dispose();
```

### Advanced: Multiple Lifetimes

```typescript
import { Container } from "fast-injection";
import { singleton, transient, scoped } from "fast-injection/decorators";

// SINGLETON: One instance shared across the entire application
// Perfect for: configuration, database connections, loggers
@singleton()
class Config {
  apiUrl = "https://api.example.com";
}

// TRANSIENT: New instance created every time you resolve it
// Perfect for: stateful operations, request handlers, temporary objects
@transient()
class Logger {
  private id = Math.random(); // Each logger has a unique ID

  log(msg: string) {
    console.log(`[${this.id}] ${msg}`);
  }
}

// SCOPED: One instance per scope (e.g., per HTTP request)
// Perfect for: request-specific data, database transactions
@scoped()
class RequestContext {
  constructor(public requestId: string) {}
}

// Register all services
const container = new Container();
container.register(Config); // Shared singleton
container.register(Logger); // New instance each time
container.register(RequestContext); // One per scope

// Example: Handling an HTTP request
// Create a new scope for each request to isolate request-specific services
const scope = container.createScope();

// All services resolved in this scope share the same RequestContext instance
const ctx1 = scope.resolve(RequestContext);
const ctx2 = scope.resolve(RequestContext);
// ctx1 === ctx2 (same instance within scope)

// But each scope gets its own RequestContext
const anotherScope = container.createScope();
const ctx3 = anotherScope.resolve(RequestContext);
// ctx1 !== ctx3 (different scopes = different instances)
```

### Using @inject for Constructor Injection

```typescript
import { Container } from "fast-injection";
import { singleton, inject } from "fast-injection/decorators";

// Step 1: Define your dependencies
@singleton()
class Database {
  query(sql: string) {
    return `Result of: ${sql}`;
  }
}

@singleton()
class Logger {
  log(msg: string) {
    console.log(`[LOG] ${msg}`);
  }
}

// Step 2: Use @inject decorator to automatically inject dependencies
// The @inject decorator tells the container which dependencies to inject
// and in what order - no need to write a factory function!
@singleton()
class UserService {
  // @inject decorator maps constructor parameters to their types
  // Parameters will be automatically resolved from the container
  constructor(
    @inject(Database) private db: Database,
    @inject(Logger) private logger: Logger,
  ) {
    this.logger.log("UserService initialized");
  }

  getUser(id: string) {
    this.logger.log(`Fetching user ${id}`);
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`);
  }
}

// Step 3: Register all services
const container = new Container();
container.register(Database);
container.register(Logger);

// No factory function needed! The @inject decorators tell the container
// how to construct UserService automatically
container.register(UserService);

// Step 4: Resolve and use - dependencies are injected automatically
const userService = container.resolve(UserService);
const user = userService.getUser("123");

// The power of @inject:
// ✅ No manual factory functions needed
// ✅ Dependencies are explicit in the constructor
// ✅ Type-safe and refactor-friendly
// ✅ Less boilerplate code
```

### Explicit Dependencies (no decorators)

Declare constructor dependencies at registration time. No decorators or `reflect-metadata` required, and it takes precedence over `@inject`:

```typescript
import { Container, Lifetime } from "fast-injection";

class UserService {
  constructor(
    private db: Database,
    private apiUrl: string,
    private cache?: Cache,
  ) {}
}

const container = new Container();
container.register(Database, { lifetime: Lifetime.Singleton });
container.registerValue("apiUrl", "https://api.example.com");

// Dependencies are listed in constructor parameter order
container.register(UserService, {
  dependencies: [Database, "apiUrl", { token: Cache, optional: true }],
});

const service = container.resolve(UserService);
```

### Typed Tokens

`createToken<T>()` returns a unique symbol that carries its type, so `resolve()` needs no type argument. Ideal for interfaces and configuration:

```typescript
import { Container, createToken } from "fast-injection";

interface Config {
  apiUrl: string;
}

const CONFIG = createToken<Config>("config");

const container = new Container();
container.registerValue(CONFIG, { apiUrl: "https://api.example.com" });

const config = container.resolve(CONFIG); // inferred as Config
```

### Optional Resolution

```typescript
import { inject, optional } from "fast-injection/decorators";

// Returns undefined instead of throwing when the token is not registered
const cache = container.tryResolve(Cache) ?? new InMemoryCache();
const maybe = await container.tryResolveAsync(Cache);

// Optional constructor dependencies (undefined when not registered)
class Reports {
  constructor(@inject(Cache) @optional() private cache?: Cache) {}
}

// ...or without decorators
container.register(Reports, {
  dependencies: [{ token: Cache, optional: true }],
});
```

Only a missing token is tolerated: a registered service that fails to build (for example because one of its own dependencies is missing) still throws.

### Validate the Graph at Startup

`container.validate()` inspects the registrations without instantiating anything and throws a `ValidationError` listing every problem:

```typescript
import { ValidationError } from "fast-injection";

try {
  container.validate();
} catch (error) {
  if (error instanceof ValidationError) {
    for (const issue of error.issues) {
      // issue.type: "missing" | "circular" | "captive"
      console.error(issue.type, issue.message, issue.path);
    }
  }
  throw error;
}
```

- `missing`: a required dependency is not registered (optional ones are skipped)
- `circular`: constructor dependencies form a cycle
- `captive`: a singleton depends, directly or through transients, on a scoped service

Factories are opaque and are not inspected: only constructor registrations are checked. A singleton is checked against the container that owns it, exactly as at runtime. Tokens that are registered later in request scopes (for example `scope.registerValue("requestContext", ...)`) are reported as `missing` when you validate the root container, so validate from a representative scope or declare such dependencies optional.

### Automatic Scope Disposal with `await using`

Containers implement `Symbol.asyncDispose`, so a scope is disposed when the block ends, even if it throws:

```typescript
async function handleRequest(req: Request) {
  await using scope = container.createScope();
  const handler = scope.resolve(RequestHandler);
  return await handler.handle(req);
} // scope.dispose() runs here
```

`await using` requires TypeScript 5.2+ with `"lib"` including `ESNext` / `esnext.disposable`.

### Upgrading

- Custom classes implementing `IContainer` must add `registerAll`, `resolveAllAsync`, `tryResolve`, `tryResolveAsync`, `validate` and `[Symbol.asyncDispose]`.
- A promise from `resolveAsync()` of a singleton that is requested again from inside its own in-flight creation now rejects with `CircularDependencyError` instead of hanging or resolving late.
- Transient instances are tracked weakly (see below): a transient garbage collected before container disposal no longer gets `onDispose`.
- The `typescript` peer dependency is now `>=5.2.0`.

### What's New / Fixed

- Decorators imported from `fast-injection/decorators` now work with a container imported from `fast-injection` in the published package (the entry points share one metadata store).
- `replace: true` now works and drops the cached instance of the replaced registration; `registerValue(token, value, { replace: true })` is accepted.
- Factories receive a fully functional container (`has`, `createScope`, `tryResolve`, ...).
- `registerAll` with singleton lifetime keeps one instance per implementation; `resolveAllAsync()` and `registerAll` are part of `IContainer`.
- Async "diamond" graphs no longer raise a false `CircularDependencyError`, and async cycles through a pending singleton reject instead of hanging.
- `registerValue` returns functions and classes as-is; `registerAsyncFactory` accepts promise-returning non-`async` functions; `resolveAsync` awaits async `onInit` hooks.
- A scope can shadow an already-instantiated parent singleton, and a scope registration also shadows a parent _scoped_ service the scope had already resolved. Creating a scope is O(1).
- An instance reachable through several registrations (for example a factory aliasing a singleton) is initialised and disposed once per container, and a scope never takes over an instance already owned by one of its ancestors: disposing a scope never disposes a parent singleton it merely aliases.
- Disposal: caches are kept until `onDispose` hooks settle, so a service resolved during shutdown gets the existing instance, and concurrent `dispose()` calls wait for the same hooks. An async creation still in flight when its registration is replaced or its container is disposed is delivered to its waiters but not cached.
- `resolveAsync()` waits for an async `onInit` on the call that creates the instance. Callers arriving while that hook is still running receive the instance immediately (so an `onInit` may itself resolve services that depend on its own instance).
- Abstract classes are accepted as tokens at the type level (`container.register(AbstractLogger, ConsoleLogger)`).
- A rejecting async `onDispose` no longer leaves the container half-disposed: state is cleared, the remaining hooks run, and the first error is rethrown.
- **Memory:** transient instances with an `onDispose` hook are tracked weakly. They are still disposed with the container while alive, but are no longer retained until it is disposed. A transient that has been garbage collected before the container is disposed does not get `onDispose` called, so services that own resources which must be released should be scoped or singleton, or be disposed by their consumer.

## Documentation

See the `docs/` folder for comprehensive documentation and design details.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Build
bun run build

# Run benchmarks
bun run bench
```

## Security

Fast-Injection implements comprehensive security measures to protect against common vulnerabilities. See [SECURITY.md](SECURITY.md) for detailed information.

**Key Features:**

- 🛡️ **Prototype Pollution Prevention**: Token validation rejects dangerous property names
- 🔄 **Async Promise Safety**: Failed resolutions tracked with TTL to prevent memory leaks
- 🧹 **Memory Management**: Explicit cleanup utilities for dynamic classes
- ⚡ **ReDoS Prevention**: Removed unsafe regex patterns

**Quick Example:**

```typescript
// ❌ Don't use reserved token names
container.register("__proto__", MyService); // Throws RegistrationError

// ✅ Use safe, descriptive tokens
container.register("myService", MyService);

// ✅ Clean up dynamic classes
clearDecoratorMetadata(DynamicService);

// ✅ Always dispose containers when done
await container.dispose();
```

For comprehensive security documentation, threat model, and best practices, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - Copyright © 2026 [21no.de](https://21no.de)

See [LICENSE](LICENSE) for more details.
