// Example 10: Global Container
import { getGlobalContainer, resetGlobalContainer, Lifetime } from "../src/index.js";

// Define services
class ConfigService {
  private config = {
    apiUrl: "https://api.example.com",
    timeout: 5000,
    retries: 3,
  };

  get(key: keyof typeof this.config) {
    return this.config[key];
  }
}

class Logger {
  log(message: string) {
    console.log(`[LOG] ${message}`);
  }
}

class ApiClient {
  constructor(
    private config: ConfigService,
    private logger: Logger,
  ) {}

  async fetchData(endpoint: string) {
    this.logger.log(`Fetching from ${this.config.get("apiUrl")}${endpoint}`);
    return { data: "example data" };
  }
}

console.log("\n=== Example 10: Global Container ===\n");

// Setup global container at application startup
function setupContainer() {
  const container = getGlobalContainer();

  container.register(ConfigService, { lifetime: Lifetime.Singleton });
  container.register(Logger, { lifetime: Lifetime.Singleton });
  container.registerFactory(
    ApiClient,
    (c) => {
      const config = c.resolve(ConfigService);
      const logger = c.resolve(Logger);
      return new ApiClient(config, logger);
    },
    { lifetime: Lifetime.Transient },
  );

  console.log("✅ Global container configured");
}

// Access global container from different modules/files
function moduleA() {
  console.log("\n--- Module A ---");
  const container = getGlobalContainer();
  const config = container.resolve(ConfigService);
  console.log(`API URL: ${config.get("apiUrl")}`);
}

function moduleB() {
  console.log("\n--- Module B ---");
  const container = getGlobalContainer();
  const logger = container.resolve(Logger);
  logger.log("Module B is active");
}

async function moduleC() {
  console.log("\n--- Module C ---");
  const container = getGlobalContainer();
  const apiClient = container.resolve(ApiClient);
  await apiClient.fetchData("/users");
}

// Application flow
async function main() {
  // Initialize
  setupContainer();

  // Access from different parts of the application
  moduleA();
  moduleB();
  await moduleC();

  // Verify singleton behavior
  console.log("\n--- Singleton Verification ---");
  const container = getGlobalContainer();
  const config1 = container.resolve(ConfigService);
  const config2 = container.resolve(ConfigService);
  console.log(`Same config instance: ${config1 === config2}`);

  // Cleanup
  console.log("\n--- Cleanup ---");
  await resetGlobalContainer();
  console.log("Global container reset");
}

await main();

console.log("\n✅ Example 10 completed successfully!\n");
