import { describe, test, expect, beforeEach } from "bun:test";
import {
  Container,
  Lifetime,
  createToken,
  CircularDependencyError,
  ResolutionError,
  UnregisteredServiceError,
  RegistrationError,
  ValidationError,
} from "../src/index.js";
import type { IContainer } from "../src/index.js";
import { inject, optional } from "../src/decorators/index.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Explicit dependencies (decorator-free constructor injection)", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("injects dependencies declared at registration", () => {
    class Logger {}
    class Database {
      constructor(public logger: Logger) {}
    }
    class UserService {
      constructor(
        public db: Database,
        public logger: Logger,
        public apiUrl: string,
      ) {}
    }

    container.register(Logger, { lifetime: Lifetime.Singleton });
    container.register(Database, { dependencies: [Logger] });
    container.registerValue("apiUrl", "http://localhost");
    container.register(UserService, {
      dependencies: [Database, Logger, "apiUrl"],
    });

    const service = container.resolve(UserService);
    expect(service.db).toBeInstanceOf(Database);
    expect(service.logger).toBe(service.db.logger);
    expect(service.apiUrl).toBe("http://localhost");
  });

  test("works with token + implementation registration and async resolution", async () => {
    class Logger {}
    class Impl {
      constructor(
        public logger: Logger,
        public value: number,
      ) {}
    }

    container.register(Logger);
    container.registerAsyncFactory("value", async () => 42);
    container.register("service", Impl, { dependencies: [Logger, "value"] });

    const service = await container.resolveAsync<Impl>("service");
    expect(service.logger).toBeInstanceOf(Logger);
    expect(service.value).toBe(42);
  });

  test("takes precedence over @inject metadata", () => {
    class Service {
      constructor(@inject("a") public value: string) {}
    }

    container.registerValue("a", "from-decorator");
    container.registerValue("b", "from-options");
    container.register(Service, { dependencies: ["b"] });

    expect(container.resolve(Service).value).toBe("from-options");
  });

  test("reports a missing explicit dependency", () => {
    class Service {
      constructor(public dep: unknown) {}
    }
    container.register(Service, { dependencies: ["missing"] });

    expect(() => container.resolve(Service)).toThrow(ResolutionError);
    expect(() => container.resolve(Service)).toThrow("Missing dependency: missing");
  });

  test("rejects malformed dependency lists", () => {
    class Service {}
    expect(() => container.register(Service, { dependencies: [undefined as any] })).toThrow(RegistrationError);
    expect(() => container.register(Service, { dependencies: "nope" as any })).toThrow(RegistrationError);
  });

  test("detects cycles between explicitly wired services", () => {
    class A {
      constructor(public b: unknown) {}
    }
    class B {
      constructor(public a: unknown) {}
    }
    container.register(A, { dependencies: [B] });
    container.register(B, { dependencies: [A] });

    expect(() => container.resolve(A)).toThrow(CircularDependencyError);
  });
});

describe("Typed tokens", () => {
  test("createToken returns unique symbols usable as tokens", () => {
    interface Config {
      apiUrl: string;
    }
    const CONFIG = createToken<Config>("config");
    const OTHER = createToken<Config>("config");
    const container = new Container();

    container.registerValue(CONFIG, { apiUrl: "a" });
    container.registerValue(OTHER, { apiUrl: "b" });

    expect(typeof CONFIG).toBe("symbol");
    expect(CONFIG).not.toBe(OTHER);
    // No type argument needed: inferred from the token
    const config = container.resolve(CONFIG);
    expect(config.apiUrl).toBe("a");
    expect(container.resolve(OTHER).apiUrl).toBe("b");
  });

  test("token description appears in error messages", () => {
    const TOKEN = createToken<number>("answer");
    expect(() => new Container().resolve(TOKEN)).toThrow("Symbol(answer)");
  });
});

