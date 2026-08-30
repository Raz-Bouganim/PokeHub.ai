/**
 * The pure reducer: (WorldState, PokeHubEvent) -> WorldState.
 *
 * Non-negotiable (CLAUDE.md / VISION):
 *  - No side effects. No `Date.now()`. No Pixi. No I/O.
 *  - Deterministic: replaying the same log always yields the same state.
 *  - Time-dependent decisions (stalled, "sits down to think") do NOT live here.
 *    They live in selectors that take `now` as an argument.
 *
 * The reducer returns a new WorldState; it never mutates its input. It is
 * tolerant of events it does not recognise (returns state unchanged) so that
 * repo/CI/system events added later cannot crash replay of old logs.
 */

import type { PokeHubEvent } from "./events.ts";
import { roomForTool } from "./rooms.ts";
import type { AgentState, WorldState } from "./world.ts";

function blankAgent(id: string): AgentState {
  return {
    id,
    name: id,
    agentClass: "unknown",
    cwd: "",
    sessionId: null,
    location: "route",
    status: "spawning",
    thought: null,
    activeTools: [],
    pendingPermissions: [],
    refusedToolCallIds: [],
    exitCode: null,
    exitReason: null,
    promptCount: 0,
    lastEventTs: null,
    lastSeq: 0,
  };
}

export function reduce(state: WorldState, event: PokeHubEvent): WorldState {
  const prev = state.agents[event.agentId] ?? blankAgent(event.agentId);

  // Idempotent replay. De-dup keys off the PER-AGENT counter, never a single
  // world-global one — two agents write two logs that both start at seq 1, so
  // a global gate silently drops the second agent's whole stream.
  if (event.seq <= prev.lastSeq) return state;

  const agent = applyToAgent(prev, event);

  return {
    ...state,
    maxSeqSeen: Math.max(state.maxSeqSeen, event.seq),
    agents: { ...state.agents, [event.agentId]: agent },
  };
}

function applyToAgent(prev: AgentState, event: PokeHubEvent): AgentState {
  const base: AgentState = {
    ...prev,
    lastEventTs: event.ts,
    lastSeq: event.seq,
    sessionId: event.sessionId ?? prev.sessionId,
  };

  // A finished agent stays finished. Late, duplicated or out-of-order frames
  // (snapshot + live overlap, a tool result racing the exit) must not revive it
  // as `thinking` or `erroring` — only the seq/ts bump in `base` passes through.
  if (prev.status === "exited") return base;

  switch (event.kind) {
    case "agent.spawned":
      return {
        ...base,
        name: event.name,
        agentClass: event.agentClass,
        cwd: event.cwd,
        status: "spawning",
        location: "route",
      };

    case "agent.session_started":
      return { ...base, sessionId: event.sessionId };

    case "agent.prompt": {
      // A follow-up turn: revive an idle sprite and count the turn. The `exited`
      // guard above already blocks prompts to a finished agent. Don't downgrade
      // status while the session still shows work in flight (a prompt landing
      // out of order on replay) or before it exists ("spawning").
      const midTurn =
        base.activeTools.length > 0 || base.pendingPermissions.length > 0;
      return {
        ...base,
        promptCount: base.promptCount + 1,
        status:
          midTurn || prev.status === "spawning" ? prev.status : "thinking",
        thought: null,
        exitReason: null,
      };
    }

    case "agent.turn_finished":
      // The turn is done but the session is resumable — idle, not gone. Keep
      // `thought` so the last thing it said stays in the bubble while it waits.
      return {
        ...base,
        status: "idle",
        location: "route",
        activeTools: [],
        pendingPermissions: [],
        refusedToolCallIds: [],
      };

    case "tool.started": {
      const room = roomForTool(event.tool, event.input);
      const alreadyActive = base.activeTools.some(
        (t) => t.toolCallId === event.toolCallId,
      );
      return {
        ...base,
        status: "working",
        activeTools: alreadyActive
          ? base.activeTools
          : [...base.activeTools, { toolCallId: event.toolCallId, tool: event.tool }],
        // Location follows the most recently started tool.
        location: room ?? base.location,
        thought: null,
      };
    }

    case "tool.finished": {
      const activeTools = base.activeTools.filter(
        (t) => t.toolCallId !== event.toolCallId,
      );
      // A refused call comes back `ok: false` (the SDK feeds the model an error
      // result), but the user chose that — it is not an erroring agent. Settle
      // it like a success and forget the id.
      const wasRefused = base.refusedToolCallIds.includes(event.toolCallId);
      const settledOk = event.ok || wasRefused;
      return {
        ...base,
        activeTools,
        refusedToolCallIds: wasRefused
          ? base.refusedToolCallIds.filter((id) => id !== event.toolCallId)
          : base.refusedToolCallIds,
        // Still working while any other tool is in flight; only the last one
        // finishing settles the status.
        status:
          activeTools.length > 0 ? "working" : settledOk ? "thinking" : "erroring",
      };
    }

    case "agent.thinking":
      return {
        ...base,
        status:
          base.activeTools.length > 0
            ? base.status
            : base.status === "blocked"
              ? "blocked"
              : "thinking",
        thought: event.thought ?? base.thought,
      };

    case "session.compacted":
      // Recorded for later (the HP bar wants a real compaction event). No
      // world-state change beyond the seq/ts bump in `base`.
      return base;

    case "permission.requested": {
      const alreadyPending = base.pendingPermissions.some(
        (p) => p.toolCallId === event.toolCallId,
      );
      return {
        ...base,
        status: "blocked",
        pendingPermissions: alreadyPending
          ? base.pendingPermissions
          : [
              ...base.pendingPermissions,
              {
                toolCallId: event.toolCallId,
                tool: event.tool,
                input: event.input,
              },
            ],
      };
    }

    case "permission.resolved": {
      const pendingPermissions = base.pendingPermissions.filter(
        (p) => p.toolCallId !== event.toolCallId,
      );
      const unblocked =
        base.status === "blocked" && pendingPermissions.length === 0;
      return {
        ...base,
        pendingPermissions,
        // Remember a refusal so the error tool_result the SDK sends next does
        // not read as an erroring agent (see `tool.finished`).
        refusedToolCallIds:
          event.decision === "refuse" &&
          !base.refusedToolCallIds.includes(event.toolCallId)
            ? [...base.refusedToolCallIds, event.toolCallId]
            : base.refusedToolCallIds,
        status: unblocked
          ? base.activeTools.length > 0
            ? "working"
            : "thinking"
          : base.status,
      };
    }

    case "agent.exited":
      return {
        ...base,
        status: "exited",
        exitCode: event.code,
        exitReason: event.reason ?? null,
        activeTools: [],
        pendingPermissions: [],
        refusedToolCallIds: [],
        location: "route",
      };

    default: {
      // Unknown event kind (a future source). Leave agent state untouched but
      // keep the seq/ts bump so replay stays monotonic and idempotent.
      return base;
    }
  }
}

/** Fold a whole log into a world. Convenience for replay and tests. */
export function replay(
  events: Iterable<PokeHubEvent>,
  from: WorldState,
): WorldState {
  let state = from;
  for (const event of events) state = reduce(state, event);
  return state;
}
