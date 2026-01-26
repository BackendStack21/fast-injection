# fast-injection Examples

This directory contains comprehensive examples demonstrating all features of fast-injection.

## Running Examples

```bash
# Run all examples in sequence
bun run examples/run-all.ts

# Run individual examples
bun run examples/01-simple-registration.ts
bun run examples/02-dependency-injection.ts
# ... etc
```

## Example Index

### Basic Usage (Examples 1-6)

#### 1. Simple Service Registration

**File:** `01-simple-registration.ts`

Demonstrates basic service registration and resolution without dependencies.

**Key Concepts:**

- Simple `container.register()`
- Basic `resolve()`
- No-dependency services

#### 2. Dependency Injection with Factories

**File:** `02-dependency-injection.ts`

Shows how to use factories to handle constructor dependencies.

**Key Concepts:**

- `registerFactory()` for dependencies
- Singleton lifetime
- Factory functions with container access

#### 3. Scoped Containers

**File:** `03-scoped-containers.ts`

Demonstrates scoped lifetimes for request-specific data (e.g., HTTP requests).

**Key Concepts:**

- `createScope()` for child containers
- Scoped lifetime
- Request-specific data
- Scope disposal

#### 4. Async Factories

**File:** `04-async-factories.ts`

Shows async initialization patterns.

**Key Concepts:**

- `registerAsyncFactory()`
- `resolveAsync()`
- Async initialization
- Promise-based services

#### 5. Lifecycle Hooks

**File:** `05-lifecycle-hooks.ts`

Demonstrates `onInit` and `onDispose` lifecycle hooks.

**Key Concepts:**

- `onInit()` hook
- `onDispose()` hook
- Resource management
- Container disposal

#### 6. Testing with Mocks

**File:** `06-testing-mocks.ts`

Shows how to use mocks for testing.

**Key Concepts:**

- `createTestContainer()`
- `registerValue()` for mocks
- Testing patterns
- Dependency mocking

### Decorator Usage (Examples 7-9)

#### 7. Decorator-Based Lifetimes

**File:** `07-decorator-lifetimes.ts`

Demonstrates using decorators to control service lifetimes.

**Key Concepts:**

- `@singleton()` decorator controls lifetime
- `@transient()` decorator controls lifetime
- `@scoped()` decorator controls lifetime
- Decorators work automatically with `register()`

**Note:** Decorators now **fully functional** - they automatically control lifetimes!

#### 8. Using @inject for Interface Tokens

**File:** `08-inject-decorator.ts`

Shows using decorators with interface tokens.

**Key Concepts:**

- `@inject(token)` decorator
- Symbol-based tokens
- Interface implementations
- Factory registration with tokens

#### 9. Decorators Control Lifetimes

**File:** `09-decorators-factories.ts`

Best practice: decorators for lifetimes, factories for DI.

**Key Concepts:**

- Decorators control lifetimes automatically
- Factories handle dependency injection
- Combined approach for complex services
- No redundant lifetime options needed

### Comprehensive Examples

#### 10. Global Container

**File:** `10-global-container.ts`

Shows how to use the global container for application-wide dependency injection.

**Key Concepts:**

- `getGlobalContainer()` for singleton container access
- `resetGlobalContainer()` for cleanup
- Accessing container from different modules
- Testing with global container

#### 11. Advanced Lifecycle Hooks

**File:** `11-lifecycle-hooks-advanced.ts`

Demonstrates advanced lifecycle hook patterns, including async `onInit`/`onDispose`, child scope disposal, and disposal order.

**Key Concepts:**

- Async `onInit()` and `onDispose()` lifecycle hooks
- Scoped instances created in child containers are disposed with the child
- Root container disposal cleans up singleton resources (including async ones)
- Order of disposal and resource cleanup

#### Basic Example

**File:** `basic.ts`

Comprehensive example showing multiple features together.

#### HTTP Server Example

**File:** `http-server.ts`

Real-world example using Bun.serve with request scoping.

#### Factory Patterns

**File:** `factory.ts`

Advanced factory patterns and configurations.

## Key Takeaways

1. **Simple Registration:** Use `register()` for classes without dependencies
2. **Factory Registration:** Use `registerFactory()` for classes with dependencies
3. **Lifetimes:**
   - `Singleton` - One instance per container
   - `Transient` - New instance every time
   - `Scoped` - One instance per scope
4. **Decorators:** Fully functional! `@singleton()`, `@transient()`, `@scoped()` control lifetimes automatically
5. **Testing:** Use `createTestContainer()` and `registerValue()` for mocks
6. **Async:** Use `registerAsyncFactory()` and `resolveAsync()` for async initialization
7. **Lifecycle:** Implement `onInit()` and `onDispose()` for resource management
8. **Global Container:** Use `getGlobalContainer()` for application-wide singleton container access

## Tips

- Always use factories when services have constructor dependencies
- Use decorators (`@singleton`, `@transient`, `@scoped`) to control lifetimes automatically
- Use singletons for stateless services (loggers, configs, database connections)
- Use scoped lifetimes for request-specific state
- Always dispose containers to clean up resources
- Use symbols for interface tokens to avoid naming conflicts
- Explicit lifetime options override decorator metadata when needed
- Use `getGlobalContainer()` for convenient application-wide access, but prefer explicit containers for better testability
