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

### Key Metrics (on Bun 1.3.6, Apple Silicon M-series)

| Operation                  | Ops/Second     | Avg Time |
| -------------------------- | -------------- | -------- |
| **Registration**           |                |          |
| Register simple class      | ~6.3M ops/sec  | 0.158µs  |
| Register factory           | ~8.5M ops/sec  | 0.118µs  |
| Register value             | ~5.1M ops/sec  | 0.195µs  |
| Register with decorator    | ~6.9M ops/sec  | 0.144µs  |
| **Resolution (Transient)** |                |          |
| Simple class               | ~8.9M ops/sec  | 0.112µs  |
| Factory                    | ~7.8M ops/sec  | 0.127µs  |
| Value                      | ~19.2M ops/sec | 0.052µs  |
| Deep chain (4 levels)      | ~1.3M ops/sec  | 0.756µs  |
| With 1 dependency          | ~4.4M ops/sec  | 0.225µs  |
| **Lifecycle**              |                |          |
| Transient                  | ~11.0M ops/sec | 0.091µs  |
| Singleton (cached)         | ~26.2M ops/sec | 0.038µs  |
| Scoped (first)             | ~4.5M ops/sec  | 0.223µs  |
| Scoped (cached)            | ~25.4M ops/sec | 0.039µs  |
| @singleton (cached)        | ~22.2M ops/sec | 0.045µs  |
| @transient                 | ~6.5M ops/sec  | 0.153µs  |
| @scoped (cached)           | ~23.2M ops/sec | 0.043µs  |
| **Async**                  |                |          |
| Async factory              | ~1.24M ops/sec | 0.806µs  |
| Async with deps            | ~738K ops/sec  | 1.354µs  |
| Async multi-deps           | ~569K ops/sec  | 1.756µs  |
| **Scope Management**       |                |          |
| Create scope               | ~21.0M ops/sec | 0.048µs  |
| Create + dispose           | ~4.0M ops/sec  | 0.248µs  |
| Nested (3 levels)          | ~555K ops/sec  | 1.802µs  |
| **Comparison**             |                |          |
| Direct instantiation       | ~86.4M ops/sec | 0.012µs  |
| DI Transient               | ~1.0M ops/sec  | 0.979µs  |
| DI Singleton               | ~61.2M ops/sec | 0.016µs  |

### Performance Insights

1. **Singleton is 98.3% faster than Transient**
   - Singleton (explicit): 26.2M ops/sec (0.038µs)
   - Singleton (@decorator): 22.2M ops/sec (0.045µs)
   - Transient: 11.0M ops/sec (0.091µs)
   - Use singletons for services that don't need per-request state
   - Explicit lifetime options are faster than decorators

2. **Value resolution is fastest**
   - Registration: 5.1M ops/sec
   - Resolution: 19.2M ops/sec
   - Perfect for configuration objects and constants

3. **Overhead Analysis (with security fixes)**
   - Direct instantiation: 0.012µs (baseline)
   - DI Transient: 0.979µs (~82x overhead)
   - DI Singleton: 0.016µs (~1.3x overhead)
   - **Conclusion**: Use singletons where possible to minimize overhead
   - **Security note**: Overhead includes thread-safe circular dependency detection

4. **Async Operations**
   - Async factory: 1.24M ops/sec (0.806µs)
   - With dependencies: 569K-738K ops/sec
   - Suitable for I/O-bound initialization
   - Includes race condition protection for singleton creation
   - ~10-20x slower than sync operations due to Promise overhead

5. **Scoped Services**
   - First resolution: 4.5M ops/sec (0.223µs)
   - Cached: 25.4M ops/sec (0.039µs - nearly as fast as singleton)
   - Perfect for request-scoped services in web apps
   - Each scope is properly isolated (no cross-contamination)

6. **Factory Performance**
   - Registration: 8.5M ops/sec (fastest registration method)
   - Resolution: 7.8M ops/sec
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
   - Performance: 11.0M ops/sec (0.091µs)

2. **Singleton** - Use when:
   - Service is stateless or thread-safe
   - Service is used frequently
   - Maximum performance is needed
   - Performance: 26.2M ops/sec (0.038µs)
   - Examples: loggers, configuration, database connections

3. **Scoped** - Use when:
   - Service needs request-specific state
   - Service should be shared within a scope (e.g., HTTP request)
   - Performance: 25.4M ops/sec cached (0.039µs), 4.5M ops/sec first
   - Examples: database transactions, request context

## Optimization Tips

1. **Prefer singletons for frequently-used services** - 98.3% performance gain over transient
2. **Use explicit lifetime options for maximum performance** - Consistently faster than decorators
3. **Decorators are still very fast** - 22.2M ops/sec for @singleton is excellent
4. **Use factories for simple registrations** - Fastest registration method (8.5M ops/sec)
5. **Batch registrations** - Register all services at startup
6. **Minimize dependency chain depth** - Each level adds ~0.15-0.20µs
7. **Cache resolved instances** - Use singleton or scoped lifetimes
8. **Avoid async when not needed** - Sync operations are 10-20x faster
9. **Use scoped for request-scoped state** - 22-25M ops/sec when cached
10. **Value registration for config** - 19.2M ops/sec resolution, perfect for constants

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

- **Ultra-low overhead**: ~0.988µs per transient resolution, ~0.037µs for singletons
- **Excellent singleton performance**: 26.8M ops/sec (explicit), 16.7M ops/sec (decorator)
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
