#!/usr/bin/env bun

/**
 * Memory Leak Validation Script
 *
 * This script tests various scenarios that could cause memory leaks in the DI container.
 * It monitors memory usage and validates proper cleanup of resources.
 */

import { Container, getGlobalContainer, resetGlobalContainer, Lifetime } from "../src/index.js";
import { singleton, clearDecoratorMetadata } from "../src/decorators/index.js";

interface MemorySnapshot {
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

function getMemoryUsage(): MemorySnapshot {
  if (global.gc) {
    global.gc();
  }
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
  };
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function calculateMemoryIncrease(before: MemorySnapshot, after: MemorySnapshot): number {
  return after.heapUsed - before.heapUsed;
}

async function runTest(name: string, testFn: () => Promise<void> | void): Promise<boolean> {
  console.log(`\n🧪 Testing: ${name}`);

  const memBefore = getMemoryUsage();

  try {
    await testFn();

    // Force garbage collection multiple times
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const memAfter = getMemoryUsage();
    const increase = calculateMemoryIncrease(memBefore, memAfter);
    const threshold = 5 * 1024 * 1024; // 5MB threshold

    console.log(`   Memory before: ${formatBytes(memBefore.heapUsed)}`);
    console.log(`   Memory after:  ${formatBytes(memAfter.heapUsed)}`);
    console.log(`   Increase:      ${formatBytes(increase)}`);

    if (increase > threshold) {
      console.log(`   ❌ POTENTIAL LEAK: Memory increased by more than ${formatBytes(threshold)}`);
      return false;
    } else {
      console.log(`   ✅ PASS: Memory increase within acceptable range`);
      return true;
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

// Test 1: Container disposal cleanup
async function testContainerDisposal() {
  const containers: Container[] = [];

  for (let i = 0; i < 10000; i++) {
    const container = new Container();

    class Service {
      data = new Array(1000).fill(i);
    }

    container.register(Service, { lifetime: Lifetime.Singleton });
    container.resolve(Service);
    containers.push(container);
  }

  // Dispose all containers
  for (const container of containers) {
    await container.dispose();
  }

  containers.length = 0;
}

// Test 2: Decorator metadata cleanup
async function testDecoratorMetadataCleanup() {
  const classes: any[] = [];

  for (let i = 0; i < 10000; i++) {
    @singleton()
    class DynamicService {
      data = new Array(1000).fill(i);
    }

    const container = new Container();
    container.register(DynamicService);
    container.resolve(DynamicService);
    await container.dispose();

    clearDecoratorMetadata(DynamicService);
    classes.push(DynamicService);
  }

  classes.length = 0;
}

// Test 3: Failed async token cleanup
async function testFailedAsyncTokenCleanup() {
  for (let i = 0; i < 10000; i++) {
    const container = new Container();

    container.registerAsyncFactory(
      `failing-service-${i}`,
      async () => {
        throw new Error("Intentional failure");
      },
      { lifetime: Lifetime.Singleton },
    );

    try {
      await container.resolveAsync(`failing-service-${i}`);
    } catch (e) {
      // Expected
    }

    await container.dispose();
  }
}

// Test 4: Scoped container cleanup
async function testScopedContainerCleanup() {
  const parent = new Container();

  class ScopedService {
    data = new Array(1000).fill(0);
  }

  parent.register(ScopedService, { lifetime: Lifetime.Scoped });

  const scopes: any[] = [];
  for (let i = 0; i < 10000; i++) {
    const scope = parent.createScope();
    scope.resolve(ScopedService);
    scopes.push(scope);
  }

  // Dispose all scopes
  for (const scope of scopes) {
    await scope.dispose();
  }

  scopes.length = 0;
  await parent.dispose();
}

// Test 5: Global container reset
async function testGlobalContainerReset() {
  for (let i = 0; i < 10000; i++) {
    const container = getGlobalContainer();

    class Service {
      data = new Array(1000).fill(i);
    }

    container.register(`service-${i}`, Service, { lifetime: Lifetime.Singleton });
    container.resolve(`service-${i}`);

    await resetGlobalContainer();
  }
}

// Test 6: Transient instances
async function testTransientInstances() {
  const container = new Container();

  class TransientService {
    data = new Array(1000).fill(0);
  }

  container.register(TransientService, { lifetime: Lifetime.Transient });

  const instances: any[] = [];
  for (let i = 0; i < 10000; i++) {
    instances.push(container.resolve(TransientService));
  }

  instances.length = 0;
  await container.dispose();
}

// Test 7: Factory registrations
async function testFactoryRegistrations() {
  for (let i = 0; i < 10000; i++) {
    const container = new Container();

    container.registerFactory("factory-service", () => ({ data: new Array(1000).fill(i) }), {
      lifetime: Lifetime.Transient,
    });

    const results: any[] = [];
    for (let j = 0; j < 10; j++) {
      results.push(container.resolve("factory-service"));
    }

    results.length = 0;
    await container.dispose();
  }
}

// Test 8: Async factory registrations
async function testAsyncFactoryRegistrations() {
  for (let i = 0; i < 5000; i++) {
    const container = new Container();

    container.registerAsyncFactory(
      "async-service",
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { data: new Array(1000).fill(i) };
      },
      { lifetime: Lifetime.Singleton },
    );

    await container.resolveAsync("async-service");
    await container.dispose();
  }
}

// Test 9: Multiple registrations
async function testMultipleRegistrations() {
  const container = new Container();

  for (let i = 0; i < 10000; i++) {
    class Service {
      data = new Array(100).fill(i);
    }

    container.registerAll(`multi-service`, [Service]);
  }

  const results = container.resolveAll("multi-service");
  await container.dispose();
}

// Test 10: Lifecycle hooks
async function testLifecycleHooks() {
  for (let i = 0; i < 10000; i++) {
    const container = new Container();

    class ServiceWithHooks {
      data = new Array(1000).fill(i);

      async onInit() {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      async onDispose() {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }

    container.register(ServiceWithHooks, { lifetime: Lifetime.Singleton });
    await container.resolveAsync(ServiceWithHooks);
    await container.dispose();
  }
}

// Main execution
async function main() {
  console.log("==========================================");
  console.log("  Memory Leak Validation Script");
  console.log("==========================================");
  console.log("\nNote: Run with --expose-gc flag for accurate results:");
  console.log("  bun --expose-gc run scripts/memory-leak-check.ts\n");

  if (!global.gc) {
    console.log("⚠️  WARNING: Garbage collection not exposed. Results may be less accurate.");
    console.log("   Run with --expose-gc flag for better results.\n");
  }

  const tests = [
    { name: "Container disposal cleanup", fn: testContainerDisposal },
    { name: "Decorator metadata cleanup", fn: testDecoratorMetadataCleanup },
    { name: "Failed async token cleanup", fn: testFailedAsyncTokenCleanup },
    { name: "Scoped container cleanup", fn: testScopedContainerCleanup },
    { name: "Global container reset", fn: testGlobalContainerReset },
    { name: "Transient instances", fn: testTransientInstances },
    { name: "Factory registrations", fn: testFactoryRegistrations },
    { name: "Async factory registrations", fn: testAsyncFactoryRegistrations },
    { name: "Multiple registrations", fn: testMultipleRegistrations },
    { name: "Lifecycle hooks", fn: testLifecycleHooks },
  ];

  const results: boolean[] = [];

  for (const test of tests) {
    const passed = await runTest(test.name, test.fn);
    results.push(passed);
  }

  console.log("\n==========================================");
  console.log("  Results Summary");
  console.log("==========================================");

  const passed = results.filter((r) => r).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log(`\nPassed: ${passed}/${total} (${percentage}%)`);

  if (passed === total) {
    console.log("\n✅ All memory leak tests passed!");
    process.exit(0);
  } else {
    console.log("\n❌ Some tests failed. Review the output above.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
