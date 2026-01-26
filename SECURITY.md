# Security Enhancements

This document describes the security features and best practices implemented in fast-di to protect against common vulnerabilities.

## Security Features

### 1. Prototype Pollution Prevention

**Issue**: Malicious tokens could potentially manipulate object prototypes.

**Solution**: All service registrations validate tokens and reject dangerous property names:

```typescript
// ❌ These will throw RegistrationError
container.register("__proto__", Service);
container.register("constructor", Service);
container.register("prototype", Service);

// ✅ These are safe
container.register("myService", Service);
container.register(MyService);
container.register(Symbol("service"));
```

**Implementation**: Token validation in [Registry](src/core/registry.ts) checks against a blacklist of dangerous names before registration.

---

### 2. Async Promise Failure Tracking

**Issue**: Failed async factory resolutions could create memory leaks or cause excessive retries.

**Solution**: Failed promises are tracked with a 5-second TTL (Time To Live) with automatic cleanup:

```typescript
container.registerAsyncFactory(
  "api",
  async () => {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("API unhealthy");
    return response.json();
  },
  { lifetime: Lifetime.Singleton },
);

// First call fails
await container.resolveAsync("api").catch((e) => {
  console.error("API check failed:", e);
});

// Within 5 seconds, immediately returns cached error
await container.resolveAsync("api").catch((e) => {
  console.error("Still failing (cached):", e);
});

// After 5+ seconds, retries the factory
await new Promise((resolve) => setTimeout(resolve, 5100));
const result = await container.resolveAsync("api");
```

**Benefits**:

- Prevents memory exhaustion from concurrent failed resolutions
- Avoids thundering herd problem on service failures
- Allows automatic recovery after TTL expiry
- Automatic cleanup of expired failures prevents unbounded Map growth
- Protects against memory exhaustion even when resolving many different failing services

**Implementation**: [LifecycleManager](src/core/lifecycle.ts) tracks failed tokens with timestamps, periodically cleans up expired entries, and clears them after successful resolution or disposal.

---

### 3. Memory Management & Cleanup

**Issue**: Dynamically created decorated classes could leak memory due to metadata storage.

**Solution**: Explicit cleanup function for decorator metadata:

```typescript
import { clearDecoratorMetadata, singleton } from "fast-di/decorators";

// Create dynamic service
@singleton()
class DynamicService {
  // ...
}

container.register(DynamicService);
const service = container.resolve(DynamicService);

// Later, when no longer needed
clearDecoratorMetadata(DynamicService);
```

**Use Cases**:

- Test cleanup: Clear metadata in `afterEach()` hooks
- Dynamic class generation: Clean up short-lived classes
- Plugin systems: Remove metadata when unloading plugins

**Implementation**: [Decorators](src/decorators/index.ts) provide `clearDecoratorMetadata()` function to manually remove stored metadata.

---

### 4. ReDoS Prevention

**Issue**: Regular expression-based constructor parsing could be exploited with pathological inputs.

**Solution**: Removed unsafe regex parsing entirely. Constructor dependency extraction now relies solely on:

1. `@inject()` decorators (recommended)
2. TypeScript `design:paramtypes` metadata
3. Explicit registration with dependencies

```typescript
// ✅ Recommended: Use @inject decorator
class UserService {
  constructor(
    @inject("IDatabase") private db: Database,
    @inject("ILogger") private logger: Logger,
  ) {}
}

// ✅ Alternative: Explicit registration
container.register(UserService, UserService, {
  dependencies: ["IDatabase", "ILogger"],
});
```

**Implementation**: [Registry](src/core/registry.ts) removed regex-based fallback parsing.

---

### 5. DoS Prevention via Dependency Depth Limiting

**Issue**: Deeply nested (but non-circular) dependency chains could cause stack overflow, enabling Denial of Service attacks.

**Solution**: Maximum dependency resolution depth limit of 100 levels:

```typescript
// ✅ This works (50 levels deep)
container.registerFactory("Level0", () => ({ value: 0 }));
for (let i = 1; i <= 50; i++) {
  container.registerFactory(`Level${i}`, (c) => {
    const dep = c.resolve(`Level${i - 1}`);
    return { value: i, dep };
  });
}
const result = container.resolve("Level50"); // Works fine

// ❌ This fails (exceeds 100 levels)
for (let i = 51; i <= 101; i++) {
  container.registerFactory(`Level${i}`, (c) => {
    const dep = c.resolve(`Level${i - 1}`);
    return { value: i, dep };
  });
}
container.resolve("Level101"); // Throws: "Maximum dependency depth (100) exceeded"
```

