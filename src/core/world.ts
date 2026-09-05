/**
 * World state: the projection the renderer draws. Produced only by the reducer,
 * only from events. Never mutated from the renderer (that breaks replay).
 *
 * Every type here is deeply `readonly`. The reducer builds new objects and
 * arrays for each change; the compiler enforces that it never mutates in place.
 */

import { SCHEMA_VERSION, type Location, type ToolInput } from "./events.ts";

/** Glance-level status. Phase 0 covers the states that fall straight out of the
 *  event stream with zero inference (VISION "Stuck agents" table). `stalled` and
 *  `looping` are deferred to selectors + reducer rules and are not set here. */
export type AgentStatus =
  | "spawning" // process created, no session yet
  | "thinking" // model producing text/reasoning, no tool in flight
  | "working" // one or more tool calls are in flight
  | "blocked" // a canUseTool request is pending on the user
  | "erroring" // last tool result was an error
  | "idle" // a turn finished cleanly; session resumable, awaiting a follow-up
  | "exited";

export interface ActiveTool {
  readonly toolCallId: string;
  readonly tool: string;
}

/** A tool call the agent has made, kept after it finishes so the focus view can
 *  show recent activity instead of a slot that blinks for a millisecond between
 *  `tool.started` and `tool.finished`. Also the seed for the journal. */
export interface RecentTool {
  readonly toolCallId: string;
  readonly tool: string;
  /** Short "what it touched" label (filename / pattern / command head). */
  readonly target: string | null;
  /** `null` while in flight, then the `tool.finished` outcome. */
  readonly ok: boolean | null;
}

/** How many recent tool calls `AgentState.recentTools` keeps. Older ones are
 *  still in the log; this is just the focus-view strip. */
export const RECENT_TOOLS_LIMIT = 8;

/** One tool call in the journal — the unbounded, grouped-by-turn record of
 *  everything an agent has touched (VISION "Legibility features"). Shares
 *  `toolCallId`/`tool`/`target`/`ok` with `RecentTool` (both are populated
 *  from the same `tool.started`/`tool.finished` events) so the two can't
 *  quietly drift apart on type; the journal adds which turn it happened in,
 *  a read/write/other classification (files read vs. modified must be
 *  visually distinct, not just labelled), and the `+N / -M`-style summary
 *  from `tool.finished`. Unlike `recentTools` this is never capped — it's
 *  the record you scroll back through, not a glance-level strip. */
export interface JournalEntry extends Pick<RecentTool, "toolCallId" | "tool" | "target" | "ok"> {
  readonly kind: "read" | "write" | "other";
  /** `tool.finished`'s human summary (e.g. "+42 / -7", "3 matches"), if any. */
  readonly summary: string | null;
  /** `promptCount` at the time this call started — which user turn it belongs to. */
  readonly turn: number;
}

export interface PendingPermission {
  readonly toolCallId: string;
  readonly tool: string;
  readonly input: ToolInput;
}

/** One turn of the human-readable conversation with an agent. `user` entries
 *  come from `agent.prompt`, `assistant` entries from `agent.message`. Rebuilt
 *  from the log, never a second source of truth — it drives the focus view. */
export interface TranscriptEntry {
  /** seq of the event this entry came from. Stable React key; also the order. */
  readonly seq: number;
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** Newest `TRANSCRIPT_LIMIT` turns are kept on `AgentState`; older turns stay in
 *  the log and are recoverable by replay. Bounds world-state growth on a long
 *  session without touching the source of truth. */
export const TRANSCRIPT_LIMIT = 100;

export interface AgentState {
  readonly id: string;
  readonly name: string;
  readonly agentClass: string;
  readonly cwd: string;
  readonly sessionId: string | null;
  readonly location: Location;
  readonly status: AgentStatus;
  readonly thought: string | null;
  /** Every tool call currently in flight, oldest first. Claude emits several
   *  `tool_use` blocks per turn that run concurrently, so this is a list, not
   *  a single slot. `status` is `working` while it is non-empty. */
  readonly activeTools: readonly ActiveTool[];
  /** Recent tool calls, oldest first, capped at `RECENT_TOOLS_LIMIT` — survives
   *  a tool finishing so the focus view shows a stable activity trail. */
  readonly recentTools: readonly RecentTool[];
  /** Every tool call this agent has made, oldest first, uncapped. The journal. */
  readonly journal: readonly JournalEntry[];
  /** canUseTool asks awaiting the user, oldest first. */
  readonly pendingPermissions: readonly PendingPermission[];
  /** toolCallIds the user (or a class rule) refused. The SDK still feeds the
   *  model an error tool_result for these, which arrives as `tool.finished`
   *  with `ok: false` — but a deliberate refusal is not an `erroring` agent, so
   *  the reducer consults this to settle the status calmly. Cleared per id when
   *  that result lands. */
  readonly refusedToolCallIds: readonly string[];
  readonly exitCode: number | null;
  /** Why the session ended abnormally (SDK result subtype), if it did. */
  readonly exitReason: string | null;
  /** User turns handed to this agent so far (initial task + every follow-up).
   *  Honest flavour for the focus view; derived from the log, never a second
   *  source of truth. */
  readonly promptCount: number;
  /** The conversation so far, oldest first, capped at `TRANSCRIPT_LIMIT`. */
  readonly transcript: readonly TranscriptEntry[];
  /** How many turns have fallen off the front of `transcript` (still in the
   *  log). 0 until the cap is actually exceeded — the focus view shows this
   *  count rather than guessing from `transcript.length`. */
  readonly transcriptDropped: number;
  /** ts of the last event applied to this agent. Stored for selectors; the
   *  reducer never compares it to wall-clock. */
  readonly lastEventTs: string | null;
  /** Highest seq applied to THIS agent. The de-dup key (per agent, not global). */
  readonly lastSeq: number;
}

export interface WorldState {
  readonly schemaVersion: number;
  readonly agents: Readonly<Record<string, AgentState>>;
  /** Highest seq seen across all agents. Display/debug only — NOT a de-dup key
   *  (each agent's log has its own seq space). */
  readonly maxSeqSeen: number;
}

/**
 * The empty world — the starting point for replay and for a fresh session.
 *
 * @returns a new `WorldState` with no agents and `maxSeqSeen` 0
 */
export function initialWorld(): WorldState {
  return { schemaVersion: SCHEMA_VERSION, agents: {}, maxSeqSeen: 0 };
}
