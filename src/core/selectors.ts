/**
 * Selectors: read helpers over WorldState. Anything that depends on the current
 * time lives HERE, not in the reducer, and takes `now` (epoch ms) explicitly so
 * replay and scrubbing stay deterministic.
 */

import type { RateLimitStatus, RateLimitWindow } from "./events.ts";
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

/** Below this share of the window remaining, the gauge reads as low. */
export const BUDGET_LOW_FRACTION = 0.15;

/** One window's budget, ready to draw. */
export interface WindowBudget {
  /** Fraction of the window still available, 0-1. */
  readonly fractionLeft: number;
  readonly isLow: boolean;
  /** Milliseconds until the window resets; 0 once the reset time has passed. */
  readonly resetsInMs: number;
}

/** The account's plan budget at a point in time. */
export interface RateLimitBudget {
  readonly status: RateLimitStatus;
  readonly fiveHour: WindowBudget | null;
  readonly sevenDay: WindowBudget | null;
}

function windowBudget(limitWindow: RateLimitWindow | null, now: number): WindowBudget | null {
  if (!limitWindow) return null;
  // Clamped: a malformed reading must not draw a bar wider than its track.
  const fractionLeft = Math.min(1, Math.max(0, 1 - limitWindow.utilization));
  return {
    fractionLeft,
    isLow: fractionLeft < BUDGET_LOW_FRACTION,
    resetsInMs: Math.max(0, limitWindow.resetsAt - now),
  };
}

/**
 * The plan rate-limit budget, resolved against the current time.
 *
 * @param now - epoch ms
 * @returns `null` when no session has reported a budget — permanent for API-key /
 *          Bedrock / Vertex sessions
 */
export function rateLimitBudget(world: WorldState, now: number): RateLimitBudget | null {
  const reading = world.rateLimit;
  if (!reading) return null;
  return {
    status: reading.status,
    fiveHour: windowBudget(reading.fiveHour, now),
    sevenDay: windowBudget(reading.sevenDay, now),
  };
}
