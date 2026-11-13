# Fast-Injection Performance Benchmarks

This directory contains comprehensive performance benchmarks for the Fast-Injection dependency injection container.

## Running Benchmarks

```bash
npm run bench
# or
bun run benchmarks/index.ts
```

## Benchmark Suites

### 1. Registration Benchmarks

Tests the performance of registering services with different strategies:

- Simple class registration
- Factory registration
- Value registration
- Multiple service registration
- Async factory registration
- Decorator-based registration (@singleton)

### 2. Resolution Benchmarks (Transient)

Tests service resolution performance:

- Simple class resolution
- Factory resolution
- Value resolution
- Deep dependency chain resolution (4 levels)
- Resolution with dependencies

### 3. Lifecycle Benchmarks

Compares different lifecycle strategies:

- **Transient**: New instance every time
- **Singleton**: Single cached instance
- **Scoped**: Cached per scope

### 4. Async Resolution Benchmarks

Tests async operation performance:

- Async factory resolution
- Async resolution with dependencies
- Sync factory in async context
- Multiple async dependencies

### 5. Scope Benchmarks

Tests scope management:

- Scope creation
- Scope disposal
- Nested scope resolution

### 6. Comparison Benchmarks

Compares DI container performance against direct instantiation:

- Direct instantiation (baseline)
- DI with transient lifetime
- DI with singleton lifetime
- Overhead analysis

## Performance Results

### Key Metrics (on Bun 1.4.4, macOS arm64)

| Operation                  | Ops/Second     | Avg Time |
| -------------------------- | -------------- | -------- |
| **Registration**           |                |          |
| Register simple class      | ~7.3M ops/sec  | 0.137µs  |
| Register factory           | ~8.9M ops/sec  | 0.112µs  |
| Register value             | ~7.4M ops/sec  | 0.135µs  |
| Register with decorator    | ~8.8M ops/sec  | 0.114µs  |
| **Resolution (Transient)** |                |          |
| Simple class               | ~27.3M ops/sec | 0.037µs  |
| Factory                    | ~23.6M ops/sec | 0.042µs  |
| Value                      | ~31.3M ops/sec | 0.032µs  |
| Deep chain (4 levels)      | ~3.4M ops/sec  | 0.297µs  |
| With 1 dependency          | ~12.3M ops/sec | 0.081µs  |
| **Lifecycle**              |                |          |
| Transient                  | ~36.4M ops/sec | 0.027µs  |
| Singleton (cached)         | ~89.1M ops/sec | 0.011µs  |
| Scoped (first)             | ~9.2M ops/sec  | 0.108µs  |
| Scoped (cached)            | ~37.4M ops/sec | 0.027µs  |
| @singleton (cached)        | ~57.4M ops/sec | 0.017µs  |
| @transient                 | ~22.5M ops/sec | 0.044µs  |
| @scoped (cached)           | ~77.2M ops/sec | 0.013µs  |
| **Async**                  |                |          |
| Async factory              | ~2.6M ops/sec  | 0.387µs  |
| Async with deps            | ~1.50M ops/sec | 0.665µs  |
| Async multi-deps           | ~1.09M ops/sec | 0.921µs  |
| **Scope Management**       |                |          |
| Create scope               | ~27.8M ops/sec | 0.036µs  |
| Create + dispose           | ~6.1M ops/sec  | 0.163µs  |
| Nested (3 levels)          | ~1.97M ops/sec | 0.509µs  |
| **Comparison**             |                |          |
| Direct instantiation       | ~89.2M ops/sec | 0.011µs  |
| DI Transient               | ~3.6M ops/sec  | 0.280µs  |
| DI Singleton               | ~88.2M ops/sec | 0.011µs  |

### Performance Insights

1. **Singleton is ~2.4x faster than Transient**
   - Singleton (explicit): 89.1M ops/sec (0.011µs)
   - Singleton (@decorator): 57.4M ops/sec (0.017µs)
   - Transient: 36.4M ops/sec (0.027µs)
   - Use singletons for services that don't need per-request state
   - Decorator-based lookups are in the same range as explicit options

2. **Value resolution is fast**
   - Registration: 7.4M ops/sec
   - Resolution: 31.3M ops/sec
   - Perfect for configuration objects and constants

