import { describe, test, expect } from "bun:test";
import {
  DependencyError,
  CircularDependencyError,
  UnregisteredServiceError,
  RegistrationError,
  ResolutionError,
} from "../src/errors/index.js";

describe("Error Classes", () => {
  describe("DependencyError", () => {
    test("should create DependencyError with message and token", () => {
      const token = "TestService";
      const error = new DependencyError("Test error message", token);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("DependencyError");
      expect(error.message).toBe("Test error message");
      expect(error.token).toBe(token);
    });

    test("should have proper error name", () => {
      const error = new DependencyError("Test", Symbol("Test"));
      expect(error.name).toBe("DependencyError");
    });

    test("should work with function tokens", () => {
      class MyClass {}
      const error = new DependencyError("Test", MyClass);

      expect(error.token).toBe(MyClass);
      expect(error).toBeInstanceOf(DependencyError);
    });

    test("should work with symbol tokens", () => {
      const token = Symbol("MyToken");
      const error = new DependencyError("Test", token);

      expect(error.token).toBe(token);
    });

    test("should work with string tokens", () => {
      const error = new DependencyError("Test", "MyToken");

      expect(error.token).toBe("MyToken");
    });

    test("should have stack trace captured", () => {
      const error = new DependencyError("Test", "Token");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("Error");
    });
  });

  describe("CircularDependencyError", () => {
    test("should create CircularDependencyError with chain", () => {
      const chain = ["ServiceA", "ServiceB", "ServiceC", "ServiceA"];
      const error = new CircularDependencyError(chain);

      expect(error).toBeInstanceOf(DependencyError);
      expect(error.name).toBe("CircularDependencyError");
      expect(error.chain).toBe(chain);
      expect(error.token).toBe("ServiceA");
    });

    test("should format chain with function names", () => {
      class ServiceA {}
      class ServiceB {}
      class ServiceC {}

      const chain = [ServiceA, ServiceB, ServiceC, ServiceA];
      const error = new CircularDependencyError(chain);

      expect(error.message).toContain("Circular dependency detected");
      expect(error.message).toContain("ServiceA");
      expect(error.message).toContain("ServiceB");
      expect(error.message).toContain("ServiceC");
      expect(error.message).toContain("→");
    });

    test("should format chain with symbols", () => {
      const TokenA = Symbol("ServiceA");
      const TokenB = Symbol("ServiceB");
      const chain = [TokenA, TokenB, TokenA];

      const error = new CircularDependencyError(chain);

      expect(error.message).toContain("Circular dependency detected");
      expect(error.chain).toEqual(chain);
    });

    test("should format chain with mixed token types", () => {
      class MyService {}
      const StringToken = "StringService";
      const SymbolToken = Symbol("SymbolService");

      const chain = [MyService, StringToken, SymbolToken, MyService];
      const error = new CircularDependencyError(chain);

      expect(error.message).toContain("Circular dependency detected");
      expect(error.chain).toEqual(chain);
    });

    test("should handle empty chain", () => {
      const chain: any[] = [];
      const error = new CircularDependencyError(chain);

      expect(error.chain).toEqual(chain);
      expect(error).toBeInstanceOf(CircularDependencyError);
    });

    test("should handle single item in chain", () => {
      const chain = ["Service"];
      const error = new CircularDependencyError(chain);

      expect(error.message).toContain("Service");
      expect(error.chain).toEqual(chain);
    });
  });

  describe("UnregisteredServiceError", () => {
    test("should create UnregisteredServiceError with function token", () => {
      class MyService {}
      const error = new UnregisteredServiceError(MyService);

      expect(error).toBeInstanceOf(DependencyError);
      expect(error.name).toBe("UnregisteredServiceError");
      expect(error.token).toBe(MyService);
      expect(error.message).toContain("MyService");
      expect(error.message).toContain("not registered");
    });

    test("should create UnregisteredServiceError with string token", () => {
      const error = new UnregisteredServiceError("DatabaseService");

      expect(error.name).toBe("UnregisteredServiceError");
      expect(error.token).toBe("DatabaseService");
      expect(error.message).toContain("DatabaseService");
      expect(error.message).toContain("Did you forget to register it?");
    });

    test("should create UnregisteredServiceError with symbol token", () => {
      const token = Symbol("DatabaseService");
      const error = new UnregisteredServiceError(token);

      expect(error.token).toBe(token);
      expect(error.message).toContain("not registered");
    });

    test("should have helpful message", () => {
      class AuthService {}
      const error = new UnregisteredServiceError(AuthService);

      expect(error.message).toContain("Did you forget to register it?");
    });
  });

  describe("RegistrationError", () => {
    test("should create RegistrationError with function token and reason", () => {
      class MyService {}
      const error = new RegistrationError(MyService, "Invalid factory");

      expect(error).toBeInstanceOf(DependencyError);
      expect(error.name).toBe("RegistrationError");
      expect(error.token).toBe(MyService);
      expect(error.message).toContain("MyService");
      expect(error.message).toContain("Failed to register");
      expect(error.message).toContain("Invalid factory");
    });

    test("should create RegistrationError with string token", () => {
      const error = new RegistrationError("Config", "Missing required fields");

      expect(error.name).toBe("RegistrationError");
      expect(error.token).toBe("Config");
      expect(error.message).toContain("Config");
      expect(error.message).toContain("Missing required fields");
    });

    test("should create RegistrationError with symbol token", () => {
      const token = Symbol("Logger");
      const error = new RegistrationError(token, "Invalid lifetime");

      expect(error.token).toBe(token);
      expect(error.message).toContain("Failed to register");
      expect(error.message).toContain("Invalid lifetime");
    });

    test("should include reason in message", () => {
      class Service {}
      const reasons = [
        "Circular reference",
        "Invalid dependency",
        "Factory function required",
      ];

      reasons.forEach((reason) => {
        const error = new RegistrationError(Service, reason);
        expect(error.message).toContain(reason);
      });
    });
  });

  describe("ResolutionError", () => {
    test("should create ResolutionError with token and reason", () => {
      class MyService {}
      const error = new ResolutionError(MyService, "Missing dependency");

      expect(error).toBeInstanceOf(DependencyError);
      expect(error.name).toBe("ResolutionError");
      expect(error.token).toBe(MyService);
      expect(error.message).toContain("MyService");
      expect(error.message).toContain("Failed to resolve");
      expect(error.message).toContain("Missing dependency");
      expect(error.cause).toBeUndefined();
    });

    test("should create ResolutionError with cause error", () => {
      class MyService {}
      const causeError = new Error("Original error");
      const error = new ResolutionError(
        MyService,
        "Dependency resolution failed",
        causeError,
      );

      expect(error.cause).toBe(causeError);
      expect(error.message).toContain("Dependency resolution failed");
    });

    test("should work with string token", () => {
      const error = new ResolutionError(
        "DatabaseService",
        "Connection timeout",
      );

      expect(error.token).toBe("DatabaseService");
      expect(error.message).toContain("Connection timeout");
    });

    test("should work with symbol token", () => {
      const token = Symbol("Logger");
      const error = new ResolutionError(token, "Invalid configuration");

      expect(error.token).toBe(token);
      expect(error.message).toContain("Invalid configuration");
    });

    test("should preserve cause error chain", () => {
      const originalError = new Error("Network failure");
      const resolutionError = new ResolutionError(
        "HttpClient",
        "Could not connect",
        originalError,
      );

      expect(resolutionError.cause).toBe(originalError);
      expect(resolutionError.cause?.message).toBe("Network failure");
    });

    test("should handle undefined cause", () => {
      const error = new ResolutionError("Service", "Failed");

      expect(error.cause).toBeUndefined();
      expect(error).toBeInstanceOf(ResolutionError);
    });

    test("should capture stack trace when cause provided", () => {
      const causeError = new Error("Cause");
      const error = new ResolutionError(
        "Service",
        "Resolution failed",
        causeError,
      );

      expect(error.stack).toBeDefined();
      expect(error.cause).toBe(causeError);
    });

    test("should handle null cause", () => {
      // @ts-ignore - testing edge case
      const error = new ResolutionError("Service", "Failed", null);

      expect(error.cause).toBeNull();
      expect(error.message).toContain("Failed");
    });
  });

  describe("Error Inheritance", () => {
    test("all errors should inherit from DependencyError", () => {
      const errors = [
        new CircularDependencyError(["A", "B"]),
        new UnregisteredServiceError("Test"),
        new RegistrationError("Test", "reason"),
        new ResolutionError("Test", "reason"),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(DependencyError);
        expect(error).toBeInstanceOf(Error);
      });
    });

    test("all errors should have token property", () => {
      const token = "TestToken";
      const errors = [
        new CircularDependencyError([token]),
        new UnregisteredServiceError(token),
        new RegistrationError(token, "reason"),
        new ResolutionError(token, "reason"),
      ];

      errors.forEach((error) => {
        expect(error.token).toBeDefined();
      });
    });

    test("all errors should have proper name property", () => {
      const errorNames = [
        { error: new DependencyError("msg", "token"), name: "DependencyError" },
        {
          error: new CircularDependencyError(["A"]),
          name: "CircularDependencyError",
        },
        {
          error: new UnregisteredServiceError("token"),
          name: "UnregisteredServiceError",
        },
        {
          error: new RegistrationError("token", "reason"),
          name: "RegistrationError",
        },
        {
          error: new ResolutionError("token", "reason"),
          name: "ResolutionError",
        },
      ];

      errorNames.forEach(({ error, name }) => {
        expect(error.name).toBe(name);
      });
    });
  });

  describe("Error Messages", () => {
    test("error messages should be descriptive", () => {
      class DatabaseService {}

      const errors = [
        {
          error: new UnregisteredServiceError(DatabaseService),
          keyword: "not registered",
        },
        {
          error: new RegistrationError(DatabaseService, "Invalid factory"),
          keyword: "Failed to register",
        },
        {
          error: new ResolutionError(DatabaseService, "Missing dependency"),
          keyword: "Failed to resolve",
        },
      ];

      errors.forEach(({ error, keyword }) => {
        expect(error.message).toContain(keyword);
      });
    });

    test("CircularDependencyError should show chain", () => {
      class ServiceA {}
      class ServiceB {}
      class ServiceC {}

      const error = new CircularDependencyError([
        ServiceA,
        ServiceB,
        ServiceC,
        ServiceA,
      ]);

      expect(error.message).toContain("ServiceA");
      expect(error.message).toContain("ServiceB");
      expect(error.message).toContain("ServiceC");
      expect(error.message).toContain("→");
    });
  });
});
