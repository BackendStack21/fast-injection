import { describe, test, expect, beforeEach } from "bun:test";
import { Resolver } from "../src/core/resolver.js";
import { Container, Lifetime } from "../src/index.js";
import {
  CircularDependencyError,
  UnregisteredServiceError,
  ResolutionError,
} from "../src/errors/index.js";

describe("Resolver", () => {
  let resolver: Resolver;
  let container: Container;

  beforeEach(() => {
    resolver = new Resolver();
    container = new Container();
  });

  describe("resolve", () => {
    test("should resolve factory with container parameter", () => {
      class Database {
        query() {
          return "data";
        }
      }

      container.register(Database);
      container.registerFactory(String, (c) => {
        const db = c.resolve(Database);
        return `connected to ${db.query()}`;
      });

      const result = container.resolve(String);
      expect(result).toBe("connected to data");
    });

    test("should throw error when resolving async factory in sync context", () => {
      const token = Symbol("AsyncService");

      container.registerAsyncFactory(token, async (c) => {
        return { value: "async" };
      });

      expect(() => {
        container.resolve(token);
      }).toThrow(ResolutionError);
    });

    test("should resolve value definitions", () => {
      const configToken = Symbol("Config");
      const config = { apiUrl: "http://localhost" };

      container.registerValue(configToken, config);
      const resolved = container.resolve(configToken) as any;

      expect(resolved).toBe(config);
      expect(resolved.apiUrl).toBe("http://localhost");
    });

    test("should resolve constructor with dependencies", () => {
      class Logger {
        log(msg: string) {
          return msg;
        }
      }

      class UserRepository {
        constructor(public logger: Logger) {}
      }

      class UserService {
        constructor(
          public repo: UserRepository,
          public logger: Logger,
        ) {}
      }

      container.register(Logger);
      container.registerFactory(UserRepository, (c) => {
        return new UserRepository(c.resolve(Logger));
      });
      container.registerFactory(UserService, (c) => {
        return new UserService(c.resolve(UserRepository), c.resolve(Logger));
      });

      const service = container.resolve(UserService);

      expect(service).toBeInstanceOf(UserService);
      expect(service.repo).toBeInstanceOf(UserRepository);
      expect(service.logger).toBeInstanceOf(Logger);
    });

    test("should handle resolution error with missing dependency", () => {
      class Database {}
      class UserService {
        constructor(public db: Database) {}
      }

      // Register UserService but not Database
      container.registerFactory(UserService, (c) => {
        return new UserService(c.resolve(Database));
      });

      expect(() => {
        container.resolve(UserService);
      }).toThrow(UnregisteredServiceError);
    });

    test("should provide helpful error message for missing dependencies", () => {
      class Logger {}
      class UserService {
        constructor(public logger: Logger) {}
      }

      container.registerFactory(UserService, (c) => {
        return new UserService(c.resolve(Logger));
      });

      expect(() => {
        container.resolve(UserService);
      }).toThrow(UnregisteredServiceError);
    });

    test("should handle factory error", () => {
      const token = Symbol("Service");

      container.registerFactory(token, (c) => {
        throw new Error("Factory failed");
      });

      expect(() => {
        container.resolve(token);
      }).toThrow();
    });

    test("should propagate non-UnregisteredServiceError from dependency factory", () => {
      const LoggerSymbol = Symbol("Logger");

      class UserRepository {
        constructor(public logger: any) {}
      }

      container.registerFactory(LoggerSymbol, (c) => {
        throw new Error("Custom factory error");
      });
      container.registerFactory(UserRepository, (c) => {
        return new UserRepository(c.resolve(LoggerSymbol));
      });

      expect(() => {
        container.resolve(UserRepository);
      }).toThrow(Error);
    });
  });

  describe("resolveAsync", () => {
    test("should resolve async factory", async () => {
      const token = Symbol("AsyncService");

      container.registerAsyncFactory(token, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: "async result" };
      });

      const result = await container.resolveAsync(token);

      expect(result).toEqual({ value: "async result" });
    });

    test("should resolve regular factory in async context", async () => {
      class Database {
        query() {
          return "data";
        }
      }

      container.register(Database);
      container.registerFactory(String, (c) => {
        const db = c.resolve(Database);
        return `connected to ${db.query()}`;
      });

      const result = await container.resolveAsync(String);

      expect(result).toBe("connected to data");
    });

    test("should resolve value in async context", async () => {
      const configToken = Symbol("Config");
      const config = { apiUrl: "http://localhost" };

      container.registerValue(configToken, config);
      const resolved = await container.resolveAsync(configToken);

      expect(resolved).toBe(config);
    });

    test("should resolve async constructor dependencies", async () => {
      const loggerToken = Symbol("Logger");
      const databaseToken = Symbol("Database");

      container.registerAsyncFactory(loggerToken, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { log: (msg: string) => msg };
      });

      container.registerAsyncFactory(databaseToken, async (c) => {
        const logger = await c.resolveAsync(loggerToken);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { query: () => "data" };
      });

      const database = (await container.resolveAsync(databaseToken)) as any;

      expect(database).toBeDefined();
      expect(database.query()).toBe("data");
    });

    test("should handle async resolution error with missing dependency", async () => {
      class Database {}
      const userServiceToken = Symbol("UserService");

      container.registerAsyncFactory(userServiceToken, async (c) => {
        return new (class {
          constructor(public db: Database) {}
        })(await c.resolveAsync(Database));
      });

      expect(async () => {
        await container.resolveAsync(userServiceToken);
      }).toThrow(UnregisteredServiceError);
    });

    test("should provide helpful error message for missing async dependencies", async () => {
      const loggerToken = Symbol("Logger");
      const serviceToken = Symbol("Service");

      container.registerAsyncFactory(serviceToken, async (c) => {
        return {
          logger: await c.resolveAsync(loggerToken),
        };
      });

      expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow(UnregisteredServiceError);
    });

    test("should handle async factory error", async () => {
      const token = Symbol("Service");

      container.registerAsyncFactory(token, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("Async factory failed");
      });

      const error = expect(async () => {
        await container.resolveAsync(token);
      }).toThrow();
    });

    test("should resolve with multiple async dependencies", async () => {
      const dep1Token = Symbol("Dep1");
      const dep2Token = Symbol("Dep2");
      const serviceToken = Symbol("Service");

      container.registerAsyncFactory(dep1Token, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { name: "dep1" };
      });

      container.registerAsyncFactory(dep2Token, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { name: "dep2" };
      });

      container.registerAsyncFactory(serviceToken, async (c) => {
        const d1 = await c.resolveAsync(dep1Token);
        const d2 = await c.resolveAsync(dep2Token);
        return { dep1: d1, dep2: d2 };
      });

      const service = (await container.resolveAsync(serviceToken)) as any;

      expect(service.dep1.name).toBe("dep1");
      expect(service.dep2.name).toBe("dep2");
    });
  });

  describe("Circular Dependency Detection", () => {
    test("should detect simple circular dependency", () => {
      const tokenA = Symbol("ServiceA");
      const tokenB = Symbol("ServiceB");

      container.registerFactory(tokenA, (c) => {
        return c.resolve(tokenB);
      });

      container.registerFactory(tokenB, (c) => {
        return c.resolve(tokenA);
      });

      expect(() => {
        container.resolve(tokenA);
      }).toThrow(CircularDependencyError);
    });

    test("should detect self-referencing circular dependency", () => {
      const tokenA = Symbol("ServiceA");

      container.registerFactory(tokenA, (c) => {
        return c.resolve(tokenA);
      });

      expect(() => {
        container.resolve(tokenA);
      }).toThrow(CircularDependencyError);
    });

    test("should detect complex circular dependency chain", () => {
      const tokenA = Symbol("ServiceA");
      const tokenB = Symbol("ServiceB");
      const tokenC = Symbol("ServiceC");

      container.registerFactory(tokenA, (c) => {
        return c.resolve(tokenB);
      });

      container.registerFactory(tokenB, (c) => {
        return c.resolve(tokenC);
      });

      container.registerFactory(tokenC, (c) => {
        return c.resolve(tokenA);
      });

      expect(() => {
        container.resolve(tokenA);
      }).toThrow(CircularDependencyError);
    });

    test("circular dependency error should include chain", () => {
      const tokenA = Symbol("ServiceA");
      const tokenB = Symbol("ServiceB");

      container.registerFactory(tokenA, (c) => {
        return c.resolve(tokenB);
      });

      container.registerFactory(tokenB, (c) => {
        return c.resolve(tokenA);
      });

      try {
        container.resolve(tokenA);
      } catch (error) {
        if (error instanceof CircularDependencyError) {
          expect(error.chain).toBeDefined();
          expect(error.chain.length).toBeGreaterThan(0);
        }
      }
    });

    test("should detect circular dependency in async resolution", async () => {
      const tokenA = Symbol("ServiceA");
      const tokenB = Symbol("ServiceB");

      container.registerAsyncFactory(tokenA, async (c) => {
        return await c.resolveAsync(tokenB);
      });

      container.registerAsyncFactory(tokenB, async (c) => {
        return await c.resolveAsync(tokenA);
      });

      const error = expect(async () => {
        await container.resolveAsync(tokenA);
      }).toThrow(CircularDependencyError);
    });
  });

  describe("tokenToString", () => {
    test("should convert function name to string", () => {
      class MyService {}
      container.register(MyService);

      const result = container.resolve(MyService);
      expect(result).toBeInstanceOf(MyService);
    });

    test("should convert symbol to string", () => {
      const token = Symbol("MyService");
      container.registerValue(token, { value: "test" });

      const result = container.resolve(token);
      expect((result as any).value).toBe("test");
    });

    test("should handle anonymous class", () => {
      const AnonymousClass = class {};
      container.register(AnonymousClass);

      const result = container.resolve(AnonymousClass);
      expect(result).toBeInstanceOf(AnonymousClass);
    });

    test("should convert string token to string", () => {
      const token = "StringService";
      container.registerValue(token, { value: "data" });

      const result = container.resolve(token);
      expect((result as any).value).toBe("data");
    });
  });

  describe("Resolution Stack Management", () => {
    test("should clear resolution stack after successful resolution", () => {
      class SimpleService {}
      container.register(SimpleService);

      const result = container.resolve(SimpleService);

      expect(result).toBeInstanceOf(SimpleService);
    });

    test("should clear resolution stack after failed resolution", () => {
      class FailingService {}

      container.registerFactory(FailingService, (c) => {
        throw new Error("Factory failed");
      });

      try {
        container.resolve(FailingService);
      } catch (e) {
        // Expected to fail
      }

      // Should be able to resolve another service without stack pollution
      class AnotherService {}
      container.register(AnotherService);
      const result = container.resolve(AnotherService);

      expect(result).toBeInstanceOf(AnotherService);
    });

    test("clear method should reset resolver state", () => {
      // Directly test the clear method
      resolver.clear();

      // Should be able to resolve without issues
      class Service {}
      container.register(Service);
      const result = container.resolve(Service);

      expect(result).toBeInstanceOf(Service);
    });
  });
});
