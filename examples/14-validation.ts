#!/usr/bin/env bun
// Example 14: Validating the dependency graph at startup
import { Container, Lifetime, ValidationError } from "../src/index.js";

class Database {}
class Mailer {}
class RequestContext {}

class UserService {
  constructor(
    public db: Database,
    public mailer: Mailer,
  ) {}
}

class A {
  constructor(public b: unknown) {}
}
class B {
  constructor(public a: unknown) {}
}

class Cache {
  constructor(public ctx: RequestContext) {}
}

console.log("\n=== Example 14: Container Validation ===\n");

const container = new Container();
container.register(Database, { lifetime: Lifetime.Singleton });
// Mailer is not registered, so UserService has a missing dependency
container.register(UserService, { dependencies: [Database, Mailer] });

// A <-> B form a cycle
container.register(A, { dependencies: [B] });
container.register(B, { dependencies: [A] });

// A singleton that depends on a scoped service would pin one request's instance forever
container.register(RequestContext, { lifetime: Lifetime.Scoped });
container.register(Cache, {
  lifetime: Lifetime.Singleton,
  dependencies: [RequestContext],
});

try {
  // Nothing is instantiated: only constructor registrations are inspected (factories are opaque).
  // Tokens registered later in request scopes would show up as "missing" here:
  // validate from a representative scope, or declare such dependencies optional.
  container.validate();
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(`validate() found ${error.issues.length} issue(s):\n`);
    for (const issue of error.issues) {
      console.log(`  [${issue.type}] ${issue.message}`);
    }
  } else {
    throw error;
  }
}

// A correct graph passes silently
const good = new Container();
good.register(Database, { lifetime: Lifetime.Singleton });
good.register(Mailer);
good.register(UserService, { dependencies: [Database, Mailer] });
good.validate();
console.log("\nA valid container passes validate() without instantiating anything.");

console.log("\n✅ Example 14 completed!\n");
