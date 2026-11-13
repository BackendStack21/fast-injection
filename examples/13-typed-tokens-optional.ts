#!/usr/bin/env bun
// Example 13: Typed Tokens and Optional Resolution
import { Container, createToken } from "../src/index.js";

interface Config {
  apiUrl: string;
  debug: boolean;
}

interface Logger {
  log(msg: string): void;
}

// createToken<T>() returns a unique symbol typed as InjectionToken<T>
const CONFIG = createToken<Config>("config");
const LOGGER = createToken<Logger>("logger");

console.log("\n=== Example 13: Typed Tokens and Optional Resolution ===\n");

const container = new Container();
container.registerValue(CONFIG, {
  apiUrl: "https://api.example.com",
  debug: true,
});

// No type argument needed: the result is inferred as Config
const config = container.resolve(CONFIG);
console.log("apiUrl:", config.apiUrl);

// tryResolve returns undefined instead of throwing for unregistered tokens
const missing = container.tryResolve(LOGGER);
console.log("Logger registered?", missing !== undefined);

const logger = container.tryResolve(LOGGER) ?? {
  log: (msg: string) => console.log(`[fallback] ${msg}`),
};
logger.log("using the fallback logger");

// Once registered, tryResolve returns the real thing
container.registerValue(LOGGER, {
  log: (msg: string) => console.log(`[logger] ${msg}`),
});
container.tryResolve(LOGGER)?.log("using the registered logger");

// Async variant
const asyncMissing = await container.tryResolveAsync(createToken<number>("nothing"));
console.log("tryResolveAsync for unknown token:", asyncMissing);

// Typed tokens work as optional explicit dependencies too
class Service {
  constructor(
    public config: Config,
    public logger?: Logger,
  ) {}
}
const scope = container.createScope();
scope.register(Service, {
  dependencies: [CONFIG, { token: LOGGER, optional: true }],
});
console.log("Service logger present:", scope.resolve(Service).logger !== undefined);

console.log("\n✅ Example 13 completed!\n");
