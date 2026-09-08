/**
 * Selectors: read helpers over WorldState. Anything that depends on the current
 * time lives HERE, not in the reducer, and takes `now` (epoch ms) explicitly so
 * replay and scrubbing stay deterministic.
 */

import type { AgentState, WorldState } from "./world.ts";

/** Claude Code's own background-agent stall timer: 10 min, reset on every
 *  streaming progress event. We copy the number rather than invent one. */
export const STALL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Every agent in the world, in insertion order.
 *
 * @param world - the world state
 * @returns the agents as an array (a fresh array; the agents themselves are the
 *          same readonly objects held in `world`)
 */
export function agentList(world: WorldState): AgentState[] {
  return Object.values(world.agents);
}

/**
 * Whether an agent is "stalled": mid-work but no event has advanced it inside
 * the stall window. Distinct from a long think (which still emits progress) —
 * but in Phase 0 every event is progress, so this is a coarse first cut.
 *
 * @param agent - the agent to check
 * @param now   - the current time, epoch ms (passed in so the reducer/replay
 *                stay deterministic — never read the clock here)
 * @returns true if the agent looks stalled at time `now`
 */
export function isStalled(agent: AgentState, now: number): boolean {
  if (agent.status !== "working" && agent.status !== "thinking") return false;
  if (agent.lastEventTs === null) return false;
  const last = Date.parse(agent.lastEventTs);
  if (Number.isNaN(last)) return false;
  return now - last > STALL_TIMEOUT_MS;
}

/**
 * Agents that need the user right now: blocked or erroring. The most valuable
 * glance-level fact (VISION).
 *
 * @param world - the world state
 * @returns the subset of agents awaiting attention (a fresh array)
 */
export function needsAttention(world: WorldState): AgentState[] {
  return agentList(world).filter((a) => a.status === "blocked" || a.status === "erroring");
}

/**
 * The subagents tethered to a given parent — the ones the renderer draws a
 * tether line to and offsets toward the parent. One level only: a subagent's
 * own subagents tether to the session root.
 *
 * @param world    - the world state
 * @param parentId - the dispatching agent's id
 * @returns its subagents, in insertion order (a fresh array)
 */
export function subagentsOf(world: WorldState, parentId: string): AgentState[] {
  return agentList(world).filter((a) => a.parentAgentId === parentId);
}
