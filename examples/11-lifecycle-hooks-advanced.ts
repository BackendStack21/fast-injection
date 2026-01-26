#!/usr/bin/env bun
// Example 11: Advanced Lifecycle Hooks
import { Container, Lifetime } from "../src/index.js";

class LoggerService {
  private started = false;

  onInit() {
    this.started = true;
    console.log("[Logger] initialized");
  }

  onDispose() {
    console.log("[Logger] disposed");
  }

  log(msg: string) {
    console.log("[Logger]", msg);
  }
}

class ConnectionService {
  private connected = false;

  async onInit() {
    console.log("[Connection] starting async init...");
    // Simulate async init
    await new Promise((r) => setTimeout(r, 50));
    this.connected = true;
    console.log("[Connection] connected");
  }

  async onDispose() {
    console.log("[Connection] shutting down...");
    await new Promise((r) => setTimeout(r, 20));
    console.log("[Connection] closed");
  }

  query(sql: string) {
    return `result: ${sql}`;
  }
}

class RequestScoped {
  id = Math.random().toString(36).slice(2, 8);

  onInit() {
    console.log(`[Request ${this.id}] init`);
  }

  onDispose() {
    console.log(`[Request ${this.id}] disposed`);
  }

  handle() {
    return `handled by ${this.id}`;
  }
}

console.log("\n=== Example 11: Advanced Lifecycle Hooks ===\n");

const container = new Container();

// Register a logger singleton (sync lifecycle)
container.register(LoggerService, { lifetime: Lifetime.Singleton });

// Register a connection singleton (async lifecycle)
container.register(ConnectionService, { lifetime: Lifetime.Singleton });

// Register a scoped request service
container.register(RequestScoped, { lifetime: Lifetime.Scoped });

// Resolve singletons (triggers onInit)
const logger = container.resolve(LoggerService);
const conn = await container.resolveAsync(ConnectionService);

logger.log(conn.query("SELECT 1"));

console.log("\n-- Simulate two request scopes --\n");

// Create a child container for a request (scoped instances belong to the child)
const req1 = container.createScope();
const r1 = req1.resolve(RequestScoped);
console.log(r1.handle());

// Dispose the child - should call onDispose for scoped instances only
console.log("\nDisposing request 1 (child)...");
await req1.dispose();

// Create second request scope to show fresh scoped instance
const req2 = container.createScope();
const r2 = req2.resolve(RequestScoped);
console.log(r2.handle());

console.log("\nDisposing request 2 (child)...");
await req2.dispose();

console.log("\nDisposing root container (cleans up singletons including async ones)...");
await container.dispose();

console.log("\n✅ Example 11 completed successfully!\n");