describe("Optional resolution", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("tryResolve returns undefined for unregistered tokens", async () => {
    expect(container.tryResolve("nope")).toBeUndefined();
    expect(await container.tryResolveAsync("nope")).toBeUndefined();
  });

  test("tryResolve resolves registered tokens, including from parents", async () => {
    container.registerValue("value", 1);
    container.registerAsyncFactory("async", async () => 2);
    const scope = container.createScope();

    expect(scope.tryResolve<number>("value")).toBe(1);
    expect(await scope.tryResolveAsync<number>("async")).toBe(2);
  });

  test("tryResolve still throws when a registered service is broken", () => {
    class Broken {
      constructor(public dep: unknown) {}
    }
    container.register(Broken, { dependencies: ["missing"] });

    expect(() => container.tryResolve(Broken)).toThrow(ResolutionError);
  });

  test("optional explicit dependency resolves to undefined when unregistered", async () => {
    class Cache {}
    class Service {
      constructor(
        public cache?: Cache,
        public name?: string,
      ) {}
    }
    container.registerValue("name", "svc");
    container.register(Service, {
      dependencies: [{ token: Cache, optional: true }, { token: "name" }],
    });

    expect(container.resolve(Service).cache).toBeUndefined();
    expect(container.resolve(Service).name).toBe("svc");
    expect((await container.resolveAsync(Service)).cache).toBeUndefined();

    container.register(Cache);
    expect(container.resolve(Service).cache).toBeInstanceOf(Cache);
    expect((await container.resolveAsync(Service)).cache).toBeInstanceOf(Cache);
  });

  test("@optional() decorator injects undefined when unregistered", () => {
    class Cache {}
    class Service {
      constructor(
        @inject("name") public name: string,
        @inject(Cache) @optional() public cache?: Cache,
      ) {}
    }
    container.registerValue("name", "svc");
    container.register(Service);

    const service = container.resolve(Service);
    expect(service.name).toBe("svc");
    expect(service.cache).toBeUndefined();

    container.register(Cache);
    expect(container.resolve(Service).cache).toBeInstanceOf(Cache);
  });

  test("optional dependency that is registered but broken still throws", () => {
    class Broken {
      constructor(public dep: unknown) {}
    }
    class Service {
      constructor(public broken?: Broken) {}
    }
    container.register(Broken, { dependencies: ["missing"] });
    container.register(Service, {
      dependencies: [{ token: Broken, optional: true }],
    });

    expect(() => container.resolve(Service)).toThrow(ResolutionError);
  });
});

