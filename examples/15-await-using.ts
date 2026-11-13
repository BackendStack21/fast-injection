#!/usr/bin/env bun
// Example 15: Explicit resource management with `await using`
import { Container, Lifetime } from "../src/index.js";

class Database {
  onDispose() {
    console.log("[Database] closed (application shutdown)");
  }
}

class RequestContext {
  id = Math.random().toString(36).slice(2, 8);

  onDispose() {
    console.log(`[Request ${this.id}] disposed`);
  }
}

console.log("\n=== Example 15: await using ===\n");

const container = new Container();
container.register(Database, { lifetime: Lifetime.Singleton });
container.register(RequestContext, { lifetime: Lifetime.Scoped });

async function handleRequest(name: string) {
  // The scope is disposed automatically when the block exits, even on errors
  await using scope = container.createScope();
  const ctx = scope.resolve(RequestContext);
  console.log(`handling ${name} with request ${ctx.id}`);
}

await handleRequest("GET /users");
await handleRequest("GET /orders");

// Containers implement Symbol.asyncDispose, so the root can be used the same way
{
  await using app = new Container();
  app.register(Database, { lifetime: Lifetime.Singleton });
  app.resolve(Database);
  console.log("using the app container...");
}

await container.dispose();
console.log("\n✅ Example 15 completed!\n");
