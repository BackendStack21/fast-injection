import { Container, Lifetime } from "../src/index.js";
import { singleton, transient, scoped } from "../src/decorators/index.js";

// Benchmark utilities
interface BenchmarkResult {
  name: string;
  operations: number;
  totalTime: number;
  opsPerSecond: number;
  avgTimePerOp: number;
}

function benchmark(name: string, fn: () => void, iterations: number = 100000): BenchmarkResult {
  // Warmup
  for (let i = 0; i < 1000; i++) {
    fn();
  }

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();

  const totalTime = end - start;
  const opsPerSecond = (iterations / totalTime) * 1000;
  const avgTimePerOp = totalTime / iterations;

  return {
    name,
    operations: iterations,
    totalTime,
    opsPerSecond,
    avgTimePerOp,
  };
}

async function benchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 10000,
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 100; i++) {
    await fn();
  }

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const end = performance.now();

  const totalTime = end - start;
  const opsPerSecond = (iterations / totalTime) * 1000;
  const avgTimePerOp = totalTime / iterations;

  return {
    name,
    operations: iterations,
    totalTime,
    opsPerSecond,
    avgTimePerOp,
  };
}

function formatResult(result: BenchmarkResult): void {
  console.log(`\n${result.name}`);
  console.log(`  Operations: ${result.operations.toLocaleString()}`);
  console.log(`  Total time: ${result.totalTime.toFixed(2)}ms`);
  console.log(`  Ops/sec: ${result.opsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  console.log(`  Avg time/op: ${(result.avgTimePerOp * 1000).toFixed(3)}µs`);
}

// Test services
class Logger {
  log(msg: string): string {
    return msg;
  }
}

class Database {
  constructor(public logger: Logger) {}

  query(): string {
    return "data";
  }
}

class UserRepository {
  constructor(
    public database: Database,
    public logger: Logger,
  ) {}

  findUser(id: number): string {
    return `user-${id}`;
  }
}

class UserService {
  constructor(
    public repository: UserRepository,
    public logger: Logger,
  ) {}

  getUser(id: number): string {
    return this.repository.findUser(id);
  }
}

// Decorated test services
@singleton()
class DecoratedLogger {
  log(msg: string): string {
    return msg;
  }
}

@transient()
class DecoratedTransientLogger {
  log(msg: string): string {
    return msg;
  }
}

@scoped()
class DecoratedScopedLogger {
  log(msg: string): string {
    return msg;
  }
}

// Benchmark suites
async function runRegistrationBenchmarks(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("REGISTRATION BENCHMARKS");
  console.log("=".repeat(60));

  // Simple class registration
  const result1 = benchmark(
    "Register simple class",
    () => {
      const container = new Container();
      container.register(Logger);
    },
    100000,
  );
  formatResult(result1);

  // Factory registration
  const result2 = benchmark(
    "Register factory",
    () => {
      const container = new Container();
      container.registerFactory(Logger, (c) => new Logger());
    },
    100000,
  );
  formatResult(result2);

  // Value registration
  const result3 = benchmark(
    "Register value",
    () => {
      const container = new Container();
      container.registerValue(Symbol("config"), { apiUrl: "http://localhost" });
    },
    100000,
  );
  formatResult(result3);

  // Multiple registrations
  const result4 = benchmark(
    "Register multiple services",
    () => {
      const container = new Container();
      container.register(Logger);
      container.register(Database);
      container.register(UserRepository);
      container.register(UserService);
    },
    50000,
  );
  formatResult(result4);

  // Async factory registration
  const result5 = benchmark(
    "Register async factory",
    () => {
      const container = new Container();
      container.registerAsyncFactory(Logger, async (c) => new Logger());
    },
    100000,
  );
  formatResult(result5);

  // Decorator-based registration
  const result6 = benchmark(
    "Register with decorator (@singleton)",
    () => {
      const container = new Container();
      container.register(DecoratedLogger);
    },
    100000,
  );
  formatResult(result6);
}

async function runResolutionBenchmarks(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("RESOLUTION BENCHMARKS (Transient)");
  console.log("=".repeat(60));

  // Simple resolution
  const container1 = new Container();
  container1.register(Logger);
  const result1 = benchmark(
    "Resolve simple class",
    () => {
      container1.resolve(Logger);
    },
    100000,
  );
  formatResult(result1);

  // Factory resolution
  const container2 = new Container();
  container2.registerFactory(Logger, (c) => new Logger());
  const result2 = benchmark(
    "Resolve factory",
    () => {
      container2.resolve(Logger);
    },
    100000,
  );
  formatResult(result2);

  // Value resolution
  const container3 = new Container();
  const config = { apiUrl: "http://localhost" };
  container3.registerValue(Symbol.for("config"), config);
  const result3 = benchmark(
    "Resolve value",
    () => {
      container3.resolve(Symbol.for("config"));
    },
    100000,
  );
  formatResult(result3);

  // Dependency chain resolution
  const container4 = new Container();
  container4.register(Logger);
  container4.registerFactory(Database, (c) => new Database(c.resolve(Logger)));
  container4.registerFactory(UserRepository, (c) => new UserRepository(c.resolve(Database), c.resolve(Logger)));
  container4.registerFactory(UserService, (c) => new UserService(c.resolve(UserRepository), c.resolve(Logger)));

  const result4 = benchmark(
    "Resolve deep dependency chain (4 levels)",
    () => {
      container4.resolve(UserService);
    },
    50000,
  );
  formatResult(result4);

  // Nested resolution
  const container5 = new Container();
  container5.register(Logger);
  container5.registerFactory(Database, (c) => new Database(c.resolve(Logger)));

  const result5 = benchmark(
    "Resolve with 1 dependency",
    () => {
      container5.resolve(Database);
    },
    100000,
  );
  formatResult(result5);
}

async function runLifecycleBenchmarks(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("LIFECYCLE BENCHMARKS");
  console.log("=".repeat(60));

  // Transient
  const container1 = new Container();
  container1.register(Logger, { lifetime: Lifetime.Transient });
  const result1 = benchmark(
    "Resolve Transient (new instance each time)",
    () => {
      container1.resolve(Logger);
    },
    100000,
  );
  formatResult(result1);

  // Singleton
  const container2 = new Container();
  container2.register(Logger, { lifetime: Lifetime.Singleton });
  const result2 = benchmark(
    "Resolve Singleton (cached instance)",
    () => {
      container2.resolve(Logger);
    },
    100000,
  );
  formatResult(result2);

  // Scoped (first resolution in scope)
  const container3 = new Container();
  container3.register(Logger, { lifetime: Lifetime.Scoped });
  const result3 = benchmark(
    "Resolve Scoped (first in scope)",
    () => {
      const scope = container3.createScope();
      scope.resolve(Logger);
    },
    50000,
  );
  formatResult(result3);

  // Scoped (subsequent resolutions in same scope)
  const container4 = new Container();
  container4.register(Logger, { lifetime: Lifetime.Scoped });
  const scope = container4.createScope();
  const result4 = benchmark(
    "Resolve Scoped (cached in scope)",
    () => {
      scope.resolve(Logger);
    },
    100000,
  );
  formatResult(result4);

  // Decorator-based singleton
  const container5 = new Container();
  container5.register(DecoratedLogger);
  const result5 = benchmark(
    "Resolve Singleton (@singleton decorator, cached)",
    () => {
      container5.resolve(DecoratedLogger);
    },
    100000,
  );
  formatResult(result5);

  // Decorator-based transient
  const container6 = new Container();
  container6.register(DecoratedTransientLogger);
  const result6 = benchmark(
    "Resolve Transient (@transient decorator)",
    () => {
      container6.resolve(DecoratedTransientLogger);
    },
    100000,
  );
  formatResult(result6);

  // Decorator-based scoped
  const container7 = new Container();
  container7.register(DecoratedScopedLogger);
  const scopeDecorated = container7.createScope();
  const result7 = benchmark(
    "Resolve Scoped (@scoped decorator, cached)",
    () => {
      scopeDecorated.resolve(DecoratedScopedLogger);
    },
    100000,
  );
  formatResult(result7);
}

async function runAsyncBenchmarks(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("ASYNC RESOLUTION BENCHMARKS");
  console.log("=".repeat(60));

  // Simple async resolution
  const container1 = new Container();
  container1.registerAsyncFactory(Logger, async (c) => new Logger());
  const result1 = await benchmarkAsync(
    "Resolve async factory",
    async () => {
      await container1.resolveAsync(Logger);
    },
    10000,
  );
  formatResult(result1);

  // Async with dependencies
  const container2 = new Container();
  container2.registerAsyncFactory(Logger, async (c) => new Logger());
  container2.registerAsyncFactory(Database, async (c) => new Database(await c.resolveAsync(Logger)));
  const result2 = await benchmarkAsync(
    "Resolve async with dependency",
    async () => {
      await container2.resolveAsync(Database);
    },
    10000,
  );
  formatResult(result2);

  // Sync factory in async context
  const container3 = new Container();
  container3.registerFactory(Logger, (c) => new Logger());
  const result3 = await benchmarkAsync(
    "Resolve sync factory in async context",
    async () => {
      await container3.resolveAsync(Logger);
    },
    10000,
  );
  formatResult(result3);

  // Multiple async dependencies
  const container4 = new Container();
  const loggerToken = Symbol("Logger");
  const dbToken = Symbol("Database");
  const serviceToken = Symbol("Service");

  container4.registerAsyncFactory(loggerToken, async (c) => ({
    log: (m: string) => m,
  }));
  container4.registerAsyncFactory(dbToken, async (c) => ({
    query: () => "data",
  }));
  container4.registerAsyncFactory(serviceToken, async (c) => ({
    logger: await c.resolveAsync(loggerToken),
    db: await c.resolveAsync(dbToken),
  }));

  const result4 = await benchmarkAsync(
    "Resolve async with multiple dependencies",
    async () => {
      await container4.resolveAsync(serviceToken);
    },
    10000,
  );
  formatResult(result4);
}

async function runScopeBenchmarks(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("SCOPE BENCHMARKS");
  console.log("=".repeat(60));

  // Scope creation
  const container1 = new Container();
  container1.register(Logger, { lifetime: Lifetime.Scoped });
  const result1 = benchmark(
    "Create scope",
    () => {
      container1.createScope();
    },
    100000,
  );
  formatResult(result1);

  // Dispose scope
  const container2 = new Container();
  container2.register(Logger, { lifetime: Lifetime.Scoped });
  const result2 = benchmark(
    "Create and dispose scope",
    () => {
      const scope = container2.createScope();
      scope.dispose();
    },
    50000,
  );
  formatResult(result2);

  // Resolution in nested scopes
  const container3 = new Container();
  container3.register(Logger, { lifetime: Lifetime.Scoped });
  const result3 = benchmark(
    "Resolve in nested scopes (3 levels)",
    () => {
      const scope1 = container3.createScope();
      const scope2 = scope1.createScope();
      const scope3 = scope2.createScope();
      scope3.resolve(Logger);
      scope3.dispose();
      scope2.dispose();
      scope1.dispose();
    },
    20000,
  );
  formatResult(result3);
}

async function runComparisonBenchmarks(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("COMPARISON BENCHMARKS");
  console.log("=".repeat(60));

  // Direct instantiation vs DI
  const result1 = benchmark(
    "Direct instantiation (baseline)",
    () => {
      const logger = new Logger();
      const database = new Database(logger);
      const repository = new UserRepository(database, logger);
      const service = new UserService(repository, logger);
    },
    100000,
  );
  formatResult(result1);

  const container = new Container();
  container.register(Logger);
  container.registerFactory(Database, (c) => new Database(c.resolve(Logger)));
  container.registerFactory(UserRepository, (c) => new UserRepository(c.resolve(Database), c.resolve(Logger)));
  container.registerFactory(UserService, (c) => new UserService(c.resolve(UserRepository), c.resolve(Logger)));

  const result2 = benchmark(
    "DI resolution (transient)",
    () => {
      container.resolve(UserService);
    },
    100000,
  );
  formatResult(result2);

  // With singleton
  const container2 = new Container();
  container2.register(Logger, { lifetime: Lifetime.Singleton });
  container2.registerFactory(Database, (c) => new Database(c.resolve(Logger)), {
    lifetime: Lifetime.Singleton,
  });
  container2.registerFactory(UserRepository, (c) => new UserRepository(c.resolve(Database), c.resolve(Logger)), {
    lifetime: Lifetime.Singleton,
  });
  container2.registerFactory(UserService, (c) => new UserService(c.resolve(UserRepository), c.resolve(Logger)), {
    lifetime: Lifetime.Singleton,
  });

  const result3 = benchmark(
    "DI resolution (singleton)",
    () => {
      container2.resolve(UserService);
    },
    100000,
  );
  formatResult(result3);

  console.log("\n📊 Overhead Analysis:");
  const overhead = ((result2.avgTimePerOp - result1.avgTimePerOp) / result1.avgTimePerOp) * 100;
  console.log(`  Transient overhead: ${overhead.toFixed(1)}%`);
  console.log(
    `  Transient: ${(result2.avgTimePerOp * 1000).toFixed(3)}µs vs Direct: ${(result1.avgTimePerOp * 1000).toFixed(3)}µs`,
  );

  const singletonImprovement = ((result2.avgTimePerOp - result3.avgTimePerOp) / result2.avgTimePerOp) * 100;
  console.log(`  Singleton improvement: ${singletonImprovement.toFixed(1)}% faster than transient`);
}

// Main execution
async function main(): Promise<void> {
  console.log("🚀 Fast-DI Performance Benchmarks");
  console.log(`Running on Bun ${Bun.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);

  try {
    await runRegistrationBenchmarks();
    await runResolutionBenchmarks();
    await runLifecycleBenchmarks();
    await runAsyncBenchmarks();
    await runScopeBenchmarks();
    await runComparisonBenchmarks();

    console.log("\n" + "=".repeat(60));
    console.log("✅ All benchmarks completed successfully!");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("\n❌ Benchmark failed:", error);
    process.exit(1);
  }
}

main();
