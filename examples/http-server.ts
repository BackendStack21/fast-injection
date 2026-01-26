import { Container } from "../src/index.js";
import { singleton, scoped } from "../src/decorators/index.js";

// Configuration service
class Config {
  constructor(
    public readonly host: string = "localhost",
    public readonly port: number = 3000,
  ) {}
}

// Logger service
@singleton()
class Logger {
  log(message: string) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}

// Request-scoped service
@scoped()
class RequestContext {
  constructor(public readonly requestId: string = Math.random().toString(36)) {}
}

// Request handler
class RequestHandler {
  constructor(
    private config: Config,
    private logger: Logger,
    private context: RequestContext,
  ) {}

  async handle(path: string) {
    this.logger.log(`[${this.context.requestId}] Handling request: ${path}`);
    return {
      requestId: this.context.requestId,
      path,
      config: `${this.config.host}:${this.config.port}`,
    };
  }
}

// Setup container
const container = new Container();

container.registerValue(Config, new Config("localhost", 8080));
container.register(Logger); // Decorator controls lifetime
container.register(RequestContext); // Decorator controls lifetime
container.registerFactory(RequestHandler, (c) => {
  return new RequestHandler(c.resolve(Config), c.resolve(Logger), c.resolve(RequestContext));
});

console.log("\n=== Bun HTTP Server Example ===\n");

// Simulate HTTP server with Bun
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    // Create a new scope for each request
    const scope = container.createScope();

    try {
      const handler = scope.resolve(RequestHandler);
      const result = await handler.handle(new URL(req.url).pathname);

      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      // Clean up request scope
      await scope.dispose();
    }
  },
});

console.log(`Server running at http://localhost:${server.port}`);
console.log("Try: curl http://localhost:3000/users");
console.log("Press Ctrl+C to stop\n");
