import { describe, test, expect, beforeEach } from "bun:test";
import { Container, Lifetime } from "../src/index.js";
import { injectable, singleton, transient, scoped, inject } from "../src/decorators/index.js";

describe("Decorator Integration", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("@singleton decorator", () => {
    test("should make class singleton without explicit options", () => {
      @singleton()
      class ConfigService {
        id = Math.random();
      }

      container.register(ConfigService);

      const instance1 = container.resolve(ConfigService);
      const instance2 = container.resolve(ConfigService);

      expect(instance1).toBe(instance2);
      expect(instance1.id).toBe(instance2.id);
    });

    test("should work with dependencies", () => {
      @singleton()
      class Logger {
        log(msg: string) {
          return msg;
        }
      }

      @singleton()
      class Database {
        constructor(public logger: Logger) {}
      }

      container.register(Logger);
      container.register(Database);

      const db1 = container.resolve(Database);
      const db2 = container.resolve(Database);

      expect(db1).toBe(db2);
      expect(db1.logger).toBe(db2.logger);
    });

    test("explicit lifetime option should override decorator", () => {
      @singleton()
      class Service {
        id = Math.random();
      }

      // Explicit transient overrides decorator
      container.register(Service, { lifetime: Lifetime.Transient });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("@transient decorator", () => {
    test("should make class transient without explicit options", () => {
      @transient()
      class Logger {
        id = Math.random();
      }

      container.register(Logger);

      const instance1 = container.resolve(Logger);
      const instance2 = container.resolve(Logger);

      expect(instance1).not.toBe(instance2);
      expect(instance1.id).not.toBe(instance2.id);
    });

    test("should create new instances each time with dependencies", () => {
      @singleton()
      class Config {
        value = "config";
      }

      @transient()
      class Logger {
        constructor(public config: Config) {}
        id = Math.random();
      }

      container.register(Config);
      container.register(Logger);

      const logger1 = container.resolve(Logger);
      const logger2 = container.resolve(Logger);

      expect(logger1).not.toBe(logger2);
      expect(logger1.config).toBe(logger2.config); // Config is singleton
    });
  });

  describe("@scoped decorator", () => {
    test("should make class scoped without explicit options", () => {
      @scoped()
      class RequestContext {
        id = Math.random();
      }

      container.register(RequestContext);

      const scope1 = container.createScope();
      const ctx1a = scope1.resolve(RequestContext);
      const ctx1b = scope1.resolve(RequestContext);

      expect(ctx1a).toBe(ctx1b);
      expect(ctx1a.id).toBe(ctx1b.id);

      const scope2 = container.createScope();
      const ctx2 = scope2.resolve(RequestContext);

      expect(ctx1a).not.toBe(ctx2);
      expect(ctx1a.id).not.toBe(ctx2.id);
    });

    test("should work with mixed lifetimes", () => {
      @singleton()
      class Config {
        value = "config";
      }

      @scoped()
      class RequestContext {
        constructor(public config: Config) {}
        id = Math.random();
      }

      container.register(Config);
      container.register(RequestContext);

      const scope1 = container.createScope();
      const scope2 = container.createScope();

      const ctx1 = scope1.resolve(RequestContext);
      const ctx2 = scope2.resolve(RequestContext);

      expect(ctx1).not.toBe(ctx2);
      expect(ctx1.config).toBe(ctx2.config); // Singleton shared across scopes
    });
  });

  describe("@injectable decorator", () => {
    test("should mark class as injectable (transient by default)", () => {
      @injectable()
      class Service {
        id = Math.random();
      }

      container.register(Service);

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      // Default is transient
      expect(instance1).not.toBe(instance2);
    });

    test("should work with dependencies using factory", () => {
      @injectable()
      class Logger {
        log(msg: string) {
          return msg;
        }
      }

      @injectable()
      class UserService {
        constructor(public logger: Logger) {}
      }

      container.register(Logger);
      container.registerFactory(UserService, (c) => {
        return new UserService(c.resolve(Logger));
      });

      const service = container.resolve(UserService);
      expect(service).toBeInstanceOf(UserService);
      expect(service.logger).toBeInstanceOf(Logger);
    });
  });

  describe("@inject decorator", () => {
    test("should inject explicit tokens for interfaces using factory", () => {
      const ILogger = Symbol("ILogger");
      const IDatabase = Symbol("IDatabase");

      interface ILogger {
        log(msg: string): void;
      }

      interface IDatabase {
        query(): string;
      }

      @singleton()
      class ConsoleLogger implements ILogger {
        log(msg: string) {
          return msg;
        }
      }

      @singleton()
      class PostgresDB implements IDatabase {
        query() {
          return "data";
        }
      }

      @injectable()
      class UserService {
        constructor(
          public logger: ILogger,
          public db: IDatabase,
        ) {}
      }

      container.register(ILogger, ConsoleLogger);
      container.register(IDatabase, PostgresDB);

      // Use factory to inject interface tokens
      container.registerFactory(UserService, (c) => {
        return new UserService(c.resolve(ILogger), c.resolve(IDatabase));
      });

      const service = container.resolve(UserService);
      expect(service).toBeInstanceOf(UserService);
      expect(service.logger).toBeInstanceOf(ConsoleLogger);
      expect(service.db).toBeInstanceOf(PostgresDB);
    });

    test("should handle concrete class dependencies automatically", () => {
      @singleton()
      class Logger {
        log(msg: string) {
          return msg;
        }
      }

      @singleton()
      class Database {
        query() {
          return "data";
        }
      }

      @injectable()
      class UserService {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }

      container.register(Logger);
      container.register(Database);
      container.registerFactory(UserService, (c) => {
        return new UserService(c.resolve(Logger), c.resolve(Database));
      });

      const service = container.resolve(UserService);
      expect(service.logger).toBeInstanceOf(Logger);
      expect(service.db).toBeInstanceOf(Database);
    });

    test("should work with multiple concrete dependencies", () => {
      @singleton()
      class Config {
        value = "config";
      }

      @singleton()
      class Logger {
        log(msg: string) {
          return msg;
        }
      }

      @singleton()
      class Database {
        query() {
          return "data";
        }
      }

      @injectable()
      class ComplexService {
        constructor(
          public config: Config,
          public logger: Logger,
          public db: Database,
        ) {}
      }

      container.register(Config);
      container.register(Logger);
      container.register(Database);
      container.registerFactory(ComplexService, (c) => {
        return new ComplexService(c.resolve(Config), c.resolve(Logger), c.resolve(Database));
      });

      const service = container.resolve(ComplexService);
      expect(service.config).toBeInstanceOf(Config);
      expect(service.logger).toBeInstanceOf(Logger);
      expect(service.db).toBeInstanceOf(Database);
    });
  });

  describe("Combined decorator patterns", () => {
    test("should work with @singleton and concrete dependencies", () => {
      @singleton()
      class ConsoleLogger {
        log(msg: string) {
          return msg;
        }
      }

      @singleton()
      class UserService {
        constructor(public logger: ConsoleLogger) {}
      }

      container.register(ConsoleLogger);
      // Factory needs explicit lifetime; decorator metadata applies only to register()
      container.registerFactory(UserService, (c) => new UserService(c.resolve(ConsoleLogger)), {
        lifetime: Lifetime.Singleton,
      });

      const service1 = container.resolve(UserService);
      const service2 = container.resolve(UserService);

      expect(service1).toBe(service2); // Singleton
      expect(service1.logger).toBe(service2.logger);
    });

    test("should support complex dependency graphs with decorators", () => {
      @singleton()
      class Config {
        value = "config";
      }

      @singleton()
      class Logger {
        constructor(public config: Config) {}
      }

      @singleton()
      class Database {
        constructor(
          public logger: Logger,
          public config: Config,
        ) {}
      }

      @transient()
      class UserService {
        constructor(
          public db: Database,
          public logger: Logger,
        ) {}
      }

      container.register(Config);
      container.register(Logger);
      container.register(Database);
      container.register(UserService);

      const service1 = container.resolve(UserService);
      const service2 = container.resolve(UserService);

      expect(service1).not.toBe(service2); // Transient
      expect(service1.db).toBe(service2.db); // Singleton
      expect(service1.logger).toBe(service2.logger); // Singleton
    });

    test("should support scoped with dependencies", () => {
      @singleton()
      class Config {
        value = "config";
      }

      @scoped()
      class RequestContext {
        id = Math.random();
      }

      @scoped()
      class RequestHandler {
        constructor(
          public config: Config,
          public context: RequestContext,
        ) {}
      }

      container.register(Config);
      container.register(RequestContext);
      container.register(RequestHandler);

      const scope1 = container.createScope();
      const handler1a = scope1.resolve(RequestHandler);
      const handler1b = scope1.resolve(RequestHandler);

      expect(handler1a).toBe(handler1b); // Scoped
      expect(handler1a.context).toBe(handler1b.context); // Scoped

      const scope2 = container.createScope();
      const handler2 = scope2.resolve(RequestHandler);

      expect(handler1a).not.toBe(handler2); // Different scopes
      expect(handler1a.config).toBe(handler2.config); // Singleton shared
    });
  });

  describe("Decorator priority and overrides", () => {
    test("explicit lifetime always overrides decorator", () => {
      @singleton()
      class Service {
        id = Math.random();
      }

      container.register(Service, { lifetime: Lifetime.Transient });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).not.toBe(instance2);
    });

    test("explicit singleton overrides @transient", () => {
      @transient()
      class Service {
        id = Math.random();
      }

      container.register(Service, { lifetime: Lifetime.Singleton });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).toBe(instance2);
    });

    test("explicit scoped overrides @singleton", () => {
      @singleton()
      class Service {
        id = Math.random();
      }

      container.register(Service, { lifetime: Lifetime.Scoped });

      const scope1 = container.createScope();
      const scope2 = container.createScope();

      const instance1 = scope1.resolve(Service);
      const instance2 = scope2.resolve(Service);

      expect(instance1).not.toBe(instance2); // Different scopes
    });
  });

  describe("Backward compatibility", () => {
    test("non-decorated classes work as before", () => {
      class Service {
        id = Math.random();
      }

      container.register(Service, { lifetime: Lifetime.Singleton });

      const instance1 = container.resolve(Service);
      const instance2 = container.resolve(Service);

      expect(instance1).toBe(instance2);
    });

    test("factories still work", () => {
      @singleton()
      class Logger {
        log(msg: string) {
          return msg;
        }
      }

      class UserService {
        constructor(public logger: Logger) {}
      }

      container.register(Logger);
      container.registerFactory(UserService, (c) => {
        return new UserService(c.resolve(Logger));
      });

      const service = container.resolve(UserService);
      expect(service).toBeInstanceOf(UserService);
      expect(service.logger).toBeInstanceOf(Logger);
    });
  });
});