3. **Overhead Analysis (with security fixes)**
   - Direct instantiation: 0.011µs (baseline)
   - DI Transient: 0.280µs (~25x overhead)
   - DI Singleton: 0.011µs (~1.0x overhead)
   - **Conclusion**: Use singletons where possible to minimize overhead
   - **Security note**: Overhead includes circular dependency detection

4. **Async Operations**
   - Async factory: 2.6M ops/sec (0.387µs)
   - With dependencies: 1.09M-1.50M ops/sec
   - Suitable for I/O-bound initialization
   - Includes race condition protection for singleton creation

5. **Scoped Services**
   - First resolution: 9.2M ops/sec (0.108µs)
   - Cached: 37.4M ops/sec (0.027µs)
   - Perfect for request-scoped services in web apps
   - Each scope is properly isolated (no cross-contamination)
   - Creating a scope is O(1): singletons are not copied into it

6. **Factory Performance**
   - Registration: 8.9M ops/sec
   - Resolution: 23.6M ops/sec
   - Includes circular dependency protection even in factory functions

## Interpreting Results

### What's Considered Fast?

- **< 1µs**: Excellent - negligible overhead
- **1-10µs**: Good - acceptable for most use cases
- **10-100µs**: Moderate - acceptable for infrequent operations
- **> 100µs**: Slow - consider optimization

### When to Use Each Lifetime

1. **Transient** - Use when:
   - Service maintains state per operation
   - Memory usage is a concern
   - Service is used infrequently
   - Performance: 36.4M ops/sec (0.027µs)

2. **Singleton** - Use when:
   - Service is stateless or thread-safe
   - Service is used frequently
   - Maximum performance is needed
   - Performance: 89.1M ops/sec (0.011µs)
   - Examples: loggers, configuration, database connections

3. **Scoped** - Use when:
   - Service needs request-specific state
   - Service should be shared within a scope (e.g., HTTP request)
   - Performance: 37.4M ops/sec cached (0.027µs), 9.2M ops/sec first
   - Examples: database transactions, request context

## Optimization Tips

1. **Prefer singletons for frequently-used services** - ~2.4x faster than transient
2. **Decorators are very fast** - 57.4M ops/sec for @singleton (cached)
3. **Use factories for simple registrations** - 8.9M ops/sec registration
4. **Batch registrations** - Register all services at startup
5. **Minimize dependency chain depth** - Each level adds roughly 0.07µs (4 levels: 0.297µs)
6. **Cache resolved instances** - Use singleton or scoped lifetimes
7. **Avoid async when not needed** - Sync resolution is an order of magnitude faster
8. **Use scoped for request-scoped state** - 37.4M ops/sec when cached
9. **Value registration for config** - 31.3M ops/sec resolution, perfect for constants

## Security & Concurrency

**All performance numbers include security fixes:**

- Thread-safe circular dependency detection (no shared state)
- Race-condition-free async singleton creation
- Proper scope isolation between concurrent requests
- No cross-contamination in factory function resolution
- Token validation against prototype pollution
- Failed async promise tracking with TTL

The overhead from these protections is minimal (< 0.01µs per operation) while ensuring correctness under high concurrency.

## Comparison with Other DI Containers

Fast-Injection is optimized for Bun and provides:

- **Ultra-low overhead**: ~0.280µs per transient resolution in the comparison benchmark, ~0.011µs for singletons
- **Excellent singleton performance**: 89.1M ops/sec (explicit), 57.4M ops/sec (decorator)
- **Concurrent-safe**: All operations are thread-safe and race-condition-free
- **Flexible API**: Decorators or explicit options, your choice
- **TypeScript-first**: Full type safety with decorators
- **Production-ready**: All optimizations maintain 100% backward compatibility

For Node.js applications, consider:

- InversifyJS
- Awilix
- TypeDI

## Contributing

To add new benchmarks:

1. Add your benchmark function to `index.ts`
2. Follow the existing pattern using `benchmark()` or `benchmarkAsync()`
3. Include warmup iterations
4. Document expected performance characteristics
5. Run benchmarks on multiple machines if possible

## Environment

Benchmarks should be run on a representative environment:

- Same runtime (Bun version)
- Similar hardware (CPU, RAM)
- Minimal background processes
- Consistent load conditions

For CI/CD, consider using dedicated benchmark runners to avoid noisy neighbor effects.
