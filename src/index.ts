// Core exports
export { Container, createContainer, getGlobalContainer, resetGlobalContainer } from "./core/container.js";
export { Registry } from "./core/registry.js";
export { Resolver } from "./core/resolver.js";
export { LifecycleManager } from "./core/lifecycle.js";

// Type exports
export type {
  Token,
  Constructor,
  AbstractConstructor,
  Factory,
  AsyncFactory,
  ServiceDefinition,
  RegistrationOptions,
  Lifecycle,
  IContainer,
  InjectionToken,
  Dependency,
  ValidationIssue,
} from "./types/index.js";

export { Lifetime, METADATA_KEYS, createToken } from "./types/index.js";

// Error exports
export {
  DependencyError,
  CircularDependencyError,
  UnregisteredServiceError,
  RegistrationError,
  ResolutionError,
  ValidationError,
} from "./errors/index.js";
