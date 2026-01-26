// Example 7: Decorator-Based Lifetimes
import { Container } from "../src/index.js";
import { singleton, transient, scoped } from "../src/decorators/index.js";

@singleton()
class ConfigService {
  private config = { apiUrl: "https://api.example.com" };

  getConfig() {
    return this.config;
  }
}

@transient()
class Logger {
  private requestId = Math.random().toString(36);

  log(msg: string) {
    console.log(`[${this.requestId}] ${msg}`);
  }
}

@scoped()
class RequestContext {
  public readonly requestId: string;

  constructor() {
    this.requestId = Math.random().toString(36);
  }
}

console.log("\n=== Example 7: Decorator-Based Lifetimes ===\n");

const container = new Container();

// Decorators now control lifetimes automatically!
container.register(ConfigService);
container.register(Logger);
container.register(RequestContext);

// ConfigService will be singleton (as declared by decorator)
const config1 = container.resolve(ConfigService);
const config2 = container.resolve(ConfigService);
console.log("Config instances are same (singleton):", config1 === config2);
console.log("Config API URL:", config1.getConfig().apiUrl);

// Logger will be transient (new instance each time)
const logger1 = container.resolve(Logger);
const logger2 = container.resolve(Logger);
console.log("\nLogger instances are different (transient):", logger1 !== logger2);
logger1.log("Message from logger1");
logger2.log("Message from logger2");

// RequestContext will be scoped
const scope1 = container.createScope();
const ctx1a = scope1.resolve(RequestContext);
const ctx1b = scope1.resolve(RequestContext);
console.log("\nContext instances in same scope are same:", ctx1a === ctx1b);

const scope2 = container.createScope();
const ctx2 = scope2.resolve(RequestContext);
console.log("Context instances in different scopes are different:", ctx1a !== ctx2);

await scope1.dispose();
await scope2.dispose();

console.log("\n✅ Example 7 completed successfully!\n");