**Benefits**:

- Prevents stack overflow attacks via malicious service registrations
- Protects against accidental misconfigurations
- Provides clear error messages for debugging
- Default limit (100) accommodates legitimate deep hierarchies

**Implementation**: [Resolver](src/core/resolver.ts) checks stack size before each resolution step and throws `ResolutionError` when limit is reached.

---

## Security Best Practices

### Safe Token Usage

```typescript
// ✅ Use class constructors as tokens
container.register(UserService);

// ✅ Use descriptive string tokens
container.register("user-service", UserService);

// ✅ Use symbols for guaranteed uniqueness
const USER_SERVICE = Symbol("userService");
container.register(USER_SERVICE, UserService);

// ✅ Use namespaced strings
container.register("services/user", UserService);
container.register("repositories/user", UserRepository);

// ❌ Avoid these reserved names
container.register("__proto__", Service); // Throws!
container.register("constructor", Service); // Throws!
container.register("prototype", Service); // Throws!
```

---

### Proper Resource Disposal

Always dispose containers to prevent resource leaks:

```typescript
import { singleton } from "fast-di/decorators";

@singleton()
class DatabaseConnection {
  private connection?: Connection;

  async onInit() {
    this.connection = await createConnection();
  }

  onDispose() {
    this.connection?.close();
    this.connection = undefined;
  }
}

// Application lifecycle
const container = createContainer();
container.register(DatabaseConnection);

// Use services...
const db = await container.resolveAsync(DatabaseConnection);

// Always dispose when done
await container.dispose(); // Calls onDispose() on all services
```

---

### Async Error Handling

Handle async factory failures gracefully:

```typescript
container.registerAsyncFactory(
  "external-api",
  async () => {
    try {
      const api = await initializeApi();
      await api.healthCheck();
      return api;
    } catch (error) {
      // Log for monitoring
      logger.error("API initialization failed:", error);
      throw error; // Tracked by failure cache
    }
  },
  { lifetime: Lifetime.Singleton },
);

// In your application
async function startServer() {
  try {
    const api = await container.resolveAsync("external-api");
    console.log("API ready");
  } catch (error) {
    console.error("Failed to start:", error);
    // Implement retry logic or graceful degradation
    process.exit(1);
  }
}
```

---

### Request-Scoped Services

Use scoped lifetimes for request-specific data:

```typescript
// Define request context
@scoped()
class RequestContext {
  constructor(
    public readonly requestId: string,
    public readonly userId?: string,
  ) {}
}

// HTTP middleware
app.use((req, res, next) => {
  // Create isolated scope for this request
  req.scope = container.createScope();
  req.scope.registerValue("requestContext", new RequestContext(req.id, req.user?.id));

  // Clean up after request
  res.on("finish", async () => {
    await req.scope.dispose();
  });

  next();
});

// In your handlers
app.get("/user/:id", async (req, res) => {
  const userService = req.scope.resolve(UserService);
  const user = await userService.getUser(req.params.id);
  res.json(user);
});
```

---

## Testing Security

Run security tests:

```bash
bun test tests/security.test.ts
```

The security test suite includes:

- **Token validation**: 10 tests covering prototype pollution prevention
- **Async failure tracking**: 6 tests for memory leak prevention
- **Metadata cleanup**: 4 tests for dynamic class scenarios
- **Best practices**: 3 tests demonstrating secure patterns

---

## Threat Model

### Protected Against

| Threat                    | Protection                                  | Severity |
| ------------------------- | ------------------------------------------- | -------- |
| **Prototype Pollution**   | Token validation                            | MEDIUM   |
| **Memory Exhaustion**     | Failed promise tracking with TTL & cleanup  | MEDIUM   |
| **Stack Overflow DoS**    | Maximum dependency depth limit (100 levels) | MEDIUM   |
| **ReDoS Attacks**         | Removed regex parsing                       | LOW      |
| **Metadata Memory Leaks** | WeakMap + explicit cleanup utility          | LOW      |

### Not Protected Against

- **Code Injection**: Fast-di does not validate factory function code
- **Dependency Confusion**: Users must ensure correct service registration
- **DoS via Circular Dependencies**: Detected but not prevented (throws error)

### Assumptions

- Container is not exposed to untrusted input
- Service implementations are from trusted sources
- Application handles service resolution errors appropriately

---

## References

- [OWASP - Prototype Pollution](https://owasp.org/www-community/vulnerabilities/Prototype_Pollution)
- [OWASP - Regular Expression DoS](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**fast-di** - Built with ❤️ by [21no.de](https://21no.de)
