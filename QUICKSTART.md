# Quick Start Guide

## Installation

```bash
bun add fast-injection
```

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

### 7. Testing with Mocks

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

### 8. Decorator-Based Lifetimes

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

### 8. Using @inject for Interface Tokens

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

### 9. Decorators Control Lifetimes

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

// No decorator - needs manual injection
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

// No decorator on UserService — provide a factory to wire dependencies,
// or annotate constructor parameters with @inject(...) and register the class directly
container.registerFactory(UserService, (c) => {
  return new UserService(c.resolve(Database), c.resolve(Logger));
});

const service = container.resolve(UserService);
```

### Decorators: When to Use

| Use Case                        | Recommended Approach                            |
| ------------------------------- | ----------------------------------------------- |
| **Simple services**             | Use `@singleton()`, `@transient()`, `@scoped()` |
| **Marking injectables**         | Use `@injectable()` (transient by default)      |
| **Services with dependencies**  | **Use factories** - `registerFactory()`         |
| **Interface tokens**            | Use factories with symbol tokens                |
| **Override decorator lifetime** | Use registration options - `{ lifetime }`       |

**Important:** Decorators automatically control lifetimes when using `container.register()`. For classes that are not decorated or do not have `@inject(...)` annotations on constructor parameters, you still need to use `registerFactory()` to provide dependency wiring.

## API Reference

### Container Methods

- `register<T>(token, target?, options?)` - Register a service
- `registerValue<T>(token, value)` - Register a value
- `registerFactory<T>(token, factory, options?)` - Register a factory
- `registerAsyncFactory<T>(token, factory, options?)` - Register async factory
- `registerAll<T>(token, implementations, options?)` - Register multiple implementations
- `resolve<T>(token)` - Resolve a service
- `resolveAsync<T>(token)` - Resolve a service asynchronously
- `resolveAll<T>(token)` - Resolve all implementations
- `has(token)` - Check if service is registered
- `createScope()` - Create child scoped container
- `dispose()` - Dispose all services

### Lifetimes

- `Lifetime.Singleton` - One instance per container
- `Lifetime.Transient` - New instance every time
- `Lifetime.Scoped` - One instance per scope

### Registration Options

```typescript
{
  lifetime: Lifetime.Singleton | Lifetime.Transient | Lifetime.Scoped,
  replace: boolean // Allow overwriting existing registrations
}
```

### Decorator Methods (from "fast-injection/decorators")

- `@injectable()` - Mark class as injectable (transient lifetime)
- `@singleton()` - Mark class as singleton lifetime
- `@transient()` - Mark class as transient lifetime
- `@scoped()` - Mark class as scoped lifetime
- `@inject(token)` - Explicitly inject dependency token

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

### 1. Use Factories for Dependencies

Use `registerFactory()` when your service requires manual wiring (third-party classes, dynamic construction, or when you are not using decorators).

If your class is decorated and uses `@inject(...)` or `@injectable()`, you can register the class directly with `container.register()` and the container will inject dependencies automatically.

```typescript
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

### 5. Use Symbols for Interface Tokens

```typescript
// Type-safe interface tokens
interface IUserRepository {
  findById(id: string): Promise<User>;
}

const IUserRepository = Symbol("IUserRepository");

container.register(IUserRepository, UserRepository);
const repo = container.resolve<IUserRepository>(IUserRepository);
```

## Troubleshooting

### "Service not registered" Error

Make sure you register services before resolving:

```typescript
container.register(MyService);
const service = container.resolve(MyService); // ✅
```

### Dependencies are undefined

Use factory registration for services with dependencies:

```typescript
container.registerFactory(ServiceWithDeps, (c) => {
  return new ServiceWithDeps(c.resolve(Dependency));
});
```

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
