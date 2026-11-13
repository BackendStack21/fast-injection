# Quick Start Guide

## Installation

```bash
bun add fast-injection
```

Requires TypeScript 5.2+ (peer dependency). For `await using`, include `"ESNext"` (or `esnext.disposable`) in your `tsconfig.json` `"lib"`.

## Basic Usage

### 1. Simple Service Registration

```typescript
import { Container } from "fast-injection";
import { singleton } from "fast-injection/decorators";

@singleton()
class Logger {
  log(msg: string) {
    console.log(msg);
  }
}

const container = new Container();
container.register(Logger); // Decorator controls lifetime

const logger = container.resolve(Logger);
logger.log("Hello, fast-injection!");
```

### 2. Dependency Injection with Factories

```typescript
import { Container } from "fast-injection";
import { singleton } from "fast-injection/decorators";

@singleton()
class Database {
  connect() {
    return "Connected";
  }
}

class UserService {
  constructor(private db: Database) {}

  getUsers() {
    this.db.connect();
    return ["Alice", "Bob"];
  }
}

const container = new Container();

// Decorator controls lifetime
container.register(Database);

// Factory for dependency injection
container.registerFactory(UserService, (c) => {
  const db = c.resolve(Database);
  return new UserService(db);
});

const service = container.resolve(UserService);
console.log(service.getUsers());
```

### 3. Scoped Containers (for HTTP requests)

```typescript
import { Container } from "fast-injection";
import { singleton, scoped, inject } from "fast-injection/decorators";

@singleton()
class Database {
  query() {
    /* ... */
  }
}

@scoped()
class RequestHandler {
  constructor(@inject(Database) private db: Database) {}
}

const container = new Container();
container.register(Database);

// For each HTTP request
const requestScope = container.createScope();

// Register request-specific data
requestScope.registerValue("RequestId", Math.random());

// Resolve services in request scope
const handler = requestScope.resolve(RequestHandler);

// Clean up after request
await requestScope.dispose();
```

### 4. Global Singleton Container

Use `getGlobalContainer()` to access a shared container instance across your entire application without passing it around:

```typescript
import { getGlobalContainer, resetGlobalContainer, Lifetime } from "fast-injection";

// Setup at application startup (e.g., in main.ts)
function setupContainer() {
  const container = getGlobalContainer();

  container.register(ConfigService, { lifetime: Lifetime.Singleton });
  container.register(Logger, { lifetime: Lifetime.Singleton });
  container.registerFactory(ApiClient, (c) => new ApiClient(c.resolve(ConfigService), c.resolve(Logger)), {
    lifetime: Lifetime.Transient,
  });
}

// Access from anywhere in your application
function someModule() {
  const container = getGlobalContainer();
  const config = container.resolve(ConfigService);
  console.log(config.get("apiUrl"));
}

async function anotherModule() {
  const container = getGlobalContainer();
  const apiClient = container.resolve(ApiClient);
  await apiClient.fetchData("/users");
}

// Cleanup when shutting down
async function shutdown() {
  await resetGlobalContainer(); // Disposes and resets the container
}
```

### 5. Async Factories

```typescript
container.registerAsyncFactory(Database, async () => {
  const db = new Database();
  await db.connect();
  return db;
});

const db = await container.resolveAsync(Database);
```

### 6. Lifecycle Hooks

```typescript
class DatabaseService {
  private connection?: Connection;

  async onInit() {
    console.log("Connecting to database...");
    this.connection = await connect();
  }

  async onDispose() {
    console.log("Closing database connection...");
    await this.connection?.close();
  }
}

container.register(DatabaseService, { lifetime: Lifetime.Singleton });
const db = container.resolve(DatabaseService);

// Later, clean up
await container.dispose(); // Calls onDispose on all services
```

### 7. Dependencies Without Decorators

Declare constructor dependencies at registration time. No decorators or `reflect-metadata` needed, and the list takes precedence over `@inject`:

```typescript
import { Container, Lifetime } from "fast-injection";

class Database {}
class Cache {}

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

// Parameter order; { token, optional: true } injects undefined when not registered
container.register(UserService, {
  dependencies: [Database, "apiUrl", { token: Cache, optional: true }],
});

const service = container.resolve(UserService);
```

### 8. Typed Tokens

`createToken<T>()` returns a unique symbol that carries its type, so `resolve()` is inferred without a type argument. Use it for interfaces and configuration:

