// Example 2: Dependency Injection with Factories
import { Container, Lifetime } from "../src/index.js";

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

console.log("\n=== Example 2: Dependency Injection with Factories ===\n");

const container = new Container();

// Register Database (no dependencies, so simple register is fine)
container.register(Database, { lifetime: Lifetime.Singleton });

// Register UserService with factory (has constructor dependencies)
container.registerFactory(UserService, (c) => {
  const db = c.resolve(Database);
  return new UserService(db);
});

const service = container.resolve(UserService);
console.log("Users:", service.getUsers());

console.log("\n✅ Example 2 completed successfully!\n");
