/**
 * The event log schema.
 *
 * An event is one line of the append-only NDJSON log that the agent side writes
 * to disk. The reducer (see `reducer.ts`) is the ONLY consumer that turns these
 * into world state, and it does so purely — so everything the map needs to be
 * rebuilt later must be captured here, in the event, at write time.
 *
 * Rules baked into this file:
 *  - `source` is present on every event from day one (attach-mode + repo/CI
 *    events later reuse the same pipeline).
 *  - `ts` is stamped by the writer (agent side), never read by the reducer as
 *    wall-clock. The reducer may store it; time-dependent *decisions* live in
 *    selectors that take `now` explicitly.
 *  - `seq` is a monotonic per-log counter, and de-dup is keyed off it
 *    PER AGENT — never a single world-global counter, since two agents write
 *    two logs that both start at seq 1.
 */

export const SCHEMA_VERSION = 1 as const;

/** Where an event originated. Only `agent` exists in Phase 0; the rest are
 *  wired through the same reducer so adding them later is data, not plumbing. */
export type EventSource = "agent" | "repo" | "system" | "user";

/** The rooms that exist in Phase 0. `route` is not a room — it is the default
 *  "between rooms / thinking / idle" location a sprite occupies when no tool
 *  places it somewhere specific. */
export type Room = "library" | "forge" | "gym" | "center";
export type Location = Room | "route";

interface EventBase {
  v: typeof SCHEMA_VERSION;
  /** Monotonic per-log sequence, assigned by the writer. De-dup keys off this
   *  per agent (see the file header). */
  seq: number;
  /** ISO-8601, stamped by the writer. Never used as `now` by the reducer. */
  ts: string;
  source: EventSource;
  /** PokeHub's stable id for the sprite. Survives session restarts. */
  agentId: string;
  /** Claude Code's own session id, once known. */
  sessionId: string | null;
}

/** A roster agent (or one-off) has been created as a process we supervise. */
export interface AgentSpawnedEvent extends EventBase {
  kind: "agent.spawned";
  name: string;
  /** Class from the agent definition. A hard tool restriction, enforced before
   *  the model sees the option (see `classes.ts` + `session.ts`), not a costume. */
  agentClass: string;
  cwd: string;
}

/** The claude process reported its session id (stream-json `system/init`). */
export interface SessionStartedEvent extends EventBase {
  kind: "agent.session_started";
  sessionId: string;
}

/** A user turn was handed to the session — the initial task, or a follow-up
 *  typed into the composer for a live or idle agent. Recorded so the composer's
 *  full history and the journal are rebuildable from the log alone
 *  (VISION decision #3). `source` is `"user"`. */
export interface AgentPromptEvent extends EventBase {
  kind: "agent.prompt";
  /** The user's message for this turn, verbatim. */
  text: string;
}

/** One `query()` turn ended cleanly and the session can still be resumed — the
 *  agent is idle, awaiting a follow-up, NOT gone. `agent.exited` is reserved for
 *  a session that ended abnormally or was stopped. */
export interface AgentTurnFinishedEvent extends EventBase {
  kind: "agent.turn_finished";
}

/** The model started a tool call. Drives the walk to a room. */
export interface ToolStartedEvent extends EventBase {
  kind: "tool.started";
  toolCallId: string;
  tool: string;
  /** Raw tool input, as emitted. Kept whole so classification can improve
   *  later without a schema change. */
  input: Record<string, unknown>;
}

/** A tool call finished (result or error). */
export interface ToolFinishedEvent extends EventBase {
  kind: "tool.finished";
  toolCallId: string;
  /** The tool name is often not on the result frame; the reducer pairs by
   *  `toolCallId` and does not need it. Present when the writer knows it. */
  tool?: string;
  ok: boolean;
  /** Short human summary for the journal, e.g. "+42 / -7". Optional. */
  summary?: string;
}

/** The model is producing extended-thinking reasoning, no tool in flight. The
 *  bubble-sized summary is all that is kept — the full reasoning is never
 *  written to the log. Visible assistant prose is a separate `agent.message`. */
export interface AgentThinkingEvent extends EventBase {
  kind: "agent.thinking";
  /** One-line thought bubble, if there is text to show. */
  thought?: string;
  /** `reasoning` = an extended-thinking block, the only value emitted now.
   *  `prose` is legacy — visible prose is its own `agent.message` event; old
   *  logs may still carry an `agent.thinking` with this channel. */
  channel?: "reasoning" | "prose";
}

/** One complete block of visible assistant prose — the agent's actual reply,
 *  verbatim. Captured so a multi-turn conversation can be read back in the focus
 *  view and the journal (finding #2 from the Phase 0 pass test); the reducer
 *  also derives the one-line thought bubble from it. Extended-thinking blocks
 *  are NOT carried here — that stays in `agent.thinking`. */
export interface AgentMessageEvent extends EventBase {
  kind: "agent.message";
  /** The assistant's text for this block, verbatim. */
  text: string;
}

/** Auto-compaction ran (stream-json `system/compact_boundary`). Carried now so
 *  the HP bar can be "a real automatic event" later without a new pipeline. */
export interface SessionCompactedEvent extends EventBase {
  kind: "session.compacted";
  trigger?: string;
}

/** A `canUseTool` request is pending — the agent is paused on the user. */
export interface PermissionRequestedEvent extends EventBase {
  kind: "permission.requested";
  toolCallId: string;
  tool: string;
  input: Record<string, unknown>;
}

/** The user answered a `canUseTool` request. */
export interface PermissionResolvedEvent extends EventBase {
  kind: "permission.resolved";
  toolCallId: string;
  decision: "allow_once" | "allow_always" | "refuse";
}

/** The claude process / session ended. */
export interface AgentExitedEvent extends EventBase {
  kind: "agent.exited";
  code: number | null;
  /** The SDK result subtype when it ended abnormally, e.g. `error_max_turns`,
   *  `error_max_budget_usd`. Absent on a clean finish. */
  reason?: string;
}

export type PokeHubEvent =
  | AgentSpawnedEvent
  | SessionStartedEvent
  | AgentPromptEvent
  | AgentTurnFinishedEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | AgentThinkingEvent
  | AgentMessageEvent
  | SessionCompactedEvent
  | PermissionRequestedEvent
  | PermissionResolvedEvent
  | AgentExitedEvent;

export type EventKind = PokeHubEvent["kind"];
