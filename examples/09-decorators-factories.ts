// Example 9: Decorators Control Lifetimes
import { Container } from "../src/index.js";
import { singleton } from "../src/decorators/index.js";

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

// Decorators document intent
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

console.log("\n=== Example 9: Decorators Control Lifetimes ===\n");

const container = new Container();

// Decorators control lifetimes automatically!
container.register(Database);
container.register(Logger);

// UserService needs factory for dependency injection
container.registerFactory(UserService, (c) => {
  return new UserService(c.resolve(Database), c.resolve(Logger));
});

const service = container.resolve(UserService);
const users = service.getUsers();
console.log("Users:", users);

// Verify singletons
const db1 = container.resolve(Database);
const db2 = container.resolve(Database);
console.log("Database is singleton:", db1 === db2);

const logger1 = container.resolve(Logger);
const logger2 = container.resolve(Logger);
console.log("Logger is singleton:", logger1 === logger2);

console.log("\n✅ Example 9 completed successfully!\n");
