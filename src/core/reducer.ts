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
import { bubbleLine, toolKind, toolTarget } from "./text.ts";
import {
  RECENT_TOOLS_LIMIT,
  TRANSCRIPT_LIMIT,
  type AgentState,
  type JournalEntry,
  type RecentTool,
  type TranscriptEntry,
  type WorldState,
} from "./world.ts";

/** Append a turn to the capped transcript. Pure. Returns the new array and how
 *  many turns fell off the front (0 or 1) so the focus view can honestly say
 *  "N earlier turns are in the log" — an equality with the cap would lie at
 *  exactly `TRANSCRIPT_LIMIT` turns, when nothing has been dropped yet. */
function withTurn(
  transcript: readonly TranscriptEntry[],
  entry: TranscriptEntry,
): { transcript: TranscriptEntry[]; dropped: number } {
  const next = [...transcript, entry];
  if (next.length <= TRANSCRIPT_LIMIT) return { transcript: next, dropped: 0 };
  return {
    transcript: next.slice(next.length - TRANSCRIPT_LIMIT),
    dropped: next.length - TRANSCRIPT_LIMIT,
  };
}

/** Append a finished-or-in-flight tool call to the capped recent-tools trail. */
function withRecentTool(recentTools: readonly RecentTool[], entry: RecentTool): RecentTool[] {
  const next = [...recentTools, entry];
  return next.length > RECENT_TOOLS_LIMIT ? next.slice(next.length - RECENT_TOOLS_LIMIT) : next;
}

/** Fold a new transcript entry into an agent's `transcript` + `transcriptDropped`. */
function recordTurn(base: AgentState, entry: TranscriptEntry): Partial<AgentState> {
  const { transcript, dropped } = withTurn(base.transcript, entry);
  return { transcript, transcriptDropped: base.transcriptDropped + dropped };
}

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
    recentTools: [],
    journal: [],
    pendingPermissions: [],
    refusedToolCallIds: [],
    exitCode: null,
    exitReason: null,
    promptCount: 0,
    transcript: [],
    transcriptDropped: 0,
    lastEventTs: null,
    lastSeq: 0,
  };
}

