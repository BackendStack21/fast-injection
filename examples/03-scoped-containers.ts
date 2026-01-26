// Example 3: Scoped Containers (for HTTP requests)
import { Container, Lifetime } from "../src/index.js";

class Database {
  connect() {
    return "Connected to database";
  }
}

class RequestHandler {
  constructor(
    private db: Database,
    private requestId: number,
  ) {}

  handle() {
    this.db.connect();
    return `Handled request ${this.requestId}`;
  }
}

console.log("\n=== Example 3: Scoped Containers ===\n");

const container = new Container();

// Register app-level singletons
container.register(Database, { lifetime: Lifetime.Singleton });

// Simulate processing multiple HTTP requests
for (let i = 1; i <= 3; i++) {
  console.log(`\nRequest ${i}:`);

  // For each HTTP request
  const requestScope = container.createScope();

  // Register request-specific data
  const requestId = Math.random();
  requestScope.registerValue("RequestId", requestId);

  // Resolve services in request scope
  requestScope.registerFactory(RequestHandler, (c) => {
    return new RequestHandler(c.resolve(Database), c.resolve("RequestId"));
  });

  const handler = requestScope.resolve(RequestHandler);
  console.log(handler.handle());
  console.log(`Request ID: ${requestId}`);

  // Clean up after request
  await requestScope.dispose();
}

console.log("\n✅ Example 3 completed successfully!\n");
