# fast-di 🚀

Modern, lightweight TypeScript Dependency Injection optimized for Bun runtime.

[![npm version](https://img.shields.io/npm/v/fast-di)](https://www.npmjs.com/package/fast-di)
[![Bundle Size](https://img.shields.io/badge/bundle%20size-%3C5KB-brightgreen)](https://github.com/21no-de/fast-di)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0%2B-orange)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Built with ❤️ by [21no.de](https://21no.de)

## Features

- ⚡ **Blazing Fast**: Sub-microsecond dependency resolution
- 🪶 **Lightweight**: < 5KB minified + gzipped
- 🔒 **Type-Safe**: Full TypeScript support with inference
- 🛡️ **Secure**: Protected against prototype pollution, memory leaks, ReDoS, and DoS attacks
- 🎯 **Zero Dependencies**: No production dependencies
- 🔄 **Multiple Lifetimes**: Singleton, transient, and scoped
- 🎨 **Flexible API**: Decorators, functional, or imperative style
- 🧪 **Testing Friendly**: Built-in testing utilities
- 🔥 **Bun Optimized**: Leverages Bun's native performance

## Performance

Fast-DI is optimized for speed with minimal overhead. Here are the key performance metrics:

| Operation            | Ops/Second    | Avg Time | Notes                            |
| -------------------- | ------------- | -------- | -------------------------------- |
| **Registration**     |               |          |                                  |
| Register class       | ~6.3M ops/sec | 0.16µs   | Simple class registration        |
| Register factory     | ~8.5M ops/sec | 0.12µs   | Factory function registration    |
| Register value       | ~5.1M ops/sec | 0.20µs   | Direct value registration        |
| **Resolution**       |               |          |                                  |
| Singleton (cached)   | ~26M ops/sec  | 0.038µs  | 🚀 **Fastest** - cached instance |
| Scoped (cached)      | ~25M ops/sec  | 0.039µs  | Cached within scope              |
| Transient            | ~11M ops/sec  | 0.091µs  | New instance each time           |
| Factory              | ~7.8M ops/sec | 0.13µs   | Factory function call            |
| Value                | ~19M ops/sec  | 0.052µs  | Direct value retrieval           |
| **Async Operations** |               |          |                                  |
| Async factory        | ~1.2M ops/sec | 0.81µs   | Async initialization             |
| Async with deps      | ~738K ops/sec | 1.35µs   | Async with dependencies          |
| **Scope Management** |               |          |                                  |
| Create scope         | ~21M ops/sec  | 0.048µs  | Lightweight scope creation       |
| Scope disposal       | ~4.0M ops/sec | 0.25µs   | Clean scope teardown             |

### Key Performance Insights

- **Singleton is 98% faster than Transient**: Use `Lifetime.Singleton` for services that don't need fresh state
- **Minimal overhead**: Only 0.038µs per resolution for singletons
- **Scoped is ideal for requests**: Fast enough for per-request services with proper isolation
- **Security included**: All metrics include thread-safe circular dependency detection and race-condition protection

> 💡 **Performance Tip**: Use `@singleton()` decorator for services like database connections, configuration, and loggers. Reserve `@transient()` for stateful operations where isolation is required.

Run benchmarks yourself: `bun run bench`

## Installation

```bash
bun add fast-di
```

## Quick Start

### Basic Usage

```typescript
import { Container } from "fast-di";
import { singleton, inject } from "fast-di/decorators";

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
import { Container } from "fast-di";

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
import { Container } from "fast-di";
import { singleton, transient, scoped } from "fast-di/decorators";

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
import { Container } from "fast-di";
import { singleton, inject } from "fast-di/decorators";

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

Fast-DI includes multiple security enhancements to protect your applications:

### Token Validation

# Run benchmarks

```bash
bun run bench
```

## Security

Fast-DI implements comprehensive security measures to protect against common vulnerabilities. See [SECURITY.md](SECURITY.md) for detailed information.

**Key Features:**
- 🛡️ **Prototype Pollution Prevention**: Token validation rejects dangerous property names
- 🔄 **Async Promise Safety**: Failed resolutions tracked with TTL to prevent memory leaks
- 🧹 **Memory Management**: Explicit cleanup utilities for dynamic classes
- ⚡ **ReDoS Prevention**: Removed unsafe regex patterns

**Quick Example:**
```typescript
// ❌ Don't use reserved token names
container.register('__proto__', MyService); // Throws RegistrationError

// ✅ Use safe, descriptive tokens
container.register('myService', MyService);

// ✅ Clean up dynamic classes
clearDecoratorMetadata(DynamicService);

// ✅ Always dispose containers when done
await container.dispose();
````

For comprehensive security documentation, threat model, and best practices, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - Copyright © 2026 [21no.de](https://21no.de)

See [LICENSE](LICENSE) for more details.
