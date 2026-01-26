// Example 5: Lifecycle Hooks
import { Container, Lifetime } from "../src/index.js";

interface Connection {
  close(): Promise<void>;
}

class DatabaseService {
  private connection?: Connection;

  async onInit() {
    console.log("Connecting to database...");
    // Simulate connection
    this.connection = {
      close: async () => {
        console.log("Connection closed");
      },
    };
    console.log("Database connection established");
  }

  async onDispose() {
    console.log("Closing database connection...");
    await this.connection?.close();
  }

  query(sql: string) {
    return `Executed: ${sql}`;
  }
}

console.log("\n=== Example 5: Lifecycle Hooks ===\n");

const container = new Container();

container.register(DatabaseService, { lifetime: Lifetime.Singleton });
const db = container.resolve(DatabaseService);

console.log(db.query("SELECT * FROM users"));

// Later, clean up
console.log("\nDisposing container...");
await container.dispose(); // Calls onDispose on all services

console.log("\n✅ Example 5 completed successfully!\n");
