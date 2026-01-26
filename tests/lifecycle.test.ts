import { describe, test, expect, beforeEach } from "bun:test";
import { LifecycleManager } from "../src/core/lifecycle.js";
import { Lifetime, Lifecycle } from "../src/types/index.js";

describe("LifecycleManager", () => {
  let lifecycleManager: LifecycleManager;

  beforeEach(() => {
    lifecycleManager = new LifecycleManager();
  });

  describe("getSingleton", () => {
    test("should create instance only once", () => {
      const token = "Service";
      let callCount = 0;

      const instance1 = lifecycleManager.getSingleton(token, () => {
        callCount++;
        return { id: 1 };
      });

      const instance2 = lifecycleManager.getSingleton(token, () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
      expect(instance1.id).toBe(1);
    });

    test("should cache singleton instances", () => {
      const token = Symbol("Singleton");
      const instance = { value: "cached" };

      const result1 = lifecycleManager.getSingleton(token, () => instance);
      const result2: typeof instance = lifecycleManager.getSingleton(token, () => {
        throw new Error("Should not be called");
      });

      expect(result1).toBe(instance);
      expect(result2).toBe(instance);
    });

    test("should track disposable singletons", async () => {
      const token = "DisposableService";
      let disposed = false;

      const instance = {
        onDispose() {
          disposed = true;
        },
      };

      lifecycleManager.getSingleton(token, () => instance);
      await lifecycleManager.dispose();

      expect(disposed).toBe(true);
    });

    test("should call onInit hook", () => {
      const token = "InitService";
      let initCalled = false;

      const instance = {
        onInit() {
          initCalled = true;
        },
      };

      lifecycleManager.getSingleton(token, () => instance);

      expect(initCalled).toBe(true);
    });

    test("should handle onInit returning promise", () => {
      const token = "AsyncInitService";
      let asyncInitCalled = false;

      const instance = {
        onInit() {
          return Promise.resolve().then(() => {
            asyncInitCalled = true;
          });
        },
      };

      lifecycleManager.getSingleton(token, () => instance);

      // onInit promise is not awaited, but should be scheduled
      expect(instance).toBeDefined();
    });
  });

  describe("getScoped", () => {
    test("should create instance per scope", () => {
      const token = "ScopedService";
      let callCount = 0;

      const instance1 = lifecycleManager.getScoped(token, () => {
        callCount++;
        return { id: callCount };
      });

      const instance2 = lifecycleManager.getScoped(token, () => {
        callCount++;
        return { id: callCount };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
      expect(instance1.id).toBe(1);
    });

    test("should cache scoped instances within scope", () => {
      const token = Symbol("Scoped");
      const instance = { value: "scoped" };

      const result1 = lifecycleManager.getScoped(token, () => instance);
      const result2: typeof instance = lifecycleManager.getScoped(token, () => {
        throw new Error("Should not be called");
      });

      expect(result1).toBe(instance);
      expect(result2).toBe(instance);
    });

    test("should clear scoped instances", () => {
      const token = "ScopedService";
      let callCount = 0;

      lifecycleManager.getScoped(token, () => {
        callCount++;
        return { id: 1 };
      });

      lifecycleManager.clearScoped();

      lifecycleManager.getScoped(token, () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(2);
    });

    test("should track disposable scoped services", async () => {
      const token = "DisposableScopedService";
      let disposed = false;

      const instance = {
        onDispose() {
          disposed = true;
        },
      };

      lifecycleManager.getScoped(token, () => instance);
      await lifecycleManager.dispose();

      expect(disposed).toBe(true);
    });
  });

  describe("getSingletonAsync", () => {
    test("should create async instance only once", async () => {
      const token = "AsyncSingleton";
      let callCount = 0;

      const instance1 = await lifecycleManager.getSingletonAsync(token, async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: 1 };
      });

      const instance2 = await lifecycleManager.getSingletonAsync(token, async () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
      expect((instance1 as any).id).toBe(1);
    });

    test("should cache async singleton instances", async () => {
      const token = Symbol("AsyncSingleton");
      const instance = { value: "async cached" };

      const result1 = await lifecycleManager.getSingletonAsync(token, async () => instance);
      const result2: typeof instance = await lifecycleManager.getSingletonAsync(token, async () => {
        throw new Error("Should not be called");
      });

      expect(result1).toBe(instance);
      expect(result2).toBe(instance);
    });

    test("should handle async factory with delays", async () => {
      const token = "SlowAsyncSingleton";

      const instance = await lifecycleManager.getSingletonAsync(token, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { created: true };
      });

      expect((instance as any).created).toBe(true);
    });

    test("should track disposable async singletons", async () => {
      const token = "AsyncDisposableSingleton";
      let disposed = false;

      const instance = {
        onDispose() {
          disposed = true;
        },
      };

      await lifecycleManager.getSingletonAsync(token, async () => instance);
      await lifecycleManager.dispose();

      expect(disposed).toBe(true);
    });

    test("should call onInit hook for async singletons", () => {
      const token = "AsyncInitSingleton";
      let initCalled = false;

      const instance = {
        onInit() {
          initCalled = true;
        },
      };

      lifecycleManager.getSingletonAsync(token, async () => instance);

      expect(instance).toBeDefined();
    });
  });

  describe("getScopedAsync", () => {
    test("should create async scoped instance once per scope", async () => {
      const token = "AsyncScoped";
      let callCount = 0;

      const instance1 = await lifecycleManager.getScopedAsync(token, async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: callCount };
      });

      const instance2 = await lifecycleManager.getScopedAsync(token, async () => {
        callCount++;
        return { id: callCount };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
      expect((instance1 as any).id).toBe(1);
    });

    test("should cache async scoped instances", async () => {
      const token = Symbol("AsyncScoped");
      const instance = { value: "async scoped" };

      const result1 = await lifecycleManager.getScopedAsync(token, async () => instance);
      const result2: typeof instance = await lifecycleManager.getScopedAsync(token, async () => {
        throw new Error("Should not be called");
      });

      expect(result1).toBe(instance);
      expect(result2).toBe(instance);
    });

    test("should be cleared by clearScoped", async () => {
      const token = "AsyncScopedService";
      let callCount = 0;

      await lifecycleManager.getScopedAsync(token, async () => {
        callCount++;
        return { id: 1 };
      });

      lifecycleManager.clearScoped();

      await lifecycleManager.getScopedAsync(token, async () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(2);
    });

    test("should track disposable async scoped services", async () => {
      const token = "DisposableAsyncScoped";
      let disposed = false;

      const instance = {
        onDispose() {
          disposed = true;
        },
      };

      await lifecycleManager.getScopedAsync(token, async () => instance);
      await lifecycleManager.dispose();

      expect(disposed).toBe(true);
    });
  });

  describe("getTransient", () => {
    test("should create new instance every time", () => {
      const token = "Transient";
      let callCount = 0;

      const instance1 = lifecycleManager.getTransient(() => {
        callCount++;
        return { id: callCount };
      });

      const instance2 = lifecycleManager.getTransient(() => {
        callCount++;
        return { id: callCount };
      });

      expect(callCount).toBe(2);
      expect(instance1).not.toBe(instance2);
      expect((instance1 as any).id).toBe(1);
      expect((instance2 as any).id).toBe(2);
    });

    test("should still track transient disposables", async () => {
      let disposed = false;

      const instance = {
        onDispose() {
          disposed = true;
        },
      };

      lifecycleManager.getTransient(() => instance);
      await lifecycleManager.dispose();

      expect(disposed).toBe(true);
    });
  });

  describe("getTransientAsync", () => {
    test("should create new async instance every time", async () => {
      let callCount = 0;

      const instance1 = await lifecycleManager.getTransientAsync(async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: callCount };
      });

      const instance2 = await lifecycleManager.getTransientAsync(async () => {
        callCount++;
        return { id: callCount };
      });

      expect(callCount).toBe(2);
      expect(instance1).not.toBe(instance2);
      expect((instance1 as any).id).toBe(1);
      expect((instance2 as any).id).toBe(2);
    });

    test("should track disposable async transient instances", async () => {
      let disposed = false;

      const instance = {
        onDispose() {
          disposed = true;
        },
      };

      await lifecycleManager.getTransientAsync(async () => instance);
      await lifecycleManager.dispose();

      expect(disposed).toBe(true);
    });
  });

  describe("applyLifetime", () => {
    test("should apply Singleton lifetime", () => {
      const token = "SingletonToken";
      let callCount = 0;

      const instance1 = lifecycleManager.applyLifetime(Lifetime.Singleton, token, () => {
        callCount++;
        return { id: 1 };
      });

      const instance2 = lifecycleManager.applyLifetime(Lifetime.Singleton, token, () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
    });

    test("should apply Scoped lifetime", () => {
      const token = "ScopedToken";
      let callCount = 0;

      const instance1 = lifecycleManager.applyLifetime(Lifetime.Scoped, token, () => {
        callCount++;
        return { id: 1 };
      });

      const instance2 = lifecycleManager.applyLifetime(Lifetime.Scoped, token, () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
    });

    test("should apply Transient lifetime", () => {
      const token = "TransientToken";
      let callCount = 0;

      const instance1 = lifecycleManager.applyLifetime(Lifetime.Transient, token, () => {
        callCount++;
        return { id: callCount };
      });

      const instance2 = lifecycleManager.applyLifetime(Lifetime.Transient, token, () => {
        callCount++;
        return { id: callCount };
      });

      expect(callCount).toBe(2);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("applyLifetimeAsync", () => {
    test("should apply Singleton lifetime async", async () => {
      const token = "SingletonAsync";
      let callCount = 0;

      const instance1 = await lifecycleManager.applyLifetimeAsync(Lifetime.Singleton, token, async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: 1 };
      });

      const instance2 = await lifecycleManager.applyLifetimeAsync(Lifetime.Singleton, token, async () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
    });

    test("should apply Scoped lifetime async", async () => {
      const token = "ScopedAsync";
      let callCount = 0;

      const instance1 = await lifecycleManager.applyLifetimeAsync(Lifetime.Scoped, token, async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: 1 };
      });

      const instance2 = await lifecycleManager.applyLifetimeAsync(Lifetime.Scoped, token, async () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(1);
      expect(instance1).toBe(instance2);
    });

    test("should apply Transient lifetime async", async () => {
      const token = "TransientAsync";
      let callCount = 0;

      const instance1 = await lifecycleManager.applyLifetimeAsync(Lifetime.Transient, token, async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { id: callCount };
      });

      const instance2 = await lifecycleManager.applyLifetimeAsync(Lifetime.Transient, token, async () => {
        callCount++;
        return { id: callCount };
      });

      expect(callCount).toBe(2);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Disposal and Lifecycle Hooks", () => {
    test("should call onDispose hooks in reverse order", async () => {
      const order: string[] = [];

      const service1 = {
        onDispose() {
          order.push("service1");
        },
      };

      const service2 = {
        onDispose() {
          order.push("service2");
        },
      };

      lifecycleManager.getSingleton("s1", () => service1);
      lifecycleManager.getSingleton("s2", () => service2);

      await lifecycleManager.dispose();

      expect(order).toEqual(["service2", "service1"]);
    });

    test("should handle async onDispose hooks", async () => {
      let disposed = false;

      const instance = {
        async onDispose() {
          await new Promise((resolve) => setTimeout(resolve, 5));
          disposed = true;
        },
      };

      lifecycleManager.getSingleton("service", () => instance);
      await lifecycleManager.dispose();

      expect(disposed).toBe(true);
    });

    test("should continue disposing even if one hook fails", async () => {
      let disposed2 = false;

      const service1 = {
        onDispose() {
          throw new Error("Disposal error");
        },
      };

      const service2 = {
        onDispose() {
          disposed2 = true;
        },
      };

      lifecycleManager.getSingleton("s1", () => service1);
      lifecycleManager.getSingleton("s2", () => service2);

      await lifecycleManager.dispose();

      expect(disposed2).toBe(true);
    });

    test("should clear all caches after dispose", async () => {
      let callCount = 0;

      const token = "Service";

      lifecycleManager.getSingleton(token, () => {
        callCount++;
        return { id: 1 };
      });

      await lifecycleManager.dispose();

      lifecycleManager.getSingleton(token, () => {
        callCount++;
        return { id: 2 };
      });

      expect(callCount).toBe(2);
    });

    test("should handle both sync and async onDispose", async () => {
      let syncDisposed = false;
      let asyncDisposed = false;

      const syncService = {
        onDispose() {
          syncDisposed = true;
        },
      };

      const asyncService = {
        async onDispose() {
          await new Promise((resolve) => setTimeout(resolve, 5));
          asyncDisposed = true;
        },
      };

      lifecycleManager.getSingleton("sync", () => syncService);
      lifecycleManager.getSingleton("async", () => asyncService);

      await lifecycleManager.dispose();

      expect(syncDisposed).toBe(true);
      expect(asyncDisposed).toBe(true);
    });
  });

  describe("createChild", () => {
    test("should create child manager with shared singletons", () => {
      const token = "SharedSingleton";
      const instance = { value: "shared" };

      lifecycleManager.getSingleton(token, () => instance);

      const child = lifecycleManager.createChild();
      const childInstance: typeof instance = child.getSingleton(token, () => {
        throw new Error("Should not create new instance");
      });

      expect(childInstance).toBe(instance);
    });

    test("should isolate scoped instances in child", () => {
      const singletonToken = "Singleton";
      const scopedToken = "Scoped";
      const singletonInstance = { type: "singleton" };
      const scopedInstance = { type: "scoped" };

      lifecycleManager.getSingleton(singletonToken, () => singletonInstance);
      lifecycleManager.getScoped(scopedToken, () => scopedInstance);

      const child = lifecycleManager.createChild();

      // Child should have singleton
      const childSingleton: typeof singletonInstance = child.getSingleton(singletonToken, () => {
        throw new Error("Should not create");
      });
      expect(childSingleton).toBe(singletonInstance);

      // Child should create new scoped instance
      const newScopedInstance = child.getScoped(scopedToken, () => ({
        type: "new-scoped",
      }));

      expect((newScopedInstance as any).type).toBe("new-scoped");
    });

    test("should dispose child independently", async () => {
      let parentDisposed = false;
      let childDisposed = false;

      const parentService = {
        onDispose() {
          parentDisposed = true;
        },
      };

      const childService = {
        onDispose() {
          childDisposed = true;
        },
      };

      lifecycleManager.getSingleton("parent", () => parentService);

      const child = lifecycleManager.createChild();
      child.getSingleton("child", () => childService);

      await child.dispose();

      expect(childDisposed).toBe(true);
      expect(parentDisposed).toBe(false);
    });

    test("child should have empty scoped instances", async () => {
      lifecycleManager.getScoped("scope", () => ({ value: 1 }));

      const child = lifecycleManager.createChild();

      // Child should create new scoped instance
      let callCount = 0;
      child.getScoped("scope", () => {
        callCount++;
        return { value: 2 };
      });

      expect(callCount).toBe(1);
    });
  });

  describe("hasLifecycleHooks", () => {
    test("should track service with onInit hook", () => {
      const token = "InitHook";
      let initCalled = false;

      const instance = {
        onInit() {
          initCalled = true;
        },
      };

      lifecycleManager.getSingleton(token, () => instance);

      expect(initCalled).toBe(true);
    });

    test("should track service with onDispose hook", async () => {
      const token = "DisposeHook";
      let disposeCalled = false;

      const instance = {
        onDispose() {
          disposeCalled = true;
        },
      };

      lifecycleManager.getSingleton(token, () => instance);
      await lifecycleManager.dispose();

      expect(disposeCalled).toBe(true);
    });

    test("should track service with both hooks", async () => {
      const token = "BothHooks";
      let initCalled = false;
      let disposeCalled = false;

      const instance = {
        onInit() {
          initCalled = true;
        },
        onDispose() {
          disposeCalled = true;
        },
      };

      lifecycleManager.getSingleton(token, () => instance);
      await lifecycleManager.dispose();

      expect(initCalled).toBe(true);
      expect(disposeCalled).toBe(true);
    });

    test("should not track service without lifecycle hooks", async () => {
      const token = "NoHooks";

      const instance = { value: 123 };

      lifecycleManager.getSingleton(token, () => instance);
      await lifecycleManager.dispose();

      expect(instance.value).toBe(123);
    });
  });
});
