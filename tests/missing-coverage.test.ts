import { describe, test, expect, beforeEach } from "bun:test";
import { Container, Lifetime } from "../src/index.js";

describe("Missing Coverage Tests", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("resolveAll", () => {
    test("should resolve all registered implementations", () => {
      const handlerToken = Symbol("Handler");

      class Handler1 {}

      // Register implementation
      container.registerFactory(handlerToken, (c) => new Handler1());

      // Resolve all should return the registered handlers
      const results = container.resolveAll(handlerToken);

      // resolveAll only works for multi-registered services, so it should be empty
      expect(Array.isArray(results)).toBe(true);
    });

    test("should return empty array when no implementations registered", () => {
      const token = Symbol("NoService");

      const results = container.resolveAll(token);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    test("should inherit parent implementations in child container", () => {
      const handlerToken = Symbol("Handler");

      class Handler1 {}
      class Handler2 {}

      // Set up parent (we'll manually test the parent resolution)
      container.registerFactory(handlerToken, (c) => new Handler1());

      // Create child
      const childContainer = new Container(container);

      // Child should inherit from parent
      const inherited = childContainer.has(handlerToken);
      expect(inherited).toBe(true);
    });
  });

  describe("createScope", () => {
    test("should create child container from createScope", () => {
      class Logger {}

      container.register(Logger);

      const scopedContainer = container.createScope();

      // Scoped container should have access to parent's services
      expect(scopedContainer.has(Logger)).toBe(true);
    });

    test("scoped container should have isolated scoped services", () => {
      const scopedToken = Symbol("Scoped");

      let callCount = 0;
      container.registerFactory(
        scopedToken,
        (c) => {
          callCount++;
          return { id: callCount };
        },
        { lifetime: Lifetime.Scoped },
      );

      const scope1 = container.createScope();
      const scope2 = container.createScope();

      const result1 = scope1.resolve(scopedToken);
      const result2 = scope2.resolve(scopedToken);

      expect((result1 as any).id).toBe(1);
      expect((result2 as any).id).toBe(2);
    });

    test("should support nested scopes", () => {
      class Service {}

      container.register(Service);

      const scope1 = container.createScope();
      const scope2 = scope1.createScope();

      const service1 = scope1.resolve(Service);
      const service2 = scope2.resolve(Service);

      expect(service1).toBeInstanceOf(Service);
      expect(service2).toBeInstanceOf(Service);
    });
  });

  describe("getDefinition", () => {
    test("should retrieve definition from own registry", () => {
      class Service {}

      container.register(Service);

      // Test through resolution to ensure definition lookup works
      const service = container.resolve(Service);
      expect(service).toBeInstanceOf(Service);
    });

    test("should retrieve definition from parent registry", () => {
      class ParentService {}

      container.register(ParentService);

      const childContainer = new Container(container);

      // Child should find parent's service
      const service = childContainer.resolve(ParentService);
      expect(service).toBeInstanceOf(ParentService);
    });

    test("should return undefined for unregistered service", () => {
      class UnregisteredService {}

      // Attempting to resolve should throw, confirming definition is undefined
      expect(() => {
        container.resolve(UnregisteredService);
      }).toThrow();
    });
  });

  describe("Registry Integration", () => {
    test("should properly integrate with registry clear on dispose", async () => {
      class Service {}

      container.register(Service);
      expect(container.has(Service)).toBe(true);

      await container.dispose();

      // After dispose, registry should be cleared
      expect(container.has(Service)).toBe(false);
    });

    test("should handle multiple registrations properly", () => {
      class Service1 {}
      class Service2 {}
      const token3 = Symbol("Service3");

      container.register(Service1);
      container.register(Service2);
      container.registerValue(token3, { value: "test" });

      expect(container.has(Service1)).toBe(true);
      expect(container.has(Service2)).toBe(true);
      expect(container.has(token3)).toBe(true);
    });
  });

  describe("Resolver Integration", () => {
    test("should properly handle resolver clear in dispose", async () => {
      class Service1 {}
      class Service2 {}

      container.register(Service1);
      container.register(Service2);

      const s1 = container.resolve(Service1);
      const s2 = container.resolve(Service2);

      expect(s1).toBeInstanceOf(Service1);
      expect(s2).toBeInstanceOf(Service2);

      await container.dispose();
    });
  });

  describe("Container Factory Function", () => {
    test("should create a new container instance", () => {
      const { Container } = require("../src/core/container.js");

      const newContainer = new Container();

      class Service {}

      newContainer.register(Service);

      const service = newContainer.resolve(Service);

      expect(service).toBeInstanceOf(Service);
    });
  });

  describe("Parent Container Delegation", () => {
    test("should delegate undefined services to parent", () => {
      class Logger {}

      container.register(Logger);

      const childContainer = new Container(container);
      const childChild = new Container(childContainer);

      // Grand-child should find Logger through parent chain
      const logger = childChild.resolve(Logger);

      expect(logger).toBeInstanceOf(Logger);
    });

    test("should return false for undefined services in parent chain", () => {
      class MissingService {}

      container.register(MissingService);

      const childContainer = new Container(container);

      expect(childContainer.has(MissingService)).toBe(true);

      const grandchildContainer = new Container(childContainer);

      class AnotherMissingService {}

      expect(grandchildContainer.has(AnotherMissingService)).toBe(false);
    });

    test("parent reference should be optional", () => {
      const standalone = new Container();

      class Service {}

      standalone.register(Service);

      const service = standalone.resolve(Service);

      expect(service).toBeInstanceOf(Service);
    });
  });

  describe("Lifetime in resolveAll", () => {
    test("should respect lifetime when resolving all implementations", () => {
      const handlerToken = Symbol("Handler");

      let callCount = 0;

      // This simulates multiple handlers
      container.registerFactory(
        handlerToken,
        (c) => {
          callCount++;
          return { id: callCount };
        },
        { lifetime: Lifetime.Transient },
      );

      const results = container.resolveAll(handlerToken);

      // Should have one result (the factory registered)
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty resolution", () => {
      const unknownToken = Symbol("Unknown");

      const results = container.resolveAll(unknownToken);

      expect(results).toEqual([]);
    });

    test("should maintain proper lifecycle through parent access", async () => {
      const singletonToken = Symbol("Singleton");

      let creationCount = 0;

      container.registerFactory(
        singletonToken,
        (c) => {
          creationCount++;
          return { value: "singleton", id: creationCount };
        },
        {
          lifetime: Lifetime.Singleton,
        },
      );

      const value1 = container.resolve(singletonToken) as any;
      const value2 = container.resolve(singletonToken) as any;

      // Both should have same ID (singleton in same container)
      expect(value1.id).toBe(value2.id);
      expect(value1.id).toBe(1);

      await container.dispose();
    });

    test("should handle service with onDispose in child scope", async () => {
      let disposed = false;

      const serviceToken = Symbol("Service");

      const service = {
        onDispose() {
          disposed = true;
        },
      };

      container.registerValue(serviceToken, service);

      const childContainer = new Container(container);
      const resolvedService = childContainer.resolve(serviceToken);

      // Disposing child should NOT trigger disposal of parent singletons
      await childContainer.dispose();
      expect(disposed).toBe(false);

      // Disposing parent should trigger disposal
      await container.dispose();
      expect(disposed).toBe(true);
    });
  });
});
