/**
 * The agent-class registry: collects the per-class policy modules and exposes
 * the three lookups the rest of the app uses. A data structure, not a switch —
 * adding a class is a new module plus one line here.
 */

import { evaluateBashPolicy } from "./bash-guard.ts";
import { builder } from "./builder.ts";
import { keeper } from "./keeper.ts";
import type { AgentClassPolicy, BashVerdict } from "./policy.ts";
import { reviewer } from "./reviewer.ts";
import { runner } from "./runner.ts";
import { scout } from "./scout.ts";

/** Every known class, in display order. */
const CLASS_POLICIES: readonly AgentClassPolicy[] = [scout, builder, reviewer, runner, keeper];

const BY_NAME: ReadonlyMap<string, AgentClassPolicy> = new Map(
  CLASS_POLICIES.map((p) => [p.name, p]),
);

/**
 * The known class names, in display order.
 *
 * @returns the class names (a fresh array)
 */
export function knownClasses(): string[] {
  return CLASS_POLICIES.map((p) => p.name);
}

/**
 * The built-in tools a class may use — the hard cap passed to `query()`.
 *
 * @param agentClass - the class name
 * @returns the tool allow-list (a fresh array), or `undefined` for an unknown
 *          class, meaning "no restriction" (the caller decides if that is safe)
 */
export function toolsForClass(agentClass: string): string[] | undefined {
  const policy = BY_NAME.get(agentClass);
  return policy ? [...policy.tools] : undefined;
}

/**
 * May this class run this shell command? Enforced at `canUseTool` time (see
 * `agent/session.ts`) — the same mechanism as the encounter screen, automatic.
 *
 * @param agentClass - the class name
 * @param command    - the raw shell command
 * @returns `{ ok: true }` for any class with no Bash policy (Builder, or an
 *          unknown class), otherwise the policy's verdict
 */
export function bashCommandAllowed(agentClass: string, command: string): BashVerdict {
  const policy = BY_NAME.get(agentClass);
  if (!policy?.bash) return { ok: true };
  return evaluateBashPolicy(policy.bash, command);
}
