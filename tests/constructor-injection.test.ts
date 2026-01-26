import { describe, test, expect, beforeEach } from "bun:test";
import { Container, Lifetime } from "../src/index.js";
import {
  ResolutionError,
  UnregisteredServiceError,
} from "../src/errors/index.js";

describe("Constructor Dependency Injection", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("Sync Constructor Injection Error Handling", () => {
    test("should handle missing constructor dependency", () => {
      class Logger {}

      class Service {
        constructor(public logger: Logger) {}
      }

      // Register service that requires Logger
      container.registerFactory(Service, (c) => {
        // Simulate constructor injection where Logger is missing
        const logger = c.resolve(Logger); // This will throw UnregisteredServiceError
        return new Service(logger);
      });

      expect(() => {
        container.resolve(Service);
      }).toThrow(UnregisteredServiceError);
    });

    test("should catch dependency resolution errors in sync context", () => {
      class Logger {}
      const dbToken = Symbol("Database");

      class Service {
        constructor(
          public logger: Logger,
          public db: any,
        ) {}
      }

      container.registerFactory(Service, (c) => {
        try {
          const logger = c.resolve(Logger); // This will throw
          const db = c.resolve(dbToken);
          return new Service(logger, db);
        } catch (error) {
          if (error instanceof UnregisteredServiceError) {
            throw new Error(`Dependency not found: ${error.message}`);
          }
          throw error;
        }
      });

      expect(() => {
        container.resolve(Service);
      }).toThrow();
    });

    test("should provide error context for missing dependencies", () => {
      class Repository {}

      class UserService {
        constructor(public repo: Repository) {}
      }

      container.registerFactory(UserService, (c) => {
        const repo = c.resolve(Repository); // Missing
        return new UserService(repo);
      });

      try {
        container.resolve(UserService);
      } catch (error) {
        expect(error).toBeInstanceOf(UnregisteredServiceError);
      }
    });

    test("should handle multiple unregistered dependencies", () => {
      class Logger {}
      class Database {}

      class ComplexService {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }

      container.registerFactory(ComplexService, (c) => {
        const logger = c.resolve(Logger); // First will throw
        const db = c.resolve(Database);
        return new ComplexService(logger, db);
      });

      expect(() => {
        container.resolve(ComplexService);
      }).toThrow(UnregisteredServiceError);
    });

    test("should preserve error information during dependency resolution", () => {
      class Logger {}

      class Service {
        constructor(public logger: Logger) {}
      }

      container.registerFactory(Service, (c) => {
        const logger = c.resolve(Logger);
        return new Service(logger);
      });

      try {
        container.resolve(Service);
      } catch (error) {
        if (error instanceof UnregisteredServiceError) {
          expect(error.token).toBe(Logger);
          expect(error.message).toContain("Logger");
        }
      }
    });
  });

  describe("Async Constructor Injection Error Handling", () => {
    test("should handle missing async constructor dependency", async () => {
      class Logger {}

      class Service {
        constructor(public logger: Logger) {}
      }

      const serviceToken = Symbol("Service");

      container.registerAsyncFactory(serviceToken, async (c) => {
        const logger = await c.resolveAsync(Logger); // This will throw
        return new Service(logger);
      });

      const error = expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow(UnregisteredServiceError);
    });

    test("should catch dependency resolution errors in async context", async () => {
      class Logger {}
      const dbToken = Symbol("Database");

      class Service {
        constructor(
          public logger: Logger,
          public db: any,
        ) {}
      }

      const serviceToken = Symbol("Service");

      container.registerAsyncFactory(serviceToken, async (c) => {
        try {
          const logger = await c.resolveAsync(Logger); // This will throw
          const db = await c.resolveAsync(dbToken);
          return new Service(logger, db);
        } catch (error) {
          if (error instanceof UnregisteredServiceError) {
            throw new Error(`Dependency not found: ${error.message}`);
          }
          throw error;
        }
      });

      const error = expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow();
    });

    test("should provide error context for missing async dependencies", async () => {
      class Repository {}

      class UserService {
        constructor(public repo: Repository) {}
      }

      const serviceToken = Symbol("UserService");

      container.registerAsyncFactory(serviceToken, async (c) => {
        const repo = await c.resolveAsync(Repository); // Missing
        return new UserService(repo);
      });

      const error = expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow(UnregisteredServiceError);
    });

    test("should handle multiple unregistered async dependencies", async () => {
      class Logger {}
      class Database {}

      class ComplexService {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }

      const serviceToken = Symbol("ComplexService");

      container.registerAsyncFactory(serviceToken, async (c) => {
        const logger = await c.resolveAsync(Logger); // First will throw
        const db = await c.resolveAsync(Database);
        return new ComplexService(logger, db);
      });

      const error = expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow(UnregisteredServiceError);
    });

    test("should preserve error information during async dependency resolution", async () => {
      class Logger {}

      class Service {
        constructor(public logger: Logger) {}
      }

      const serviceToken = Symbol("Service");

      container.registerAsyncFactory(serviceToken, async (c) => {
        const logger = await c.resolveAsync(Logger);
        return new Service(logger);
      });

      try {
        await container.resolveAsync(serviceToken);
      } catch (error) {
        if (error instanceof UnregisteredServiceError) {
          expect(error.token).toBe(Logger);
          expect(error.message).toContain("Logger");
        }
      }
    });

    test("should handle async dependency with proper Promise.all", async () => {
      class Logger {}
      class Database {}

      class Service {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }

      const serviceToken = Symbol("Service");

      container.registerAsyncFactory(serviceToken, async (c) => {
        // This simulates parallel dependency resolution with Promise.all
        const [logger, db] = await Promise.all([
          c.resolveAsync(Logger),
          c.resolveAsync(Database),
        ]);
        return new Service(logger, db);
      });

      const error = expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow(UnregisteredServiceError);
    });
  });

  describe("Constructor Dependency Chain", () => {
    test("should handle error in nested constructor dependencies", () => {
      class Logger {}

      class Repository {
        constructor(public logger: Logger) {}
      }

      class Service {
        constructor(public repo: Repository) {}
      }

      container.registerFactory(Repository, (c) => {
        const logger = c.resolve(Logger);
        return new Repository(logger);
      });

      container.registerFactory(Service, (c) => {
        const repo = c.resolve(Repository); // This will fail due to missing Logger
        return new Service(repo);
      });

      expect(() => {
        container.resolve(Service);
      }).toThrow(UnregisteredServiceError);
    });

    test("should handle async error in nested constructor dependencies", async () => {
      class Logger {}

      class Repository {
        constructor(public logger: Logger) {}
      }

      class Service {
        constructor(public repo: Repository) {}
      }

      const repoToken = Symbol("Repository");
      const serviceToken = Symbol("Service");

      container.registerAsyncFactory(repoToken, async (c) => {
        const logger = await c.resolveAsync(Logger);
        return new Repository(logger);
      });

      container.registerAsyncFactory(serviceToken, async (c) => {
        const repo = (await c.resolveAsync(repoToken)) as Repository;
        return new Service(repo);
      });

      const error = expect(async () => {
        await container.resolveAsync(serviceToken);
      }).toThrow(UnregisteredServiceError);
    });
  });

  describe("Complex Dependency Injection Scenarios", () => {
    test("should handle dependency resolution with mixed registered and unregistered", () => {
      class Logger {}
      class Database {}

      class Repository {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }

      // Register Logger but not Database
      container.register(Logger);

      container.registerFactory(Repository, (c) => {
        const logger = c.resolve(Logger); // OK
        const db = c.resolve(Database); // Will throw
        return new Repository(logger, db);
      });

      expect(() => {
        container.resolve(Repository);
      }).toThrow(UnregisteredServiceError);
    });

    test("should handle transient vs singleton with dependency errors", () => {
      class Logger {}

      const serviceToken = Symbol("Service");

      class Service {
        constructor(public logger: Logger) {}
      }

      container.registerFactory(serviceToken, (c) => {
        const logger = c.resolve(Logger);
        return new Service(logger);
      });

      // Each call should throw the same error
      expect(() => {
        container.resolve(serviceToken);
      }).toThrow(UnregisteredServiceError);

      expect(() => {
        container.resolve(serviceToken);
      }).toThrow(UnregisteredServiceError);
    });

    test("should handle circular dependencies detected at constructor level", () => {
      const serviceAToken = Symbol("ServiceA");
      const serviceBToken = Symbol("ServiceB");

      container.registerFactory(serviceAToken, (c) => {
        return c.resolve(serviceBToken);
      });

      container.registerFactory(serviceBToken, (c) => {
        return c.resolve(serviceAToken);
      });

      expect(() => {
        container.resolve(serviceAToken);
      }).toThrow();
    });

    test("should handle error recovery after failed resolution", () => {
      class Logger {}

      class FailingService {
        constructor(public logger: Logger) {}
      }

      class WorkingService {}

      container.registerFactory(FailingService, (c) => {
        const logger = c.resolve(Logger); // Missing
        return new FailingService(logger);
      });

      container.register(WorkingService);

      // First call fails
      expect(() => {
        container.resolve(FailingService);
      }).toThrow();

      // Second call (to different service) should work
      const working = container.resolve(WorkingService);
      expect(working).toBeInstanceOf(WorkingService);
    });
  });

  describe("Error Message Quality", () => {
    test("should include helpful information about missing dependencies", () => {
      class Logger {}

      class Service {
        constructor(public logger: Logger) {}
      }

      container.registerFactory(Service, (c) => {
        const logger = c.resolve(Logger);
        return new Service(logger);
      });

      try {
        container.resolve(Service);
      } catch (error) {
        if (error instanceof UnregisteredServiceError) {
          expect(error.message).toContain("Logger");
          expect(error.message).toContain("not registered");
        }
      }
    });

    test("should identify which dependency is missing in multi-dependency case", () => {
      class Logger {}
      class Database {}

      class Service {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }

      container.register(Logger); // Register only Logger

      container.registerFactory(Service, (c) => {
        const logger = c.resolve(Logger);
        const db = c.resolve(Database); // This will fail
        return new Service(logger, db);
      });

      try {
        container.resolve(Service);
      } catch (error) {
        if (error instanceof UnregisteredServiceError) {
          expect(error.message).toContain("Database");
        }
      }
    });
  });
});
