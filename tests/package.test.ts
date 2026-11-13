import { describe, test } from "bun:test";
import { cp, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..");

describe("Package build", () => {
  test("shares decorator metadata between package entrypoints", async () => {
    const packageRoot = await mkdtemp(
      join(tmpdir(), "fast-injection-package-"),
    );
    const consumerRoot = await mkdtemp(
      join(tmpdir(), "fast-injection-consumer-"),
    );

    try {
      await cp(
        join(projectRoot, "package.json"),
        join(packageRoot, "package.json"),
      );
      await Bun.$`bun build ${join(projectRoot, "src/index.ts")} ${join(projectRoot, "src/decorators/index.ts")} ${join(projectRoot, "src/testing/index.ts")} --outdir ${join(packageRoot, "dist")} --target bun --format esm --splitting`.quiet();
      await mkdir(join(consumerRoot, "node_modules"));
      await symlink(
        packageRoot,
        join(consumerRoot, "node_modules", "fast-injection"),
      );
      await writeFile(
        join(consumerRoot, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { experimentalDecorators: true } }),
      );
      await writeFile(
        join(consumerRoot, "index.ts"),
        `
import { Container } from "fast-injection";
import { inject, singleton } from "fast-injection/decorators";

@singleton()
class Database {}

@singleton()
class UserService {
  constructor(@inject(Database) readonly database: Database) {}
}

const container = new Container();
container.register(Database);
container.register(UserService);

if (!(container.resolve(UserService).database instanceof Database)) {
  throw new Error("Decorator metadata was not shared between package entrypoints");
}
`,
      );

      await Bun.$`bun index.ts`.cwd(consumerRoot).quiet();
    } finally {
      await Promise.all([
        rm(packageRoot, { force: true, recursive: true }),
        rm(consumerRoot, { force: true, recursive: true }),
      ]);
    }
  });
});
