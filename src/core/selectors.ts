/**
 * Selectors: read helpers over WorldState. Anything that depends on the current
 * time lives HERE, not in the reducer, and takes `now` (epoch ms) explicitly so
 * replay and scrubbing stay deterministic.
 */

import type { AgentState, WorldState } from "./world.ts";

/** Claude Code's own background-agent stall timer: 10 min, reset on every
 *  streaming progress event. We copy the number rather than invent one. */
export const STALL_TIMEOUT_MS = 10 * 60 * 1000;

export function agentList(world: WorldState): AgentState[] {
  return Object.values(world.agents);
}

/**
 * An agent is "stalled" when it is mid-work but no event has advanced it inside
 * the stall window. Distinct from a long think (which still emits progress) —
 * but in Phase 0 every event is progress, so this is a coarse first cut.
 */
export function isStalled(agent: AgentState, now: number): boolean {
  if (agent.status !== "working" && agent.status !== "thinking") return false;
  if (agent.lastEventTs === null) return false;
  const last = Date.parse(agent.lastEventTs);
  if (Number.isNaN(last)) return false;
  return now - last > STALL_TIMEOUT_MS;
}

/** Agents that need the user right now: blocked or erroring. The most valuable
 *  glance-level fact (VISION). */
export function needsAttention(world: WorldState): AgentState[] {
  return agentList(world).filter((a) => a.status === "blocked" || a.status === "erroring");
}
