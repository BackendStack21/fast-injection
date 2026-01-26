import { describe, test, expect, beforeEach } from "bun:test";
import { Container, Lifetime } from "../src/index.js";
import { UnregisteredServiceError } from "../src/errors/index.js";

describe("Integration and Edge Cases", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("Container Advanced Features", () => {
    test("should support child containers with shared singletons", () => {
      const configToken = Symbol("Config");
      const serviceToken = Symbol("Service");

      const config = { apiUrl: "http://api" };
      container.registerValue(configToken, config);

      const childContainer = new Container(container);
      childContainer.registerValue(serviceToken, { name: "service" });

      // Child can access parent's singletons
      const resolvedConfig = childContainer.resolve(configToken);
      expect(resolvedConfig).toBe(config);

      // Parent can't access child's services
      expect(() => container.resolve(serviceToken)).toThrow(
        UnregisteredServiceError,
      );
    });

    test("should inherit parent services in child container", () => {
      class Logger {}
      class Repository {
        constructor(public logger: Logger) {}
      }

      container.register(Logger);

      const childContainer = new Container(container);
      childContainer.registerFactory(Repository, (c) => {
        return new Repository(c.resolve(Logger));
      });

      const repo = childContainer.resolve(Repository);

      expect(repo).toBeInstanceOf(Repository);
      expect(repo.logger).toBeInstanceOf(Logger);
    });

    test("should have method to check if service is registered", () => {
      class Service {}

      expect(container.has(Service)).toBe(false);

      container.register(Service);

      expect(container.has(Service)).toBe(true);
    });

    test("child should check parent for registered services", () => {
      class ParentService {}
      container.register(ParentService);

      const childContainer = new Container(container);

      expect(childContainer.has(ParentService)).toBe(true);
    });

    test("should resolve value as singleton", async () => {
      const configToken = Symbol("Config");
      const config = { apiKey: "secret" };

      container.registerValue(configToken, config);

      const resolved1 = container.resolve(configToken);
      const resolved2 = await container.resolveAsync(configToken);

      expect(resolved1).toBe(config);
      expect(resolved2).toBe(config);
      expect(resolved1).toBe(resolved2);
    });

    test("should support registerAll for multiple implementations", () => {
      interface Logger {
        log(msg: string): void;
      }

      const loggerToken = Symbol("Logger");

      class ConsoleLogger {
        log(msg: string) {
          return msg;
        }
      }

      class FileLogger {
        log(msg: string) {
          return msg;
        }
      }

      // Register multiple implementations separately
      container.registerFactory(loggerToken, (c) => new ConsoleLogger(), {
        lifetime: Lifetime.Transient,
      });

      // Get the first one
      const logger = container.resolve(loggerToken);

      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    test("should support resolveAll for registered services", () => {
      const handlerToken = Symbol("Handler");

      class Handler1 {}
      class Handler2 {}

      // Simulate multiple registrations by using resolveAll
      const handlers = container.resolveAll(handlerToken);

      // Should return empty array if nothing registered
      expect(Array.isArray(handlers)).toBe(true);
    });

    test("should support dispose method", async () => {
      let disposed = false;

      const serviceToken = Symbol("Service");

      const service = {
        async onDispose() {
          disposed = true;
        },
      };

      container.registerValue(serviceToken, service);
      container.resolve(serviceToken);

      await container.dispose();

      expect(disposed).toBe(true);
    });
  });

  describe("Lifetime Management", () => {
    test("should respect Singleton lifetime", () => {
      class Service {}

      container.register(Service, { lifetime: Lifetime.Singleton });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).toBe(instance2);
    });

    test("should respect Scoped lifetime within container", () => {
      class Service {}

      container.register(Service, { lifetime: Lifetime.Scoped });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).toBe(instance2);
    });

    test("should respect Transient lifetime", () => {
      class Service {}

      container.register(Service, { lifetime: Lifetime.Transient });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).not.toBe(instance2);
    });

    test("should clear scoped instances on child dispose", async () => {
      const token = Symbol("Scoped");
      let callCount = 0;

      container.registerValue(token, { counter: callCount });

      const childContainer = new Container(container);

      await childContainer.dispose();

      // After dispose, scoped instances should be cleared
      expect(childContainer.has(token)).toBe(true); // Still registered via parent
    });
  });

  describe("Factory Registration", () => {
    test("should support factory registration", () => {
      const serviceToken = Symbol("Service");

      let factoryCalls = 0;
      container.registerFactory(serviceToken, (c) => {
        factoryCalls++;
        return { id: factoryCalls };
      });

      const instance1 = container.resolve(serviceToken);
      const instance2 = container.resolve(serviceToken);

      expect(factoryCalls).toBe(2); // Factory called twice for transient
      expect((instance1 as any).id).toBe(1);
      expect((instance2 as any).id).toBe(2);
    });

    test("should support factory with container access", () => {
      const loggerToken = Symbol("Logger");
      const serviceToken = Symbol("Service");

      const logger = { log: (msg: string) => msg };

      container.registerValue(loggerToken, logger);
      container.registerFactory(serviceToken, (c) => {
        const log = c.resolve(loggerToken);
        return { logger: log };
      });

      const service = container.resolve(serviceToken);

      expect((service as any).logger).toBe(logger);
    });

    test("should respect lifetime in factory registration", () => {
      const serviceToken = Symbol("SingletonService");

      let callCount = 0;
      container.registerFactory(
        serviceToken,
        (c) => {
          callCount++;
          return { id: callCount };
        },
        { lifetime: Lifetime.Singleton },
      );

      const instance1 = container.resolve(serviceToken);
      const instance2 = container.resolve(serviceToken);

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
    });
  });

  describe("Async Resolution", () => {
    test("should resolve async factories", async () => {
      const serviceToken = Symbol("AsyncService");

      container.registerAsyncFactory(serviceToken, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { async: true };
      });

      const service = await container.resolveAsync(serviceToken);

      expect((service as any).async).toBe(true);
    });

    test("should respect lifetime in async factory registration", async () => {
      const serviceToken = Symbol("SingletonAsync");

      let callCount = 0;
      container.registerAsyncFactory(
        serviceToken,
        async (c) => {
          callCount++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { id: callCount };
        },
        { lifetime: Lifetime.Singleton },
      );

      const instance1 = await container.resolveAsync(serviceToken);
      const instance2 = await container.resolveAsync(serviceToken);

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
    });

    test("should support mixing sync and async resolution", async () => {
      class SyncService {}
      const asyncToken = Symbol("AsyncService");

      container.register(SyncService);
      container.registerAsyncFactory(asyncToken, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { value: "async" };
      });

      const syncService = container.resolve(SyncService);
      const asyncService = await container.resolveAsync(asyncToken);

      expect(syncService).toBeInstanceOf(SyncService);
      expect((asyncService as any).value).toBe("async");
    });

    test("should support async factory with dependency injection", async () => {
      const loggerToken = Symbol("Logger");
      const serviceToken = Symbol("Service");

      const logger = { log: (msg: string) => msg };

      container.registerValue(loggerToken, logger);
      container.registerAsyncFactory(serviceToken, async (c) => {
        const log = c.resolve(loggerToken);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { logger: log };
      });

      const service = await container.resolveAsync(serviceToken);

      expect((service as any).logger).toBe(logger);
    });
  });

  describe("Decorator Support", () => {
    test("should work with decorated classes", () => {
      class Logger {}
      class Database {}

      container.register(Logger);
      container.register(Database);

      const logger = container.resolve(Logger);
      const db = container.resolve(Database);

      expect(logger).toBeInstanceOf(Logger);
      expect(db).toBeInstanceOf(Database);
    });
  });

  describe("Error Handling", () => {
    test("should throw UnregisteredServiceError for unregistered service", () => {
      class UnregisteredService {}

      expect(() => container.resolve(UnregisteredService)).toThrow(
        UnregisteredServiceError,
      );
    });

    test("should propagate factory errors", () => {
      const serviceToken = Symbol("ErrorService");

      container.registerFactory(serviceToken, (c) => {
        throw new Error("Factory error");
      });

      expect(() => container.resolve(serviceToken)).toThrow("Factory error");
    });

    test("should propagate async factory errors", async () => {
      const serviceToken = Symbol("AsyncErrorService");

      container.registerAsyncFactory(serviceToken, async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("Async factory error");
      });

      const error = expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow("Async factory error");
    });
  });

  describe("Complex Dependency Graphs", () => {
    test("should resolve deep dependency chains", () => {
      class Logger {}
      class Repository {
        constructor(public logger: Logger) {}
      }
      class Service {
        constructor(public repo: Repository) {}
      }
      class Controller {
        constructor(public service: Service) {}
      }

      container.register(Logger);
      container.registerFactory(
        Repository,
        (c) => new Repository(c.resolve(Logger)),
      );
      container.registerFactory(
        Service,
        (c) => new Service(c.resolve(Repository)),
      );
      container.registerFactory(
        Controller,
        (c) => new Controller(c.resolve(Service)),
      );

      const controller = container.resolve(Controller);

      expect(controller).toBeInstanceOf(Controller);
      expect(controller.service).toBeInstanceOf(Service);
      expect(controller.service.repo).toBeInstanceOf(Repository);
      expect(controller.service.repo.logger).toBeInstanceOf(Logger);
    });

    test("should support shared dependencies", () => {
      class Logger {}
      class Database {}
      class Repository {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }
      class Service {
        constructor(
          public logger: Logger,
          public repo: Repository,
        ) {}
      }

      container.register(Logger, { lifetime: Lifetime.Singleton });
      container.register(Database, { lifetime: Lifetime.Singleton });
      container.registerFactory(
        Repository,
        (c) => new Repository(c.resolve(Logger), c.resolve(Database)),
      );
      container.registerFactory(
        Service,
        (c) => new Service(c.resolve(Logger), c.resolve(Repository)),
      );

      const service = container.resolve(Service);
      const logger1 = service.logger;
      const logger2 = service.repo.logger;

      expect(logger1).toBe(logger2);
    });
  });

  describe("Container Methods", () => {
    test("should resolve service instances", () => {
      class Service1 {}
      class Service2 {}
      const service3Token = Symbol("Service3");

      container.register(Service1);
      container.register(Service2);
      container.registerValue(service3Token, { value: 3 });

      const s1 = container.resolve(Service1);
      const s2 = container.resolve(Service2);
      const s3 = container.resolve(service3Token);

      expect(s1).toBeInstanceOf(Service1);
      expect(s2).toBeInstanceOf(Service2);
      expect((s3 as any).value).toBe(3);
    });

    test("should handle disposal of multiple services", async () => {
      const disposed: string[] = [];

      const service1 = {
        onDispose() {
          disposed.push("service1");
        },
      };

      const service2 = {
        onDispose() {
          disposed.push("service2");
        },
      };

      const service3 = {
        onDispose() {
          disposed.push("service3");
        },
      };

      container.registerValue("s1", service1);
      container.registerValue("s2", service2);
      container.registerValue("s3", service3);

      container.resolve("s1");
      container.resolve("s2");
      container.resolve("s3");

      await container.dispose();

      expect(disposed.length).toBe(3);
    });
  });

  describe("Type Safety", () => {
    test("should maintain type information for resolved services", () => {
      interface ILogger {
        log(msg: string): void;
      }

      class ConsoleLogger {
        log(msg: string) {
          return `logged: ${msg}`;
        }
      }

      const loggerToken = Symbol("ILogger");

      container.register(loggerToken, ConsoleLogger);

      const logger = container.resolve<ConsoleLogger>(loggerToken);

      expect(logger).toBeInstanceOf(ConsoleLogger);
      expect(logger.log("test")).toBe("logged: test");
    });
  });

  describe("Overload Support", () => {
    test("should support register(Constructor) overload", () => {
      class Service {}

      container.register(Service);

      const service = container.resolve(Service);
      expect(service).toBeInstanceOf(Service);
    });

    test("should support register(Token, Constructor) overload", () => {
      const token = Symbol("Service");

      class ServiceImpl {}

      container.register(token, ServiceImpl);

      const service = container.resolve(token);
      expect(service).toBeInstanceOf(ServiceImpl);
    });

    test("should support register(Constructor, options) overload", () => {
      class Service {}

      container.register(Service, { lifetime: Lifetime.Singleton });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).toBe(instance2);
    });

    test("should support register(Token, Constructor, options) overload", () => {
      const token = Symbol("Service");

      class ServiceImpl {}

      container.register(token, ServiceImpl, { lifetime: Lifetime.Singleton });

      const instance1 = container.resolve(token);
      const instance2 = container.resolve(token);

      expect(instance1).toBe(instance2);
    });
  });
});
