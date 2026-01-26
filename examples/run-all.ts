#!/usr/bin/env bun
// Run all examples in order

const examples = [
  "01-simple-registration.ts",
  "02-dependency-injection.ts",
  "03-scoped-containers.ts",
  "04-async-factories.ts",
  "05-lifecycle-hooks.ts",
  "06-testing-mocks.ts",
  "07-decorator-lifetimes.ts",
  "08-inject-decorator.ts",
  "09-decorators-factories.ts",
  "11-lifecycle-hooks-advanced.ts",
];

console.log("🚀 Running all fast-injection examples...\n");
console.log("=".repeat(60));

for (const example of examples) {
  try {
    console.log(`\n📝 Running: ${example}`);
    console.log("-".repeat(60));

    const proc = Bun.spawn(["bun", "run", example], {
      stdout: "inherit",
      stderr: "inherit",
      cwd: "examples",
    });

    await proc.exited;

    if (proc.exitCode !== 0) {
      console.error(`\n❌ Failed: ${example} (exit code: ${proc.exitCode})`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error running ${example}:`, error);
    process.exit(1);
  }
}

console.log("\n" + "=".repeat(60));
console.log("✅ All examples completed successfully!");
console.log("=".repeat(60) + "\n");
export {};
