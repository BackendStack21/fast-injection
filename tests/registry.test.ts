import { describe, test, expect, beforeEach } from "bun:test";
import { Registry } from "../src/core/registry.js";
import { Lifetime } from "../src/types/index.js";
import { RegistrationError } from "../src/errors/index.js";

describe("Registry", () => {
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  describe("register", () => {
    test("should register a service definition", () => {
      const token = "TestService";
      const definition = Registry.createDefinition(token, class {});

      registry.register(definition);

      expect(registry.has(token)).toBe(true);
    });

    test("should throw error when registering duplicate service", () => {
      const token = "DuplicateService";
      const definition1 = Registry.createDefinition(token, class {});
      const definition2 = Registry.createDefinition(token, class {});

      registry.register(definition1);

      expect(() => {
        registry.register(definition2);
      }).toThrow(RegistrationError);
    });

    test("should allow replace option for duplicate registration", () => {
      const token = "ReplaceableService";
      class FirstImpl {}
      class SecondImpl {}

      const definition1 = Registry.createDefinition(token, FirstImpl);
      const definition2 = {
        ...Registry.createDefinition(token, SecondImpl),
        replace: true,
      };

      registry.register(definition1);
      registry.register(definition2);

      const retrieved = registry.get(token);
      expect(retrieved?.target).toBe(SecondImpl);
    });

    test("should retrieve registered service definition", () => {
      const token = Symbol("Service");
      class ServiceImpl {}
      const definition = Registry.createDefinition(token, ServiceImpl);

      registry.register(definition);

      const retrieved = registry.get(token);
      expect(retrieved?.target).toBe(ServiceImpl);
      expect(retrieved?.token).toBe(token);
    });
  });

  describe("registerMulti", () => {
    test("should register multiple implementations for same token", () => {
      const token = Symbol("Logger");

      class ConsoleLogger {}
      class FileLogger {}

      const def1 = Registry.createDefinition(token, ConsoleLogger);
      const def2 = Registry.createDefinition(token, FileLogger);

      registry.registerMulti(def1);
      registry.registerMulti(def2);

      const all = registry.getAll(token);
      expect(all.length).toBe(2);
      expect(all[0].target).toBe(ConsoleLogger);
      expect(all[1].target).toBe(FileLogger);
    });

    test("should return empty array for unregistered multi services", () => {
      const token = Symbol("UnregisteredMulti");

      const all = registry.getAll(token);
      expect(all).toEqual([]);
    });

    test("should not affect single service registry", () => {
      const token = Symbol("Service");
      class Impl {}

      const definition = Registry.createDefinition(token, Impl);
      registry.registerMulti(definition);

      expect(registry.has(token)).toBe(false);
      expect(registry.get(token)).toBeUndefined();
      expect(registry.getAll(token).length).toBe(1);
    });
  });

  describe("has", () => {
    test("should return true for registered service", () => {
      const token = "RegisteredService";
      const definition = Registry.createDefinition(token, class {});

      registry.register(definition);

      expect(registry.has(token)).toBe(true);
    });

    test("should return false for unregistered service", () => {
      const token = "UnregisteredService";

      expect(registry.has(token)).toBe(false);
    });

    test("should work with symbol tokens", () => {
      const token = Symbol("SymbolService");
      const definition = Registry.createDefinition(token, class {});

      registry.register(definition);

      expect(registry.has(token)).toBe(true);
    });
  });

  describe("get", () => {
    test("should return service definition when registered", () => {
      const token = "Service";
      class ServiceImpl {}
      const definition = Registry.createDefinition(token, ServiceImpl);

      registry.register(definition);

      const retrieved = registry.get(token);
      expect(retrieved).toBeDefined();
      expect(retrieved?.target).toBe(ServiceImpl);
    });

    test("should return undefined for unregistered service", () => {
      const token = "UnregisteredService";

      const retrieved = registry.get(token);
      expect(retrieved).toBeUndefined();
    });

    test("should preserve lifetime information", () => {
      const token = "SingletonService";
      class ServiceImpl {}

      const definition = Registry.createDefinition(token, ServiceImpl, {
        lifetime: Lifetime.Singleton,
      });

      registry.register(definition);

      const retrieved = registry.get(token);
      expect(retrieved?.lifetime).toBe(Lifetime.Singleton);
    });
  });

  describe("getTokens", () => {
    test("should return all registered tokens", () => {
      const token1 = Symbol("Service1");
      const token2 = "Service2";
      const token3 = Symbol("Service3");

      const def1 = Registry.createDefinition(token1, class {});
      const def2 = Registry.createDefinition(token2, class {});
      const def3 = Registry.createDefinition(token3, class {});

      registry.register(def1);
      registry.register(def2);
      registry.register(def3);

      const tokens = registry.getTokens();

      expect(tokens.length).toBe(3);
      expect(tokens).toContain(token1);
      expect(tokens).toContain(token2);
      expect(tokens).toContain(token3);
    });

    test("should return empty array when no services registered", () => {
      const tokens = registry.getTokens();

      expect(tokens).toEqual([]);
    });
  });

  describe("clear", () => {
    test("should clear all registered services", () => {
      const token1 = "Service1";
      const token2 = "Service2";

      const def1 = Registry.createDefinition(token1, class {});
      const def2 = Registry.createDefinition(token2, class {});

      registry.register(def1);
      registry.register(def2);

      registry.clear();

      expect(registry.has(token1)).toBe(false);
      expect(registry.has(token2)).toBe(false);
      expect(registry.getTokens().length).toBe(0);
    });

    test("should clear multi registrations", () => {
      const token = Symbol("MultiService");

      const def1 = Registry.createDefinition(token, class {});
      const def2 = Registry.createDefinition(token, class {});

      registry.registerMulti(def1);
      registry.registerMulti(def2);

      registry.clear();

      expect(registry.getAll(token)).toEqual([]);
    });

    test("should allow re-registration after clear", () => {
      const token = "Service";
      class FirstImpl {}
      class SecondImpl {}

      const def1 = Registry.createDefinition(token, FirstImpl);
      registry.register(def1);

      registry.clear();

      const def2 = Registry.createDefinition(token, SecondImpl);
      registry.register(def2);

      const retrieved = registry.get(token);
      expect(retrieved?.target).toBe(SecondImpl);
    });
  });

  describe("createDefinition", () => {
    test("should create definition with constructor", () => {
      class MyService {}

      const definition = Registry.createDefinition("token", MyService);

      expect(definition.token).toBe("token");
      expect(definition.target).toBe(MyService);
      expect(definition.isFactory).toBe(false);
      expect(definition.isAsync).toBe(false);
      expect(definition.lifetime).toBe(Lifetime.Transient);
    });

    test("should create definition with factory function", () => {
      const factory = (c: any) => ({ service: "instance" });

      const definition = Registry.createDefinition("token", factory);

      expect(definition.target).toBe(factory);
      expect(definition.isFactory).toBe(true);
      expect(definition.isAsync).toBe(false);
    });

    test("should create definition with custom lifetime", () => {
      class MyService {}

      const definition = Registry.createDefinition("token", MyService, {
        lifetime: Lifetime.Singleton,
      });

      expect(definition.lifetime).toBe(Lifetime.Singleton);
    });

    test("should create definition with value", () => {
      const value = { key: "value" };

      const definition = Registry.createDefinition("config", value);

      expect(definition.target).toBe(value);
      // A plain value object has prototype, so it won't be detected as factory
      expect(definition.isFactory).toBe(false);
      expect(definition.isAsync).toBe(false);
    });

    test("should default to Transient lifetime", () => {
      class MyService {}

      const definition = Registry.createDefinition("token", MyService);

      expect(definition.lifetime).toBe(Lifetime.Transient);
    });

    test("should detect async factories", async () => {
      const asyncFactory = async (c: any) => ({ service: "instance" });

      const definition = Registry.createDefinition("token", asyncFactory);

      expect(definition.isFactory).toBe(true);
      expect(definition.isAsync).toBe(true);
    });

    test("should extract dependencies from metadata", () => {
      class Logger {}
      class Database {}

      class ServiceWithDeps {
        constructor(logger: Logger, db: Database) {}
      }

      // Use reflect metadata to set design types
      const definition = Registry.createDefinition("token", ServiceWithDeps);

      expect(definition.dependencies).toBeDefined();
    });

    test("should handle class without constructor", () => {
      class SimpleClass {}

      const definition = Registry.createDefinition("token", SimpleClass);

      expect(definition.isFactory).toBe(false);
      expect(definition.dependencies).toEqual([]);
    });
  });

  describe("extractDependencies", () => {
    test("should extract no dependencies from simple class", () => {
      class SimpleService {}

      const definition = Registry.createDefinition("token", SimpleService);

      expect(definition.dependencies).toEqual([]);
    });

    test("should create definition with scoped lifetime", () => {
      class MyService {}

      const definition = Registry.createDefinition("token", MyService, {
        lifetime: Lifetime.Scoped,
      });

      expect(definition.lifetime).toBe(Lifetime.Scoped);
    });

    test("should handle multiple definitions with same target", () => {
      class Logger {}

      const def1 = Registry.createDefinition("logger1", Logger);
      const def2 = Registry.createDefinition("logger2", Logger);

      registry.register(def1);
      registry.register(def2);

      const retrieved1 = registry.get("logger1");
      const retrieved2 = registry.get("logger2");

      expect(retrieved1?.target).toBe(Logger);
      expect(retrieved2?.target).toBe(Logger);
      expect(retrieved1).not.toBe(retrieved2);
    });
  });

  describe("Error Messages", () => {
    test("duplicate registration error should mention replace option", () => {
      const token = "Service";
      const def1 = Registry.createDefinition(token, class {});
      const def2 = Registry.createDefinition(token, class {});

      registry.register(def1);

      try {
        registry.register(def2);
      } catch (error) {
        if (error instanceof RegistrationError) {
          expect(error.message).toContain("replace: true");
        }
      }
    });

    test("duplicate registration error should include token name", () => {
      const tokenName = "MyService";
      const def1 = Registry.createDefinition(tokenName, class {});
      const def2 = Registry.createDefinition(tokenName, class {});

      registry.register(def1);

      try {
        registry.register(def2);
      } catch (error) {
        if (error instanceof RegistrationError) {
          expect(error.message).toContain(tokenName);
        }
      }
    });
  });

  describe("Multi-service Patterns", () => {
    test("should maintain order of multi registrations", () => {
      const token = Symbol("Handler");
      class Handler1 {}
      class Handler2 {}
      class Handler3 {}

      registry.registerMulti(Registry.createDefinition(token, Handler1));
      registry.registerMulti(Registry.createDefinition(token, Handler2));
      registry.registerMulti(Registry.createDefinition(token, Handler3));

      const all = registry.getAll(token);

      expect(all.length).toBe(3);
      expect(all[0].target).toBe(Handler1);
      expect(all[1].target).toBe(Handler2);
      expect(all[2].target).toBe(Handler3);
    });

    test("should isolate multi and single registrations by token", () => {
      const token = Symbol("Service");
      class SingleImpl {}
      class MultiImpl1 {}
      class MultiImpl2 {}

      const singleDef = Registry.createDefinition(token, SingleImpl);
      const multiDef1 = Registry.createDefinition(token, MultiImpl1);
      const multiDef2 = Registry.createDefinition(token, MultiImpl2);

      registry.register(singleDef);
      registry.registerMulti(multiDef1);
      registry.registerMulti(multiDef2);

      const single = registry.get(token);
      const multi = registry.getAll(token);

      expect(single?.target).toBe(SingleImpl);
      expect(multi.length).toBe(2);
    });
  });
});
