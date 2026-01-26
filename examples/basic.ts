import { Container } from "../src/index.js";
import { singleton } from "../src/decorators/index.js";

// Basic example
@singleton()
class Database {
  connect() {
    return "Connected to database";
  }

  query(sql: string) {
    return `Executing: ${sql}`;
  }
}

@singleton()
class Logger {
  log(message: string) {
    console.log(`[LOG] ${message}`);
  }
}

class UserService {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  async getUser(id: string) {
    this.logger.log(`Fetching user ${id}`);
    const result = this.db.query(`SELECT * FROM users WHERE id = ${id}`);
    return { id, data: result };
  }

  async createUser(name: string) {
    this.logger.log(`Creating user ${name}`);
    return { id: Math.random().toString(), name };
  }
}

// Create container
const container = new Container();

// Register services
container.register(Database); // Decorator controls lifetime
container.register(Logger); // Decorator controls lifetime
container.registerFactory(UserService, (c) => {
  const db = c.resolve(Database);
  const logger = c.resolve(Logger);
  return new UserService(db, logger);
});

// Resolve and use
const userService = container.resolve(UserService);

console.log("\n=== Basic DI Example ===\n");

const user = await userService.getUser("123");
console.log("User:", user);

const newUser = await userService.createUser("Alice");
console.log("New user:", newUser);

// Demonstrate singleton behavior
const userService2 = container.resolve(UserService);
const db1 = container.resolve(Database);
const db2 = container.resolve(Database);

console.log("\n=== Singleton Verification ===\n");
console.log("Database instances are same:", db1 === db2);
console.log("UserService instances are different (transient):", userService !== userService2);

// Cleanup
await container.dispose();