```typescript
import { Container, createToken } from "fast-injection";

interface Config {
  apiUrl: string;
}

const CONFIG = createToken<Config>("config");

const container = new Container();
container.registerValue(CONFIG, { apiUrl: "https://api.example.com" });

const config = container.resolve(CONFIG); // Config
```

### 9. Optional Resolution

```typescript
import { inject, optional } from "fast-injection/decorators";

// undefined instead of an error when the token is not registered
const cache = container.tryResolve(Cache) ?? new InMemoryCache();
const maybe = await container.tryResolveAsync(Cache);

class Reports {
  constructor(@inject(Cache) @optional() private cache?: Cache) {}
}
```

Only a missing token is tolerated. A registered service that fails to build (for example, one of its own dependencies is missing) still throws.

### 10. Validate the Graph at Startup

```typescript
import { ValidationError } from "fast-injection";

try {
  container.validate(); // inspects registrations, instantiates nothing
} catch (error) {
  if (error instanceof ValidationError) {
    for (const issue of error.issues) {
      console.error(`[${issue.type}] ${issue.message}`); // missing | circular | captive
    }
  }
  throw error;
}
```

A `captive` issue means a singleton depends (directly or through transients) on a scoped service. Only constructor registrations are checked (factories are opaque), and a singleton is checked against the container that owns it. Tokens registered later in request scopes (such as `scope.registerValue("requestContext", ...)`) show up as `missing` when validating the root: validate from a representative scope, or declare those dependencies optional.

### 11. `await using` Scopes

Containers implement `Symbol.asyncDispose`, so a scope is disposed automatically when the block ends:

```typescript
async function handleRequest(req: Request) {
  await using scope = container.createScope();
  return scope.resolve(RequestHandler).handle(req);
} // scope disposed here, even if handle() throws
```

This needs TypeScript 5.2+ and `"lib"` including `ESNext` / `esnext.disposable`. Disposing a scope never disposes a parent singleton it merely aliases.

### 12. Testing with Mocks

```typescript
import { createTestContainer } from "fast-injection/testing";

// In your tests
const container = createTestContainer();

// Mock dependencies
const mockDb = {
  query: () => Promise.resolve([{ id: 1, name: "Test" }]),
};

container.registerValue(Database, mockDb);

// Test your service with mocked dependencies
const service = container.resolve(UserService);
```

---

## When to Use Explicit Lifetime Options

While decorators are the recommended default, explicit options are useful when:

```typescript
import { Lifetime } from "fast-injection";

// Override decorator at registration
@singleton()
class MyService {}

container.register(MyService, { lifetime: Lifetime.Transient }); // Override

// Dynamic registration without decorators
container.register(ThirdPartyClass, { lifetime: Lifetime.Singleton });

// Factory with explicit lifetime
container.registerFactory(ComplexService, (c) => new ComplexService(c.resolve(Dep)), { lifetime: Lifetime.Singleton });
```

## Alternative: Using Decorators

You can use decorators to control service lifetimes and document your code. **Decorators are fully functional** - they automatically control lifetimes when you use `register()` without explicit options.

### 13. Decorator-Based Lifetimes

```typescript
import { Container } from "fast-injection";
import { singleton, transient, scoped } from "fast-injection/decorators";

@singleton()
class ConfigService {
  private config = { apiUrl: "https://api.example.com" };

  getConfig() {
    return this.config;
  }
}

@transient()
class Logger {
  private requestId = Math.random().toString(36);

  log(msg: string) {
    console.log(`[${this.requestId}] ${msg}`);
  }
}

@scoped()
class RequestContext {
  constructor(public readonly requestId: string) {}
}

const container = new Container();

// Decorators control lifetimes automatically!
container.register(ConfigService);
container.register(Logger);
container.register(RequestContext);

// ConfigService will be singleton
const config1 = container.resolve(ConfigService);
const config2 = container.resolve(ConfigService);
console.log(config1 === config2); // true

// Logger will be transient (new instance each time)
const logger1 = container.resolve(Logger);
const logger2 = container.resolve(Logger);
console.log(logger1 === logger2); // false
```

### 14. Using @inject for Interface Tokens

