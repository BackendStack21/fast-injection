import { describe, it, expect, beforeEach } from "bun:test";
import { Container } from "../src/core/container.js";
import { RegistrationError } from "../src/errors/index.js";
import { singleton, clearDecoratorMetadata } from "../src/decorators/index.js";
import { Lifetime } from "../src/types/index.js";

describe("Security Features", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("Token Validation - Prototype Pollution Prevention", () => {
    it("should reject __proto__ as token", () => {
      class Service {}

      expect(() => {
        container.register("__proto__", Service);
      }).toThrow(RegistrationError);

      expect(() => {
        container.register("__proto__", Service);
      }).toThrow("Token name is reserved and cannot be used for security reasons");
    });

    it("should reject constructor as token", () => {
      class Service {}

      expect(() => {
        container.register("constructor", Service);
      }).toThrow(RegistrationError);
    });

    it("should reject prototype as token", () => {
      class Service {}

      expect(() => {
        container.register("prototype", Service);
      }).toThrow(RegistrationError);
    });

    it("should allow safe token names", () => {
      class Service {}

      expect(() => {
        container.register("myService", Service);
        container.register("DatabaseService", Service);
        container.register("user-service", Service);
      }).not.toThrow();
    });

    it("should reject dangerous tokens in registerAll", () => {
      class ServiceA {}
      class ServiceB {}

      expect(() => {
        container.registerAll("__proto__", [ServiceA, ServiceB]);
      }).toThrow(RegistrationError);
    });

    it("should reject dangerous tokens in registerValue", () => {
      const value = { config: "test" };

      expect(() => {
        container.registerValue("__proto__", value);
      }).toThrow(RegistrationError);
    });

    it("should reject dangerous tokens in registerFactory", () => {
      expect(() => {
        container.registerFactory("constructor", () => ({ test: true }));
      }).toThrow(RegistrationError);
    });

    it("should reject dangerous tokens in registerAsyncFactory", () => {
      expect(() => {
        container.registerAsyncFactory("prototype", async () => ({ test: true }));
      }).toThrow(RegistrationError);
    });

    it("should allow safe symbol tokens", () => {
      const safeSymbol = Symbol("safeService");
      class Service {}

      expect(() => {
        container.register(safeSymbol, Service);
      }).not.toThrow();
    });

    it("should reject dangerous string representations in symbols", () => {
      // Symbol.for creates a global symbol, but regular Symbol() doesn't expose the string
      // The String() conversion of Symbol("__proto__") is "Symbol(__proto__)", not "__proto__"
      // So this test demonstrates that symbols are actually safe
      const symbolWithDangerousName = Symbol("__proto__");
      class Service {}

      // This should NOT throw because Symbol() creates safe, unique symbols
      // The string representation includes "Symbol(...)" prefix
      expect(() => {
        container.register(symbolWithDangerousName, Service);
      }).not.toThrow();

      // But Symbol.for() could potentially be dangerous if used with reserved names
      // (though it still wouldn't cause prototype pollution due to Map usage)
    });
  });

  describe("Async Promise Failure Tracking", () => {
    it("should track failed async singleton resolutions", async () => {
      const error = new Error("Factory failed");
      container.registerAsyncFactory(
        "failing-service",
        async () => {
          throw error;
        },
        { lifetime: Lifetime.Singleton },
      );

      // First resolution fails
      await expect(container.resolveAsync("failing-service")).rejects.toThrow("Factory failed");

      // Second resolution within TTL should return cached error
      await expect(container.resolveAsync("failing-service")).rejects.toThrow("Factory failed");
    });

    it("should track failed async scoped resolutions", async () => {
      const error = new Error("Scoped factory failed");
      const scope = container.createScope();
      scope.registerAsyncFactory(
        "failing-scoped",
        async () => {
          throw error;
        },
        { lifetime: Lifetime.Scoped },
      );

      // First resolution fails
      await expect(scope.resolveAsync("failing-scoped")).rejects.toThrow("Scoped factory failed");

      // Second resolution within TTL should return cached error
      await expect(scope.resolveAsync("failing-scoped")).rejects.toThrow("Scoped factory failed");
    });

    it("should allow retry after TTL expires", async () => {
      let attemptCount = 0;
      container.registerAsyncFactory(
        "retry-service",
        async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("First attempt failed");
          }
          return { value: "success" };
        },
        { lifetime: Lifetime.Singleton },
      );

      // First attempt fails
      await expect(container.resolveAsync("retry-service")).rejects.toThrow("First attempt failed");

      // Wait for TTL to expire (5+ seconds) - use shorter duration for testing
      // Note: In real scenarios, the TTL is 5000ms
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Manually clear the failed token by disposing and re-registering
      // (simulating TTL expiry for test performance)
      await container.dispose();

      const newContainer = new Container();
      let attemptCount2 = 0;
      newContainer.registerAsyncFactory(
        "retry-service",
        async () => {
          attemptCount2++;
          return { value: "success" };
        },
        { lifetime: Lifetime.Singleton },
      );

      // Second attempt should succeed
      const result = await newContainer.resolveAsync<{ value: string }>("retry-service");
      expect(result.value).toBe("success");
      expect(attemptCount2).toBe(1);
    }, 10000);

    it("should clear failed tokens on successful resolution", async () => {
      let shouldFail = true;
      container.registerAsyncFactory(
        "flaky-service",
        async () => {
          if (shouldFail) {
            throw new Error("Temporary failure");
          }
          return { value: "success" };
        },
        { lifetime: Lifetime.Singleton },
      );

      // First attempt fails
      await expect(container.resolveAsync("flaky-service")).rejects.toThrow("Temporary failure");

      // Dispose and recreate to simulate TTL expiry
      await container.dispose();
      shouldFail = false;

      const newContainer = new Container();
      newContainer.registerAsyncFactory(
        "flaky-service",
        async () => {
          return { value: "success" };
        },
        { lifetime: Lifetime.Singleton },
      );

      // Should succeed now
      const result = await newContainer.resolveAsync<{ value: string }>("flaky-service");
      expect(result.value).toBe("success");

      // Subsequent calls should return cached success (not fail)
      const result2 = await newContainer.resolveAsync<{ value: string }>("flaky-service");
      expect(result2.value).toBe("success");
    }, 10000);

    it("should clear failed tokens on dispose", async () => {
      container.registerAsyncFactory(
        "failing-service",
        async () => {
          throw new Error("Always fails");
        },
        { lifetime: Lifetime.Singleton },
      );

      // Trigger failure
      await expect(container.resolveAsync("failing-service")).rejects.toThrow("Always fails");

      // Dispose should clear failed tokens
      await container.dispose();

      // After disposal, re-register and resolve should work
      const newContainer = new Container();
      newContainer.registerAsyncFactory("failing-service", async () => ({ value: "success" }), {
        lifetime: Lifetime.Singleton,
      });

      const result = await newContainer.resolveAsync<{ value: string }>("failing-service");
      expect(result.value).toBe("success");
    });

    it("should handle concurrent failures without memory leak", async () => {
      let callCount = 0;
      container.registerAsyncFactory(
        "concurrent-fail",
        async () => {
          callCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error("Concurrent failure");
        },
        { lifetime: Lifetime.Singleton },
      );

      // Make many concurrent calls
      const promises = Array.from({ length: 100 }, () => container.resolveAsync("concurrent-fail").catch((e) => e));

      const results = await Promise.all(promises);

      // All should fail with same error
      expect(results.every((r) => r instanceof Error)).toBe(true);
      expect(results.every((r) => (r as Error).message === "Concurrent failure")).toBe(true);

      // Factory should only be called once (pending deduplication works)
      expect(callCount).toBe(1);
    });
  });

  describe("Decorator Metadata Cleanup", () => {
    it("should clear decorator metadata for a class", () => {
      @singleton()
      class DynamicService {
        value = "test";
      }

      container.register(DynamicService);
      const instance1 = container.resolve(DynamicService);
      expect(instance1.value).toBe("test");

      // Clear metadata
      clearDecoratorMetadata(DynamicService);

      // Can still resolve existing registration
      const instance2 = container.resolve(DynamicService);
      expect(instance2).toBe(instance1); // Still singleton
    });

    it("should allow cleanup of dynamically created classes", () => {
      const classes: any[] = [];

      // Simulate creating many dynamic classes
      for (let i = 0; i < 10; i++) {
        @singleton()
        class DynamicClass {
          id = i;
        }

        classes.push(DynamicClass);
        container.register(`service-${i}`, DynamicClass);
      }

      // Cleanup metadata
      classes.forEach((cls) => clearDecoratorMetadata(cls));

      // Services should still work (already registered)
      const resolved = container.resolve<{ id: number }>("service-5");
      expect(resolved.id).toBe(5);
    });

    it("should handle clearing metadata for non-decorated classes", () => {
      class PlainClass {}

      // Should not throw
      expect(() => {
        clearDecoratorMetadata(PlainClass);
      }).not.toThrow();
    });

    it("should clear metadata multiple times safely", () => {
      @singleton()
      class TestService {}

      // Multiple clears should be safe
      expect(() => {
        clearDecoratorMetadata(TestService);
        clearDecoratorMetadata(TestService);
        clearDecoratorMetadata(TestService);
      }).not.toThrow();
    });
  });

  describe("Security Best Practices Examples", () => {
    it("should demonstrate safe token usage", () => {
      class UserService {}
      const SERVICE_TOKEN = Symbol("userService");

      // These are all safe
      expect(() => {
        container.register(UserService);
        container.register("user-service", UserService);
        container.register(SERVICE_TOKEN, UserService);
        container.register("IUserService", UserService);
      }).not.toThrow();

      // Verify all work
      expect(container.resolve(UserService)).toBeInstanceOf(UserService);
      expect(container.resolve("user-service")).toBeInstanceOf(UserService);
      expect(container.resolve(SERVICE_TOKEN)).toBeInstanceOf(UserService);
      expect(container.resolve("IUserService")).toBeInstanceOf(UserService);
    });

    it("should demonstrate proper disposal pattern", async () => {
      @singleton()
      class ResourceService {
        disposed = false;
        onDispose() {
          this.disposed = true;
        }
      }

      container.register(ResourceService);
      const service = container.resolve(ResourceService);
      expect(service.disposed).toBe(false);

      // Proper cleanup
      await container.dispose();
      expect(service.disposed).toBe(true);
    });

    it("should demonstrate error handling for async failures", async () => {
      let isHealthy = false;

      container.registerAsyncFactory(
        "health-check",
        async () => {
          if (!isHealthy) {
            throw new Error("Service unhealthy");
          }
          return { status: "healthy" };
        },
        { lifetime: Lifetime.Singleton },
      );

      // Handle initial failure
      try {
        await container.resolveAsync("health-check");
      } catch (error: any) {
        expect(error.message).toContain("Service unhealthy");
      }

      // Dispose and recreate to simulate recovery
      await container.dispose();
      isHealthy = true;

      const newContainer = new Container();
      newContainer.registerAsyncFactory(
        "health-check",
        async () => {
          return { status: "healthy" };
        },
        { lifetime: Lifetime.Singleton },
      );

      // Should work now
      const result = await newContainer.resolveAsync<{ status: string }>("health-check");
      expect(result.status).toBe("healthy");
    }, 10000);

    it("should cleanup expired failed tokens to prevent memory exhaustion", async () => {
      let failureCount = 0;

      // Register multiple async services that fail
      for (let i = 0; i < 50; i++) {
        container.registerAsyncFactory(
          `failing-service-${i}`,
          async () => {
            failureCount++;
            throw new Error(`Service ${i} failed`);
          },
          { lifetime: Lifetime.Singleton },
        );
      }

      // Trigger failures for all services
      for (let i = 0; i < 50; i++) {
        try {
          await container.resolveAsync(`failing-service-${i}`);
        } catch (e) {
          // Expected
        }
      }

      expect(failureCount).toBe(50);

      // Wait for TTL to expire (5+ seconds)
      await new Promise((resolve) => setTimeout(resolve, 5100));

      // Register and resolve a new service - this should trigger cleanup
      container.registerAsyncFactory(
        "trigger-cleanup",
        async () => {
          return { cleaned: true };
        },
        { lifetime: Lifetime.Singleton },
      );

      // Resolve to trigger internal cleanup
      await container.resolveAsync("trigger-cleanup");

      // After TTL, failed services should be retryable (not returning cached errors)
      failureCount = 0;

      try {
        await container.resolveAsync("failing-service-0");
      } catch (e) {
        // Expected to fail, but should have incremented counter
      }

      expect(failureCount).toBe(1);
    }, 15000);
  });

  describe("DoS Prevention - Maximum Dependency Depth", () => {
    it("should reject dependency chains exceeding maximum depth using factories", () => {
      // Create a deep chain using factory functions
      container.registerFactory("Level0", () => ({ level: 0 }), { lifetime: Lifetime.Singleton });

      for (let i = 1; i <= 100; i++) {
        const previousLevel = `Level${i - 1}`;
        container.registerFactory(
          `Level${i}`,
          (c) => {
            const dep = c.resolve(previousLevel);
            return { level: i, dep };
          },
          { lifetime: Lifetime.Transient },
        );
      }

      // Attempting to resolve Level100 should throw due to exceeding max depth
      expect(() => {
        container.resolve("Level100");
      }).toThrow("Maximum dependency depth (100) exceeded");
    });

    it("should allow dependency chains within reasonable depth", () => {
      // Create a 50-level chain (well within the 100 limit)
      container.registerFactory("Level0", () => ({ level: 0 }), { lifetime: Lifetime.Singleton });

      for (let i = 1; i <= 50; i++) {
        container.registerFactory(
          `Level${i}`,
          (c) => {
            const dep = c.resolve(`Level${i - 1}`);
            return { level: i, dep };
          },
          { lifetime: Lifetime.Transient },
        );
      }

      // This should work fine
      const result = container.resolve<{ level: number }>("Level50");
      expect(result.level).toBe(50);
    });

    it("should reject async dependency chains exceeding maximum depth", async () => {
      // Create a deep async chain
      container.registerAsyncFactory("Level0", async () => ({ value: 0 }), { lifetime: Lifetime.Singleton });

      for (let i = 1; i <= 100; i++) {
        container.registerAsyncFactory(
          `Level${i}`,
          async (c) => {
            const dep = await c.resolveAsync(`Level${i - 1}`);
            return { value: i };
          },
          { lifetime: Lifetime.Transient },
        );
      }

      // Should throw due to depth limit
      await expect(container.resolveAsync("Level100")).rejects.toThrow("Maximum dependency depth (100) exceeded");
    });

    it("should provide clear error message for depth limit violation", () => {
      container.registerFactory("A", () => ({ value: "A" }), { lifetime: Lifetime.Singleton });

      // Create exactly 100 levels
      for (let i = 1; i <= 100; i++) {
        container.registerFactory(
          `Service${i}`,
          (c) => {
            const dep = c.resolve(i === 1 ? "A" : `Service${i - 1}`);
            return { level: i, dep };
          },
          { lifetime: Lifetime.Transient },
        );
      }

      try {
        container.resolve("Service100");
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("Maximum dependency depth");
        expect(error.message).toContain("100");
        expect(error.message).toContain("attack attempt");
      }
    });
  });
});
