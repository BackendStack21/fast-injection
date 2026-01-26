// Example 4: Async Factories
import { Container } from "../src/index.js";

class Database {
  private connected = false;

  async connect() {
    console.log("Connecting to database...");
    // Simulate async connection
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.connected = true;
    console.log("Database connected!");
  }

  isConnected() {
    return this.connected;
  }
}

console.log("\n=== Example 4: Async Factories ===\n");

const container = new Container();

container.registerAsyncFactory(Database, async () => {
  const db = new Database();
  await db.connect();
  return db;
});

const db = await container.resolveAsync(Database);
console.log("Database is connected:", db.isConnected());

console.log("\n✅ Example 4 completed successfully!\n");