describe("validate()", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  const issuesOf = (target: IContainer) => {
    try {
      target.validate();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      return (error as ValidationError).issues;
    }
    return [];
  };

  test("passes for a valid graph without instantiating anything", () => {
    let constructed = 0;
    class Logger {
      constructor() {
        constructed++;
      }
    }
    class Service {
      constructor(public logger: Logger) {
        constructed++;
      }
    }
    container.register(Logger, { lifetime: Lifetime.Singleton });
    container.register(Service, { dependencies: [Logger] });
    container.registerFactory("factory", () => {
      constructed++;
      return 1;
    });

    expect(() => container.validate()).not.toThrow();
    expect(constructed).toBe(0);
  });

  test("reports missing dependencies but not optional ones", () => {
    class Service {
      constructor(
        public a: unknown,
        public b?: unknown,
      ) {}
    }
    container.register(Service, {
      dependencies: ["missing", { token: "optional", optional: true }],
    });

    const issues = issuesOf(container);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("missing");
    expect(issues[0]!.token).toBe(Service);
    expect(issues[0]!.path).toEqual([Service, "missing"]);
  });

  test("reports each cycle once", () => {
    class A {}
    class B {}
    class C {}
    container.register(A, { dependencies: [B] });
    container.register(B, { dependencies: [C] });
    container.register(C, { dependencies: [A] });

    const cycles = issuesOf(container).filter((issue) => issue.type === "circular");
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.path).toEqual([A, B, C, A]);
  });

  test("reports captive dependencies, including through transients", () => {
    class Scoped {}
    class Transient {}
    class Direct {}
    class Indirect {}
    class Fine {}
    container.register(Scoped, { lifetime: Lifetime.Scoped });
    container.register(Transient, { dependencies: [Scoped] });
    container.register(Direct, {
      lifetime: Lifetime.Singleton,
      dependencies: [Scoped],
    });
    container.register(Indirect, {
      lifetime: Lifetime.Singleton,
      dependencies: [Transient],
    });
    container.register(Fine, {
      lifetime: Lifetime.Scoped,
      dependencies: [Scoped, Transient],
    });

    const captive = issuesOf(container).filter((issue) => issue.type === "captive");
    expect(captive).toHaveLength(2);
    expect(captive.find((issue) => issue.token === Direct)!.path).toEqual([Direct, Scoped]);
    expect(captive.find((issue) => issue.token === Indirect)!.path).toEqual([Indirect, Transient, Scoped]);
  });

  test("sees parent registrations from a scope and honours shadowing", () => {
    class Dep {}
    class Service {
      constructor(public dep: Dep) {}
    }
    container.register(Service, { dependencies: [Dep] });
    expect(issuesOf(container)).toHaveLength(1);

    const scope = container.createScope();
    scope.register(Dep);
    expect(() => scope.validate()).not.toThrow();
  });

  test("validates registerAll implementations", () => {
    class Plugin {
      constructor(public dep: unknown) {}
    }
    container.registerAll("plugins", [Plugin], { dependencies: ["missing"] });

    expect(issuesOf(container)[0]!.type).toBe("missing");
  });

  test("error message lists every issue", () => {
    class A {}
    container.register(A, { dependencies: ["x", "y"] });

    expect(() => container.validate()).toThrow(/2 issue\(s\)[\s\S]*x[\s\S]*y/);
  });
});

describe("Explicit resource management", () => {
  test("await using disposes the scope at the end of the block", async () => {
    const container = new Container();
    let disposed = 0;
    class Resource {
      onDispose() {
        disposed++;
      }
    }
    container.register(Resource, { lifetime: Lifetime.Scoped });

    {
      await using scope = container.createScope();
      scope.resolve(Resource);
      expect(disposed).toBe(0);
    }

    expect(disposed).toBe(1);
  });

  test("Symbol.asyncDispose is equivalent to dispose()", async () => {
    const container = new Container();
    container.registerValue("x", 1);
    await container[Symbol.asyncDispose]();
    expect(container.has("x")).toBe(false);
  });
});