/**
 * Fold one event into the world. Pure and idempotent: replaying an event whose
 * `seq` was already applied to its agent returns `state` unchanged (by
 * reference), which the live feed uses to skip redundant re-renders.
 *
 * @param state - the world state to fold onto (never mutated)
 * @param event - the event to apply
 * @returns the resulting world state — the same `state` reference when the
 *          event was a duplicate or changed nothing, otherwise a new object
 */
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
      const midTurn = base.activeTools.length > 0 || base.pendingPermissions.length > 0;
      return {
        ...base,
        ...recordTurn(base, { seq: event.seq, role: "user", text: event.text }),
        promptCount: base.promptCount + 1,
        status: midTurn || prev.status === "spawning" ? prev.status : "thinking",
        thought: null,
        exitReason: null,
      };
    }

    case "agent.message": {
      // The agent's full reply. Capture it in the transcript AND drive the
      // one-line thought bubble from it (translate no longer emits a separate
      // prose `agent.thinking`). Same status caution as `agent.thinking`: a
      // tool in flight or a pending ask outranks "the model is talking".
      const talking = base.activeTools.length === 0 && base.status !== "blocked";
      return {
        ...base,
        ...recordTurn(base, {
          seq: event.seq,
          role: "assistant",
          text: event.text,
        }),
        status: talking ? "thinking" : base.status,
        // Only let the reply into the bubble when it's actually the headline. A
        // tool in flight already owns the bubble (`tool.started` blanked it);
        // don't shove interim prose over the running "Bash".
        thought: talking ? bubbleLine(event.text) : base.thought,
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
      const alreadyActive = base.activeTools.some((t) => t.toolCallId === event.toolCallId);
      // A re-delivered start (snapshot + live overlap) for a call already in the
      // trail — even one that has since finished — must not add a second row.
      const alreadyTrailed = base.recentTools.some((t) => t.toolCallId === event.toolCallId);
      const alreadyJournaled = base.journal.some((j) => j.toolCallId === event.toolCallId);
      const target = toolTarget(event.tool, event.input);
      const journalEntry: JournalEntry = {
        toolCallId: event.toolCallId,
        tool: event.tool,
        kind: toolKind(event.tool),
        target,
        ok: null,
        summary: null,
        turn: base.promptCount,
      };
      return {
        ...base,
        status: "working",
        activeTools: alreadyActive
          ? base.activeTools
          : [...base.activeTools, { toolCallId: event.toolCallId, tool: event.tool }],
        recentTools: alreadyTrailed
          ? base.recentTools
          : withRecentTool(base.recentTools, {
              toolCallId: event.toolCallId,
              tool: event.tool,
              target,
              ok: null,
            }),
        journal: alreadyJournaled ? base.journal : [...base.journal, journalEntry],
        // Location follows the most recently started tool.
        location: room ?? base.location,
        thought: null,
      };
    }

    case "tool.finished": {
      const activeTools = base.activeTools.filter((t) => t.toolCallId !== event.toolCallId);
      // A refused call comes back `ok: false` (the SDK feeds the model an error
      // result), but the user chose that — it is not an erroring agent. Settle
      // it like a success and forget the id.
      const wasRefused = base.refusedToolCallIds.includes(event.toolCallId);
      const settledOk = event.ok || wasRefused;
      return {
        ...base,
        activeTools,
        // Record the outcome on the matching recent-tools entry (it may already
        // have been evicted by the cap — then this is a no-op). Use `settledOk`,
        // not the raw `event.ok` — a refused call comes back `ok: false` from
        // the SDK, and showing it as a failure (✕, red) in a trail the user
        // can't dismiss would contradict the agent's own status for the exact
        // same event.
        recentTools: base.recentTools.some((t) => t.toolCallId === event.toolCallId)
          ? base.recentTools.map((t) =>
              t.toolCallId === event.toolCallId ? { ...t, ok: settledOk } : t,
            )
          : base.recentTools,
        // Never evicted (uncapped), but tolerate a result with no matching
        // start (e.g. replay beginning mid-log) as a no-op rather than crash.
        journal: base.journal.some((j) => j.toolCallId === event.toolCallId)
          ? base.journal.map((j) =>
              j.toolCallId === event.toolCallId
                ? { ...j, ok: settledOk, summary: event.summary ?? j.summary }
                : j,
            )
          : base.journal,
        refusedToolCallIds: wasRefused
          ? base.refusedToolCallIds.filter((id) => id !== event.toolCallId)
          : base.refusedToolCallIds,
        // Still working while any other tool is in flight; only the last one
        // finishing settles the status.
        status: activeTools.length > 0 ? "working" : settledOk ? "thinking" : "erroring",
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
      const alreadyPending = base.pendingPermissions.some((p) => p.toolCallId === event.toolCallId);
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
      const unblocked = base.status === "blocked" && pendingPermissions.length === 0;
      return {
        ...base,
        pendingPermissions,
        // Remember a refusal so the error tool_result the SDK sends next does
        // not read as an erroring agent (see `tool.finished`).
        refusedToolCallIds:
          event.decision === "refuse" && !base.refusedToolCallIds.includes(event.toolCallId)
            ? [...base.refusedToolCallIds, event.toolCallId]
            : base.refusedToolCallIds,
        status: unblocked ? (base.activeTools.length > 0 ? "working" : "thinking") : base.status,
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

/**
 * Fold a whole log into a world in one call. Convenience for replay and tests.
 *
 * @param events - the events to fold, oldest first
 * @param from   - the world state to start from (typically `initialWorld()`)
 * @returns the world state after applying every event
 */
export function replay(events: Iterable<PokeHubEvent>, from: WorldState): WorldState {
  let state = from;
  for (const event of events) state = reduce(state, event);
  return state;
}
