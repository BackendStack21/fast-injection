// Example 6: Testing with Mocks
import { createTestContainer } from "../src/testing/index.js";

class Database {
  query(sql: string) {
    return [{ id: 1, name: "Real User" }];
  }
}

class UserService {
  constructor(private db: Database) {}

  async getUsers() {
    return this.db.query("SELECT * FROM users");
  }
}

console.log("\n=== Example 6: Testing with Mocks ===\n");

// In your tests
const container = createTestContainer();

// Mock dependencies
const mockDb = {
  query: () => [{ id: 1, name: "Test User" }],
};

container.registerValue(Database, mockDb);

// Register service with factory
container.registerFactory(UserService, (c) => {
  return new UserService(c.resolve(Database));
});

// Test your service with mocked dependencies
const service = container.resolve(UserService);
const users = await service.getUsers();

console.log("Users from mock:", users);
console.log("Mock was used:", users[0].name === "Test User");

console.log("\n✅ Example 6 completed successfully!\n");
