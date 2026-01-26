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
} from "./types/index.js";

export { Lifetime, METADATA_KEYS } from "./types/index.js";

// Error exports
export {
  DependencyError,
  CircularDependencyError,
  UnregisteredServiceError,
  RegistrationError,
  ResolutionError,
} from "./errors/index.js";