describe("Multi-registration", () => {
  test("singleton implementations each keep their own instance", () => {
    const container = new Container();
    class A {}
    class B {}
    container.registerAll("plugins", [A, B], { lifetime: Lifetime.Singleton });

    const first = container.resolveAll("plugins");
    const second = container.resolveAll("plugins");
    expect(first[0]).toBeInstanceOf(A);
    expect(first[1]).toBeInstanceOf(B);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  test("multi and single registrations of the same token do not share instances", () => {
    const container = new Container();
    class Single {}
    class Multi {}
    container.register("token", Single, { lifetime: Lifetime.Singleton });
    container.registerAll("token", [Multi], { lifetime: Lifetime.Singleton });

    expect(container.resolve("token")).toBeInstanceOf(Single);
    expect(container.resolveAll("token")[0]).toBeInstanceOf(Multi);
  });

  test("scoped implementations registered on the parent are per scope", () => {
    const container = new Container();
    class Handler {}
    container.registerAll("handlers", [Handler], { lifetime: Lifetime.Scoped });

    const scopeA = container.createScope();
    const scopeB = container.createScope();
    expect(scopeA.resolveAll("handlers")[0]).toBe(scopeA.resolveAll("handlers")[0]);
    expect(scopeA.resolveAll("handlers")[0]).not.toBe(scopeB.resolveAll("handlers")[0]);
  });

  test("resolveAllAsync resolves implementations and returns [] when unregistered", async () => {
    const container = new Container();
    class A {
      constructor(public value: number) {}
    }
    container.registerAsyncFactory("value", async () => 7);
    container.registerAll("plugins", [A], { dependencies: ["value"] });

    const plugins = await container.resolveAllAsync<A>("plugins");
    expect(plugins[0]!.value).toBe(7);
    expect(await container.resolveAllAsync("none")).toEqual([]);
    expect(container.resolveAll("none")).toEqual([]);
  });
});

describe("Regression: correctness fixes", () => {
  test("replace: true replaces a registration and drops the cached instance", () => {
    const container = new Container();
    class First {}
    class Second {}
    container.register("service", First, { lifetime: Lifetime.Singleton });
    expect(container.resolve("service")).toBeInstanceOf(First);

    container.register("service", Second, {
      lifetime: Lifetime.Singleton,
      replace: true,
    });
    expect(container.resolve("service")).toBeInstanceOf(Second);

    container.registerFactory("service", () => "factory", { replace: true });
    expect(container.resolve<unknown>("service")).toBe("factory");

    container.registerValue("service", "value", { replace: true });
    expect(container.resolve<unknown>("service")).toBe("value");
  });

  test("duplicate registration without replace still throws", () => {
    const container = new Container();
    container.registerValue("x", 1);
    expect(() => container.registerValue("x", 2)).toThrow(RegistrationError);
  });

  test("replaced singleton is still disposed with the container", async () => {
    const container = new Container();
    let disposed = 0;
    class First {
      onDispose() {
        disposed++;
      }
    }
    container.register("service", First, { lifetime: Lifetime.Singleton });
    container.resolve("service");
    container.registerValue("service", 1, { replace: true });

    await container.dispose();
    expect(disposed).toBe(1);
  });

  test("factories receive a fully functional container", () => {
    const container = new Container();
    container.registerValue("x", 1);
    container.registerFactory("probe", (c) => ({
      has: c.has("x"),
      missing: c.tryResolve("missing"),
      scope: c.createScope(),
      all: c.resolveAll("none"),
    }));

    const probe = container.resolve<any>("probe");
    expect(probe.has).toBe(true);
    expect(probe.missing).toBeUndefined();
    expect(probe.scope.resolve("x")).toBe(1);
    expect(probe.all).toEqual([]);
  });

  test("a factory can keep its container and resolve its own token later", () => {
    const container = new Container();
    let count = 0;
    container.registerFactory("node", (c) => ({
      id: ++count,
      next: () => c.resolve<any>("node"),
    }));

    const node = container.resolve<any>("node");
    expect(node.next().id).toBe(2);
  });

  test("functions and classes registered as values are returned as-is", async () => {
    const container = new Container();
    const fn = () => 42;
    class Klass {}
    container.registerValue("fn", fn);
    container.registerValue("class", Klass);

    expect(container.resolve<unknown>("fn")).toBe(fn);
    expect(container.resolve<unknown>("class")).toBe(Klass);
    expect(await container.resolveAsync<unknown>("fn")).toBe(fn);
  });

  test("registerAsyncFactory accepts promise-returning non-async functions", async () => {
    const container = new Container();
    container.registerAsyncFactory("value", () => Promise.resolve(5));

    expect(() => container.resolve("value")).toThrow("Async factory must be resolved using resolveAsync()");
    expect(await container.resolveAsync<number>("value")).toBe(5);
  });

  test("async diamond dependencies are not reported as circular", async () => {
    const container = new Container();
    container.registerAsyncFactory("D", async () => {
      await sleep(5);
      return "d";
    });
    container.registerAsyncFactory("B", async (c) => (await c.resolveAsync<string>("D")) + "b");
    container.registerAsyncFactory("C", async (c) => (await c.resolveAsync<string>("D")) + "c");
    class A {
      constructor(
        public b: string,
        public c: string,
      ) {}
    }
    container.register(A, { dependencies: ["B", "C"] });

    const a = await container.resolveAsync(A);
    expect([a.b, a.c]).toEqual(["db", "dc"]);
  });

  test("async cycle through a pending singleton rejects instead of hanging", async () => {
    const container = new Container();
    container.registerAsyncFactory(
      "A",
      async (c) => {
        await sleep(1);
        return c.resolveAsync("B");
      },
      { lifetime: Lifetime.Singleton },
    );
    container.registerAsyncFactory(
      "B",
      async (c) => {
        await sleep(1);
        return c.resolveAsync("A");
      },
      { lifetime: Lifetime.Singleton },
    );

    const outcome = await Promise.race([
      container.resolveAsync("A").catch((error) => error),
      sleep(500).then(() => "timeout"),
    ]);
    expect(outcome).toBeInstanceOf(CircularDependencyError);
  });

  test("concurrent async singleton resolutions share one instance", async () => {
    const container = new Container();
    let created = 0;
    container.registerAsyncFactory(
      "db",
      async () => {
        await sleep(5);
        return { id: ++created };
      },
      { lifetime: Lifetime.Singleton },
    );

    const [a, b] = await Promise.all([container.resolveAsync("db"), container.resolveAsync("db")]);
    expect(a).toBe(b);
    expect(created).toBe(1);
  });

  test("a scope can shadow a parent singleton that is already instantiated", () => {
    const container = new Container();
    container.registerFactory("service", () => "parent", {
      lifetime: Lifetime.Singleton,
    });
    expect(container.resolve<string>("service")).toBe("parent");

    const scope = container.createScope();
    scope.registerFactory("service", () => "child", {
      lifetime: Lifetime.Singleton,
    });
    expect(scope.resolve<string>("service")).toBe("child");
    expect(container.resolve<string>("service")).toBe("parent");
  });

  test("parent singletons are shared with scopes created before first resolution", () => {
    const container = new Container();
    class Shared {}
    container.register(Shared, { lifetime: Lifetime.Singleton });

    const scope = container.createScope();
    const fromScope = scope.resolve(Shared);
    expect(container.resolve(Shared)).toBe(fromScope);
    expect(container.createScope().createScope().resolve(Shared)).toBe(fromScope);
  });

  test("resolveAsync waits for async onInit", async () => {
    const container = new Container();
    class Service {
      ready = false;
      async onInit() {
        await sleep(5);
        this.ready = true;
      }
    }
    container.register(Service, { lifetime: Lifetime.Singleton });

    expect((await container.resolveAsync(Service)).ready).toBe(true);
  });

  test("a rejecting onDispose does not leave the container half disposed", async () => {
    const container = new Container();
    let disposed = 0;
    class Failing {
      async onDispose() {
        throw new Error("boom");
      }
    }
    class Healthy {
      async onDispose() {
        disposed++;
      }
    }
    container.register(Healthy, { lifetime: Lifetime.Singleton });
    container.register(Failing, { lifetime: Lifetime.Singleton });
    container.resolve(Healthy);
    container.resolve(Failing);

    await expect(container.dispose()).rejects.toThrow("boom");
    expect(disposed).toBe(1);
    expect(container.has(Healthy)).toBe(false);

    // Hooks are not run a second time
    await container.dispose();
    expect(disposed).toBe(1);
  });

  test("unregistered token error is preserved through scopes", () => {
    const scope = new Container().createScope().createScope();
    expect(() => scope.resolve("missing")).toThrow(UnregisteredServiceError);
  });
});

describe("Memory: transient instances", () => {
  test("live transients are still disposed with the container", async () => {
    const container = new Container();
    let disposed = 0;
    class Resource {
      onDispose() {
        disposed++;
      }
    }
    container.register(Resource);
    const held = [container.resolve(Resource), container.resolve(Resource)];

    await container.dispose();
    expect(disposed).toBe(2);
    expect(held).toHaveLength(2);
  });

  test("collected transients are not retained by the container", async () => {
    const container = new Container();
    class Resource {
      payload = new Array(64).fill(0);
      onDispose() {}
    }
    container.register(Resource);

    const tracked = () => (container as any).lifecycle.disposables.size as number;
    for (let i = 0; i < 20_000; i++) {
      container.resolve(Resource);
    }

    for (let attempt = 0; attempt < 20 && tracked() > 2_000; attempt++) {
      Bun.gc(true);
      await sleep(20);
    }
    expect(tracked()).toBeLessThan(2_000);
  });

  test("instances with only onInit are never tracked", () => {
    const container = new Container();
    let initialised = 0;
    class Service {
      onInit() {
        initialised++;
      }
    }
    container.register(Service);
    container.resolve(Service);
    container.resolve(Service);

    expect(initialised).toBe(2);
    expect((container as any).lifecycle.disposables.size).toBe(0);
  });
});

describe("Regression: adversarial review findings", () => {
  const collect = async (alive: () => number, limit: number) => {
    for (let attempt = 0; attempt < 40 && alive() > limit; attempt++) {
      Bun.gc(true);
      await sleep(15);
    }
    return alive();
  };

  test("abandoned scopes holding disposable transients are collectable", async () => {
    const container = new Container();
    class Conn {
      onDispose() {}
    }
    class Session {
      payload = new Array(256).fill(0);
      constructor(public conn: Conn) {}
      onDispose() {}
    }
    container.register(Conn);
    container.register(Session, {
      lifetime: Lifetime.Scoped,
      dependencies: [Conn],
    });

    const refs: WeakRef<object>[] = [];
    (() => {
      for (let i = 0; i < 200; i++) {
        // Scope is intentionally never disposed
        refs.push(new WeakRef(container.createScope().resolve(Session)));
      }
    })();

    const alive = () => refs.filter((ref) => ref.deref() !== undefined).length;
    expect(await collect(alive, 20)).toBeLessThanOrEqual(20);
  });

  test("services resolved during disposal reuse the existing instances", async () => {
    const container = new Container();
    let loggers = 0;
    class Logger {
      constructor() {
        loggers++;
      }
      onDispose() {}
    }
    class Service {
      async onDispose() {
        container.resolve(Logger);
        await sleep(5);
        container.resolve(Logger);
      }
    }
    container.register(Logger, { lifetime: Lifetime.Singleton });
    container.register(Service, { lifetime: Lifetime.Singleton });
    container.resolve(Logger);
    container.resolve(Service);

    const disposing = container.dispose();
    container.resolve(Logger); // late caller during shutdown
    await disposing;

    expect(loggers).toBe(1);
    expect((container as any).lifecycle.singletons.size).toBe(0);
    expect((container as any).lifecycle.disposables.size).toBe(0);
  });

  test("concurrent dispose() calls wait for the same hooks and run them once", async () => {
    const container = new Container();
    let started = 0;
    let finished = 0;
    class Service {
      async onDispose() {
        started++;
        await sleep(20);
        finished++;
      }
    }
    container.register(Service, { lifetime: Lifetime.Singleton });
    container.resolve(Service);

    const first = container.dispose();
    await container.dispose();
    expect(finished).toBe(1);
    await first;
    expect(started).toBe(1);
  });

  test("an async onInit may resolve services that depend on its own instance", async () => {
    const container = new Container();
    class Db {
      repo?: { db: Db };
      self?: Db;
      async onInit() {
        this.repo = await container.resolveAsync<{ db: Db }>("repo");
        this.self = await container.resolveAsync(Db);
      }
    }
    container.register(Db, { lifetime: Lifetime.Singleton });
    container.registerAsyncFactory("repo", async (c) => ({ db: await c.resolveAsync(Db) }));

    const db = await Promise.race([container.resolveAsync(Db), sleep(500).then(() => "timeout" as const)]);
    expect(db).toBeInstanceOf(Db);
    expect((db as Db).repo!.db).toBe(db as Db);
    expect((db as Db).self).toBe(db as Db);
    expect((container as any).lifecycle.pendingAsync.size).toBe(0);
  });

  test("a hook disposing its own container does not re-run hooks or drop live caches", async () => {
    const container = new Container();
    let disposed = 0;
    let loggers = 0;
    class Logger {
      constructor() {
        loggers++;
      }
      onDispose() {
        disposed++;
        container.resolve(Logger);
      }
    }
    class Service {
      onDispose() {
        disposed++;
        void container.dispose();
      }
    }
    container.register(Logger, { lifetime: Lifetime.Singleton });
    container.register(Service, { lifetime: Lifetime.Singleton });
    container.resolve(Logger);
    container.resolve(Service);

    await container.dispose();
    expect(disposed).toBe(2);
    expect(loggers).toBe(1);
  });

  test("an instance first tracked by an abandoned scope is still disposed by another scope", async () => {
    const container = new Container();
    let initialised = 0;
    let disposed = 0;
    const shared = {
      onInit() {
        initialised++;
      },
      onDispose() {
        disposed++;
      },
    };

    const abandoned = container.createScope();
    abandoned.registerValue("x", shared);
    abandoned.resolve("x");

    const scope = container.createScope();
    scope.registerValue("x", shared);
    scope.resolve("x");
    await scope.dispose();

    expect(initialised).toBe(2);
    expect(disposed).toBe(1);
  });

  test("collecting many transients does not stall", async () => {
    const container = new Container();
    class Resource {
      onDispose() {}
    }
    container.register(Resource);

    const started = performance.now();
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 20_000; i++) {
        container.resolve(Resource);
      }
      Bun.gc(true);
      await sleep(10);
    }
    await collect(() => (container as any).lifecycle.disposables.size, 2_000);

    // Quadratic finalization took seconds here; linear takes a few dozen milliseconds
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  test("replace during an in-flight async creation keeps the replacement", async () => {
    const container = new Container();
    container.registerAsyncFactory(
      "service",
      async () => {
        await sleep(20);
        return "old";
      },
      { lifetime: Lifetime.Singleton },
    );
    const inFlight = container.resolveAsync<string>("service");

    container.registerAsyncFactory("service", async () => "new", {
      lifetime: Lifetime.Singleton,
      replace: true,
    });
    expect(await container.resolveAsync<string>("service")).toBe("new");
    expect(await inFlight).toBe("old"); // callers already waiting get what they asked for
    expect(await container.resolveAsync<string>("service")).toBe("new");
  });

  test("failure of a replaced in-flight creation is not cached for the replacement", async () => {
    const container = new Container();
    let attempts = 0;
    container.registerAsyncFactory(
      "service",
      async () => {
        await sleep(10);
        throw new Error("old failed");
      },
      { lifetime: Lifetime.Singleton },
    );
    const inFlight = container.resolveAsync("service").catch((error) => error);

    container.registerAsyncFactory(
      "service",
      async () => {
        await sleep(30);
        return ++attempts;
      },
      { lifetime: Lifetime.Singleton, replace: true },
    );
    const replacement = container.resolveAsync<number>("service");
    expect(((await inFlight) as Error).message).toBe("old failed");

    expect(await replacement).toBe(1);
    expect(await container.resolveAsync<number>("service")).toBe(1);
  });

  test("an async creation still running when the container is disposed is not cached", async () => {
    const container = new Container();
    container.registerAsyncFactory(
      "service",
      async () => {
        await sleep(20);
        return "old";
      },
      { lifetime: Lifetime.Singleton },
    );
    const inFlight = container.resolveAsync<string>("service");
    await container.dispose();

    container.registerValue("service", "new");
    expect(await inFlight).toBe("old");
    expect(container.resolve<string>("service")).toBe("new");
  });

  test("an async factory throwing synchronously does not leave a pending entry", async () => {
    const container = new Container();
    container.registerAsyncFactory(
      "service",
      (() => {
        throw new Error("sync");
      }) as any,
      { lifetime: Lifetime.Singleton },
    );

    await expect(container.resolveAsync("service")).rejects.toThrow("sync");
    expect((container as any).lifecycle.pendingAsync.size).toBe(0);
  });

  test("an instance aliased by a transient factory is tracked and disposed once", async () => {
    const container = new Container();
    let initialised = 0;
    let disposed = 0;
    class Db {
      onInit() {
        initialised++;
      }
      onDispose() {
        disposed++;
      }
    }
    container.register(Db, { lifetime: Lifetime.Singleton });
    container.registerFactory("db", (c) => c.resolve(Db));

    for (let i = 0; i < 1_000; i++) {
      container.resolve("db");
    }
    expect((container as any).lifecycle.disposables.size).toBe(1);

    await container.dispose();
    expect(initialised).toBe(1);
    expect(disposed).toBe(1);
  });

  test("disposing a scope does not dispose a parent singleton it aliases", async () => {
    const container = new Container();
    let disposed = 0;
    class Db {
      onDispose() {
        disposed++;
      }
    }
    container.register(Db, { lifetime: Lifetime.Singleton });
    container.registerFactory("db", (c) => c.resolve(Db), {
      lifetime: Lifetime.Scoped,
    });

    const scope = container.createScope();
    scope.resolve("db");
    await scope.dispose();
    expect(disposed).toBe(0);

    await container.dispose();
    expect(disposed).toBe(1);
  });

  test("an instance is initialised again after its container was disposed and reused", async () => {
    const container = new Container();
    let initialised = 0;
    const shared = {
      onInit() {
        initialised++;
      },
      onDispose() {},
    };
    container.registerValue("shared", shared);
    container.resolve("shared");
    await container.dispose();

    container.registerValue("shared", shared);
    container.resolve("shared");
    expect(initialised).toBe(2);
  });

  test("a scope registration shadows a parent scoped service it already resolved", () => {
    const container = new Container();
    container.registerFactory("ctx", () => "parent", {
      lifetime: Lifetime.Scoped,
    });

    const scope = container.createScope();
    expect(scope.resolve<string>("ctx")).toBe("parent");
    scope.registerFactory("ctx", () => "own", { lifetime: Lifetime.Scoped });
    expect(scope.resolve<string>("ctx")).toBe("own");
  });

  test("validate() from a scope checks singletons against their owning container", () => {
    const container = new Container();
    class Dep {}
    class Service {
      constructor(public dep: Dep) {}
    }
    container.register(Service, {
      lifetime: Lifetime.Singleton,
      dependencies: [Dep],
    });

    const scope = container.createScope();
    scope.register(Dep);

    // At runtime the root singleton cannot see the scope's registration
    expect(() => scope.resolve(Service)).toThrow(ResolutionError);
    expect(() => scope.validate()).toThrow(ValidationError);
  });

  test("validate() checks everything under a singleton against the singleton's container", () => {
    const container = new Container();
    class Dep {}
    class Middle {
      constructor(public dep: Dep) {}
    }
    class Service {
      constructor(public middle: Middle) {}
    }
    container.register(Middle, { dependencies: [Dep] });
    container.register(Service, { lifetime: Lifetime.Singleton, dependencies: [Middle] });

    const scope = container.createScope();
    scope.register(Dep);

    // Middle is built for the root singleton, where Dep does not exist
    expect(() => scope.resolve(Service)).toThrow(ResolutionError);
    expect(() => scope.validate()).toThrow(ValidationError);
  });

  test("validate() ignores scope registrations a parent singleton can never see", () => {
    const container = new Container();
    class Dep {}
    class Middle {
      constructor(public dep: Dep) {}
    }
    class Service {
      constructor(public middle: Middle) {}
    }
    container.register(Dep);
    container.register(Middle, { dependencies: [Dep] });
    container.register(Service, { lifetime: Lifetime.Singleton, dependencies: [Middle] });

    const scope = container.createScope();
    // Shadowing Dep as scoped does not make the root singleton captive
    scope.register(Dep, { lifetime: Lifetime.Scoped });

    expect(scope.resolve(Service)).toBeInstanceOf(Service);
    expect(() => scope.validate()).not.toThrow();
  });
});