```typescript
import { injectable, inject } from "fast-injection/decorators";

const ILogger = Symbol("ILogger");
const IDatabase = Symbol("IDatabase");

interface ILogger {
  log(msg: string): void;
}

interface IDatabase {
  query(sql: string): Promise<any>;
}

@injectable()
class ConsoleLogger implements ILogger {
  log(msg: string) {
    console.log(msg);
  }
}

@injectable()
class PostgresDatabase implements IDatabase {
  async query(sql: string) {
    return { rows: [] };
  }
}

// @inject decorator helps document which tokens are used
@injectable()
class UserService {
  constructor(
    @inject(ILogger) private logger: ILogger,
    @inject(IDatabase) private db: IDatabase,
  ) {}

  async getUsers() {
    this.logger.log("Fetching users from database");
    const result = await this.db.query("SELECT * FROM users");
    return result.rows;
  }
}

const container = new Container();

// Register implementations
container.register(ILogger, ConsoleLogger);
container.register(IDatabase, PostgresDatabase);

// No factory needed: @inject annotated constructor parameters will be resolved
container.register(UserService);

const service = container.resolve(UserService);
await service.getUsers();
```

### 15. Decorators Control Lifetimes

```typescript
import { singleton } from "fast-injection/decorators";

@singleton()
class Database {
  connect() {
    return "Connected";
  }
}

@singleton()
class Logger {
  log(msg: string) {
    console.log(msg);
  }
}

// No decorator - declare dependencies at registration (or use a factory)
class UserService {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  getUsers() {
    this.logger.log("Fetching users");
    return ["Alice", "Bob"];
  }
}

const container = new Container();

// Decorators control lifetimes!
container.register(Database);
container.register(Logger);

// No decorator on UserService: declare its dependencies at registration,
// annotate constructor parameters with @inject(...), or provide a factory
container.register(UserService, { dependencies: [Database, Logger] });

const service = container.resolve(UserService);
```

### Decorators: When to Use

| Use Case                        | Recommended Approach                             |
| ------------------------------- | ------------------------------------------------ |
| **Simple services**             | Use `@singleton()`, `@transient()`, `@scoped()`  |
| **Marking injectables**         | Use `@injectable()` (transient by default)       |
| **Services with dependencies**  | `{ dependencies: [...] }`, `@inject`, or factory |
| **Interface tokens**            | `createToken<T>()` (or symbol tokens)            |
| **Override decorator lifetime** | Use registration options - `{ lifetime }`        |

**Important:** Decorators automatically control lifetimes when using `container.register()`. For classes that are not decorated or do not have `@inject(...)` annotations on constructor parameters, you can declare the wiring with `register(Class, { dependencies: [...] })` or use `registerFactory()`.

## API Reference

### Container Methods

- `register<T>(token, target?, options?)` - Register a service
- `registerValue<T>(token, value, options?)` - Register a value (functions and classes are returned as-is)
- `registerFactory<T>(token, factory, options?)` - Register a factory
- `registerAsyncFactory<T>(token, factory, options?)` - Register async factory
- `registerAll<T>(token, implementations, options?)` - Register multiple implementations
- `resolve<T>(token)` - Resolve a service
- `resolveAsync<T>(token)` - Resolve a service asynchronously
- `resolveAll<T>(token)` / `resolveAllAsync<T>(token)` - Resolve all implementations
- `tryResolve<T>(token)` / `tryResolveAsync<T>(token)` - Resolve, or `undefined` when not registered
- `validate()` - Check the graph for missing, circular and captive dependencies (throws `ValidationError`)
- `has(token)` - Check if service is registered
- `createScope()` - Create child scoped container
- `dispose()` / `[Symbol.asyncDispose]()` - Dispose all services (enables `await using`)

### Helpers

- `createToken<T>(description)` - Create a typed injection token

### Lifetimes

- `Lifetime.Singleton` - One instance per container
- `Lifetime.Transient` - New instance every time
- `Lifetime.Scoped` - One instance per scope

### Registration Options

```typescript
{
  lifetime: Lifetime.Singleton | Lifetime.Transient | Lifetime.Scoped,
  replace: boolean, // Replace an existing registration (drops its cached instance)
  dependencies: Dependency[] // Explicit constructor dependencies: Token | { token, optional? }
}
```

### Decorator Methods (from "fast-injection/decorators")

- `@injectable()` - Mark class as injectable (transient lifetime)
- `@singleton()` - Mark class as singleton lifetime
- `@transient()` - Mark class as transient lifetime
- `@scoped()` - Mark class as scoped lifetime
- `@inject(token)` - Explicitly inject dependency token
- `@optional()` - Inject `undefined` when the parameter's token is not registered

**Decorators control lifetimes automatically** when using `container.register()`. Explicit lifetime options override decorator metadata:

