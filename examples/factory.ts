import { Container } from "../src/index.js";
import { singleton } from "../src/decorators/index.js";

// Factory pattern example
class DatabaseConfig {
  constructor(
    public readonly host: string,
    public readonly port: number,
    public readonly database: string,
  ) {}
}

@singleton()
class Database {
  constructor(private config: DatabaseConfig) {}

  async connect() {
    console.log(`Connecting to ${this.config.database} at ${this.config.host}:${this.config.port}`);
    return "Connected";
  }

  async query(sql: string) {
    return `Query result for: ${sql}`;
  }
}

// Async factory example
@singleton()
class CacheService {
  private cache: Map<string, any> = new Map();

  async initialize() {
    console.log("Initializing cache...");
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("Cache initialized");
    return this;
  }

  get(key: string) {
    return this.cache.get(key);
  }

  set(key: string, value: any) {
    this.cache.set(key, value);
  }
}

// Setup container
const container = new Container();

// Register with factory
container.registerFactory(DatabaseConfig, () => {
  const env = Bun.env.NODE_ENV || "development";

  if (env === "production") {
    return new DatabaseConfig("prod-db.example.com", 5432, "prod_db");
  }

  return new DatabaseConfig("localhost", 5432, "dev_db");
});

container.registerFactory(Database, (c) => {
  const config = c.resolve(DatabaseConfig);
  return new Database(config);
});

// Register async factory
container.registerAsyncFactory(CacheService, async () => {
  const cache = new CacheService();
  await cache.initialize();
  return cache;
});

console.log("\n=== Factory Pattern Example ===\n");

// Resolve with factory
const db = container.resolve(Database);
await db.connect();

const result = await db.query("SELECT * FROM users");
console.log(result);

// Resolve async factory
console.log("\nResolving async factory...");
const cache = await container.resolveAsync(CacheService);
cache.set("key1", "value1");
console.log("Cached value:", cache.get("key1"));

// Cleanup
await container.dispose();
