#!/usr/bin/env bun
// Example 12: Explicit Dependencies (decorator-free constructor injection)
import { Container, Lifetime } from "../src/index.js";

class Database {
  query(sql: string) {
    return `result of: ${sql}`;
  }
}

class Cache {
  get(key: string) {
    return `cached:${key}`;
  }
}

// Plain classes: no decorators, no reflect-metadata
class UserService {
  constructor(
    private db: Database,
    private apiUrl: string,
    private cache?: Cache,
  ) {}

  describe() {
    return {
      api: this.apiUrl,
      row: this.db.query("SELECT 1"),
      cache: this.cache ? this.cache.get("user:1") : "no cache configured",
    };
  }
}

console.log("\n=== Example 12: Explicit Dependencies ===\n");

const container = new Container();

container.register(Database, { lifetime: Lifetime.Singleton });
container.registerValue("apiUrl", "https://api.example.com");

// Declare constructor dependencies in parameter order.
// Cache is optional: it resolves to undefined while it is not registered.
container.register(UserService, {
  dependencies: [Database, "apiUrl", { token: Cache, optional: true }],
});

const first = container.resolve(UserService);
console.log("Without Cache:", first.describe());

container.register(Cache);
const second = container.resolve(UserService);
console.log("With Cache:   ", second.describe());

// Works with a token + implementation, and with async resolution too
class Greeter {
  constructor(private db: Database) {}
  greet() {
    return `Hello from ${this.db.constructor.name}`;
  }
}
container.register("greeter", Greeter, { dependencies: [Database] });
console.log(container.resolve<Greeter>("greeter").greet());

console.log("\n✅ Example 12 completed!\n");
