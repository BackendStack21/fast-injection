import type { ServiceDefinition, Token, ValidationIssue } from "../types/index.js";
import { Lifetime } from "../types/index.js";

/**
 * A definition together with the container it would be resolved in.
 *
 * The container matters: a singleton (and everything built underneath it) resolves
 * dependencies from the container that owns the singleton, not from the scope the
 * request started in. `C` is opaque here.
 */
export interface GraphNode<C> {
  definition: ServiceDefinition;
  context: C;
}

/**
 * Finds what a token resolves to when requested from a given container
 */
type Lookup<C> = (context: C, token: Token) => GraphNode<C> | undefined;

/**
 * Set of (definition, context) pairs
 */
class NodeSet<C> {
  private readonly byContext = new Map<C, Set<ServiceDefinition>>();

  has(node: GraphNode<C>): boolean {
    return this.byContext.get(node.context)?.has(node.definition) === true;
  }

  add(node: GraphNode<C>): void {
    let definitions = this.byContext.get(node.context);
    if (definitions === undefined) {
      this.byContext.set(node.context, (definitions = new Set()));
    }
    definitions.add(node.definition);
  }

  delete(node: GraphNode<C>): void {
    this.byContext.get(node.context)?.delete(node.definition);
  }
}

function tokenName(token: Token): string {
  if (typeof token === "function") {
    return token.name || "AnonymousClass";
  }
  return String(token);
}

function formatPath(path: Token[]): string {
  return path.map(tokenName).join(" → ");
}

/**
 * Only constructor registrations declare their dependencies; factories and
 * values are opaque to static analysis.
 */
function isInspectable(definition: ServiceDefinition): boolean {
  return !definition.isFactory && !definition.isAsync && !definition.isValue && typeof definition.target === "function";
}

/**
 * Statically verify a dependency graph: missing dependencies, circular
 * dependencies and captive dependencies. Nothing is instantiated.
 *
 * Starts from `roots` and follows constructor dependencies exactly as resolution
 * would, so services only reachable through a singleton owned by an ancestor
 * container are checked against that ancestor's registrations.
 */
export function validateGraph<C>(roots: GraphNode<C>[], lookup: Lookup<C>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const explored = new NodeSet<C>();
  const active = new NodeSet<C>();
  const trail: GraphNode<C>[] = [];
  const singletons: GraphNode<C>[] = [];
  const reportedMissing = new Map<ServiceDefinition, Set<Token>>();

  // Missing and circular dependencies (depth-first search, each cycle reported once)
  const visit = (node: GraphNode<C>): void => {
    const { definition, context } = node;
    if (!isInspectable(definition) || explored.has(node)) return;

    if (active.has(node)) {
      const start = trail.findIndex((entry) => entry.definition === definition && entry.context === context);
      const cycle = trail.slice(start).map((entry) => entry.definition.token);
      cycle.push(definition.token);
      issues.push({
        type: "circular",
        token: definition.token,
        path: cycle,
        message: `Circular dependency: ${formatPath(cycle)}`,
      });
      return;
    }

    active.add(node);
    trail.push(node);
    const { dependencies, optional } = definition;
    for (let i = 0; i < dependencies.length; i++) {
      const dependency = dependencies[i] as Token;
      const next = lookup(context, dependency);
      if (next !== undefined) {
        visit(next);
        continue;
      }
      if (optional?.[i] === true) continue;

      let reported = reportedMissing.get(definition);
      if (reported === undefined) {
        reportedMissing.set(definition, (reported = new Set()));
      }
      if (reported.has(dependency)) continue;
      reported.add(dependency);
      issues.push({
        type: "missing",
        token: definition.token,
        path: [definition.token, dependency],
        message: `${tokenName(definition.token)} depends on ${tokenName(dependency)}, which is not registered`,
      });
    }
    trail.pop();
    active.delete(node);
    explored.add(node);
    if (definition.lifetime === Lifetime.Singleton) {
      singletons.push(node);
    }
  };

  for (const root of roots) {
    visit(root);
  }

  // Captive dependencies: a singleton reaching a scoped service, directly or
  // through transients, would keep one scoped instance alive forever.
  for (const singleton of singletons) {
    const seen = new Set<ServiceDefinition>([singleton.definition]);
    const walk = (current: GraphNode<C>, path: Token[]): void => {
      for (const dependency of current.definition.dependencies) {
        const next = lookup(current.context, dependency);
        if (next === undefined || seen.has(next.definition)) continue;
        seen.add(next.definition);

        const nextPath = [...path, dependency];
        if (next.definition.lifetime === Lifetime.Scoped) {
          issues.push({
            type: "captive",
            token: singleton.definition.token,
            path: nextPath,
            message: `Singleton ${tokenName(singleton.definition.token)} captures scoped service ${tokenName(dependency)} (${formatPath(nextPath)})`,
          });
        } else if (next.definition.lifetime === Lifetime.Transient && isInspectable(next.definition)) {
          walk(next, nextPath);
        }
      }
    };
    walk(singleton, [singleton.definition.token]);
  }

  return issues;
}
