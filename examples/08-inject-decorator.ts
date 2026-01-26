// Example 8: Using @inject for Interface Tokens
import { Container } from "../src/index.js";
import { injectable, inject } from "../src/decorators/index.js";

const ILogger = Symbol("ILogger");
const IDatabase = Symbol("IDatabase");

interface ILogger {
  log(msg: string): void;
}

interface IDatabase {
  query(sql: string): Promise<any>;
}

@injectable()
class ConsoleLogger implements ILogger {
  log(msg: string) {
    console.log(`[LOG] ${msg}`);
  }
}

@injectable()
class PostgresDatabase implements IDatabase {
  async query(sql: string) {
    return { rows: [{ id: 1, name: "User from DB" }] };
  }
}

// @inject decorator helps document which tokens are used
@injectable()
class UserService {
  constructor(
    @inject(ILogger) private logger: ILogger,
    @inject(IDatabase) private db: IDatabase,
  ) {}

  async getUsers() {
    this.logger.log("Fetching users from database");
    const result = await this.db.query("SELECT * FROM users");
    return result.rows;
  }
}

console.log("\n=== Example 8: Using @inject for Interface Tokens ===\n");

const container = new Container();

// Register implementations
container.register(ILogger, ConsoleLogger);
container.register(IDatabase, PostgresDatabase);

// No factory needed: @inject annotated constructor parameters will be resolved
container.register(UserService);

const service = container.resolve(UserService);
const users = await service.getUsers();
console.log("Users:", users);

console.log("\n✅ Example 8 completed successfully!\n");
