import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getGlobalContainer, resetGlobalContainer, Lifetime } from "../src/index.js";

describe("Global Container", () => {
  afterEach(async () => {
    await resetGlobalContainer();
  });

  describe("getGlobalContainer", () => {
    test("should return a container instance", () => {
      const container = getGlobalContainer();
      expect(container).toBeDefined();
      expect(typeof container.register).toBe("function");
      expect(typeof container.resolve).toBe("function");
    });

    test("should return the same instance on multiple calls", () => {
      const container1 = getGlobalContainer();
      const container2 = getGlobalContainer();
      expect(container1).toBe(container2);
    });

    test("should maintain registrations across calls", () => {
      class TestService {
        getValue() {
          return "test-value";
        }
      }

      const container1 = getGlobalContainer();
      container1.register(TestService);

      const container2 = getGlobalContainer();
      const service = container2.resolve(TestService);

      expect(service).toBeInstanceOf(TestService);
      expect(service.getValue()).toBe("test-value");
    });

    test("should support singleton services", () => {
      class SingletonService {
        id = Math.random();
      }

      const container = getGlobalContainer();
      container.register(SingletonService, { lifetime: Lifetime.Singleton });

      const instance1 = container.resolve(SingletonService);
      const instance2 = container.resolve(SingletonService);

      expect(instance1).toBe(instance2);
      expect(instance1.id).toBe(instance2.id);
    });

    test("should allow registering and resolving values", () => {
      const config = { apiUrl: "https://api.example.com", timeout: 5000 };

      const container = getGlobalContainer();
      container.registerValue("config", config);

      const resolved = container.resolve<typeof config>("config");
      expect(resolved).toBe(config);
      expect(resolved.apiUrl).toBe("https://api.example.com");
    });

    test("should support factory registrations", () => {
      let factoryCallCount = 0;

      const container = getGlobalContainer();
      container.registerFactory(
        "factory-service",
        () => {
          factoryCallCount++;
          return { value: factoryCallCount };
        },
        { lifetime: Lifetime.Transient },
      );

      const result1 = container.resolve<{ value: number }>("factory-service");
      const result2 = container.resolve<{ value: number }>("factory-service");

      expect(result1.value).toBe(1);
      expect(result2.value).toBe(2);
      expect(factoryCallCount).toBe(2);
    });

    test("should support async factory registrations", async () => {
      const container = getGlobalContainer();
      container.registerAsyncFactory(
        "async-service",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { status: "ready" };
        },
        { lifetime: Lifetime.Singleton },
      );

      const result = await container.resolveAsync<{ status: string }>("async-service");
      expect(result.status).toBe("ready");
    });

    test("should support dependency injection with factories", () => {
      class Logger {
        log(msg: string) {
          return `LOG: ${msg}`;
        }
      }

      class UserService {
        constructor(private logger: Logger) {}

        logMessage(msg: string) {
          return this.logger.log(msg);
        }
      }

      const container = getGlobalContainer();
      container.register(Logger, { lifetime: Lifetime.Singleton });
      container.registerFactory(
        UserService,
        (c) => {
          const logger = c.resolve(Logger);
          return new UserService(logger);
        },
        { lifetime: Lifetime.Singleton },
      );

      const service = container.resolve(UserService);
      expect(service).toBeInstanceOf(UserService);
      expect(service.logMessage("test")).toBe("LOG: test");
    });
  });

  describe("resetGlobalContainer", () => {
    test("should dispose and clear the global container", async () => {
      class TestService {}

      const container1 = getGlobalContainer();
      container1.register(TestService);
      container1.resolve(TestService);

      await resetGlobalContainer();

      const container2 = getGlobalContainer();
      expect(container2).not.toBe(container1);
      expect(container2.has(TestService)).toBe(false);
    });

    test("should call onDispose lifecycle hook", async () => {
      let disposed = false;

      class DisposableService {
        onDispose() {
          disposed = true;
        }
      }

      const container = getGlobalContainer();
      container.register(DisposableService, { lifetime: Lifetime.Singleton });
      container.resolve(DisposableService);

      await resetGlobalContainer();

      expect(disposed).toBe(true);
    });

    test("should handle multiple resets gracefully", async () => {
      await resetGlobalContainer();
      await resetGlobalContainer();
      await resetGlobalContainer();

      const container = getGlobalContainer();
      expect(container).toBeDefined();
    });

    test("should allow fresh registrations after reset", async () => {
      class ServiceV1 {
        version = 1;
      }

      class ServiceV2 {
        version = 2;
      }

      const container1 = getGlobalContainer();
      container1.register("service", ServiceV1);

      await resetGlobalContainer();

      const container2 = getGlobalContainer();
      container2.register("service", ServiceV2);

      const service = container2.resolve<ServiceV2>("service");
      expect(service.version).toBe(2);
    });
  });

  describe("Use Cases", () => {
    test("should support application-wide singleton access", () => {
      class DatabaseConnection {
        private static instanceCount = 0;
        readonly instanceId: number;

        constructor() {
          this.instanceId = ++DatabaseConnection.instanceCount;
        }

        query() {
          return "query result";
        }
      }

      const container = getGlobalContainer();
      container.register(DatabaseConnection, { lifetime: Lifetime.Singleton });

      const db1 = container.resolve(DatabaseConnection);
      const db2 = getGlobalContainer().resolve(DatabaseConnection);

      expect(db1).toBe(db2);
      expect(db1.instanceId).toBe(1);
    });

    test("should work with module-level service resolution", () => {
      class ConfigService {
        get(key: string) {
          return `value-for-${key}`;
        }
      }

      const setupModule = () => {
        const container = getGlobalContainer();
        container.register(ConfigService, { lifetime: Lifetime.Singleton });
      };

      const useModule = () => {
        const container = getGlobalContainer();
        return container.resolve(ConfigService);
      };

      setupModule();
      const config = useModule();

      expect(config).toBeInstanceOf(ConfigService);
      expect(config.get("test")).toBe("value-for-test");
    });

    test("should support testing with resetGlobalContainer", async () => {
      class DataService {
        getData() {
          return "real data";
        }
      }

      class MockDataService extends DataService {
        getData() {
          return "mock data";
        }
      }

      const container1 = getGlobalContainer();
      container1.register("data", DataService);
      const realData = container1.resolve<DataService>("data").getData();
      expect(realData).toBe("real data");

      await resetGlobalContainer();

      const container2 = getGlobalContainer();
      container2.register("data", MockDataService);
      const mockData = container2.resolve<DataService>("data").getData();
      expect(mockData).toBe("mock data");
    });
  });
});