```typescript
// Decorator sets lifetime
@singleton()
class MyService {}

container.register(MyService); // Uses Singleton from decorator

// Explicit option overrides decorator
container.register(MyService, { lifetime: Lifetime.Transient }); // Overrides to Transient
```

When using decorators, enable `experimentalDecorators` in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Running Examples

```bash
# Run all examples
bun run examples/run-all.ts

# Individual examples
bun run examples/01-simple-registration.ts     # Basic registration
bun run examples/02-dependency-injection.ts    # Factories and DI
bun run examples/03-scoped-containers.ts       # Scoped lifetimes
bun run examples/04-async-factories.ts         # Async registration
bun run examples/05-lifecycle-hooks.ts         # onInit/onDispose
bun run examples/06-testing-mocks.ts           # Testing utilities
bun run examples/07-decorator-lifetimes.ts     # Decorator documentation
bun run examples/08-inject-decorator.ts        # Interface tokens
bun run examples/09-decorators-factories.ts    # Combined approach
bun run examples/10-global-container.ts        # Global container
bun run examples/11-lifecycle-hooks-advanced.ts # Async hooks, disposal order
bun run examples/12-explicit-dependencies.ts   # Decorator-free injection
bun run examples/13-typed-tokens-optional.ts   # createToken, tryResolve
bun run examples/14-validation.ts              # container.validate()
bun run examples/15-await-using.ts             # await using scopes

# Original examples (still available)
bun run examples/basic.ts                      # Comprehensive demo
bun run examples/http-server.ts                # HTTP server example
bun run examples/factory.ts                    # Factory patterns
```

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run with coverage
bun test --coverage
```

## Tips & Best Practices

### 1. Choose How to Wire Dependencies

Use `registerFactory()` when your service requires manual wiring (dynamic construction, conditional logic, or third-party setup). For plain constructor injection, prefer `register(Class, { dependencies: [...] })`, or decorate with `@inject(...)` and register the class directly.

```typescript
// No decorators: explicit dependencies
container.register(UserService, { dependencies: [Database, Logger] });

// Factory for manual wiring
container.registerFactory(UserService, (c) => {
  return new UserService(c.resolve(Database), c.resolve(Logger));
});

// Or, with decorators and @inject, no factory is needed:
import { singleton, inject } from "fast-injection/decorators";

@singleton()
class UserService {
  constructor(
    @inject(Database) private db: Database,
    @inject(Logger) private logger: Logger,
  ) {}
}

container.register(UserService); // Dependencies injected automatically
```

### 2. Use Singletons for Shared Resources

```typescript
// Database connections, configuration, loggers
container.register(Database, { lifetime: Lifetime.Singleton });
container.register(Logger, { lifetime: Lifetime.Singleton });
```

### 3. Use Scoped Lifetimes for Request-Specific Data

```typescript
// Request context, user session
container.register(RequestContext, { lifetime: Lifetime.Scoped });
```

### 4. Clean Up Resources

```typescript
// Always dispose containers when done
try {
  const service = container.resolve(MyService);
  // ... use service
} finally {
  await container.dispose();
}
```

### 5. Use Typed Tokens for Interfaces

```typescript
import { createToken } from "fast-injection";

interface IUserRepository {
  findById(id: string): Promise<User>;
}

const USER_REPOSITORY = createToken<IUserRepository>("IUserRepository");

container.register(USER_REPOSITORY, UserRepository);
const repo = container.resolve(USER_REPOSITORY); // IUserRepository
```

### 6. Validate at Startup

Call `container.validate()` once after registering everything to fail fast on missing, circular or captive dependencies.

## Troubleshooting

### "Service not registered" Error

Make sure you register services before resolving:

```typescript
container.register(MyService);
const service = container.resolve(MyService); // ✅
```

### Dependencies are undefined

The container only injects what it is told about. Declare the dependencies (or use `@inject`, or a factory):

```typescript
container.register(ServiceWithDeps, { dependencies: [Dependency] });
```

`container.validate()` reports missing dependencies before anything is resolved.

### Circular Dependency Error

Refactor your services to avoid circular dependencies, or use lazy resolution:

```typescript
container.registerFactory(ServiceA, (c) => {
  return new ServiceA(() => c.resolve(ServiceB)); // Lazy
});
```

## Need Help?

- Look at examples in `examples/` directory
- Review tests in `tests/` for usage patterns
- Check out the [full documentation](README.md)

---

**fast-injection** - Built with ❤️ by [21no.de](https://21no.de) | [MIT License](LICENSE)
