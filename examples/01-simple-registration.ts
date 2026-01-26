// Example 1: Simple Service Registration (No Dependencies)
import { Container } from "../src/index.js";

class Logger {
  log(msg: string) {
    console.log(msg);
  }
}

console.log("\n=== Example 1: Simple Service Registration ===\n");

const container = new Container();
// Simple register works when class has no dependencies
container.register(Logger);

const logger = container.resolve(Logger);
logger.log("Hello, fast-di!");

console.log("\n✅ Example 1 completed successfully!\n");
