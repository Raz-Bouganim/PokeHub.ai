/**
 * World state: the projection the renderer draws. Produced only by the reducer,
 * only from events. Never mutated from the renderer (that breaks replay).
 */

import { SCHEMA_VERSION, type Location } from "./events.ts";

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
  toolCallId: string;
  tool: string;
}

/** A tool call the agent has made, kept after it finishes so the focus view can
 *  show recent activity instead of a slot that blinks for a millisecond between
 *  `tool.started` and `tool.finished`. Also the seed for the journal. */
export interface RecentTool {
  toolCallId: string;
  tool: string;
  /** Short "what it touched" label (filename / pattern / command head). */
  target: string | null;
  /** `null` while in flight, then the `tool.finished` outcome. */
  ok: boolean | null;
}

/** How many recent tool calls `AgentState.recentTools` keeps. Older ones are
 *  still in the log; this is just the focus-view strip. */
export const RECENT_TOOLS_LIMIT = 8;

export interface PendingPermission {
  toolCallId: string;
  tool: string;
  input: Record<string, unknown>;
}

/** One turn of the human-readable conversation with an agent. `user` entries
 *  come from `agent.prompt`, `assistant` entries from `agent.message`. Rebuilt
 *  from the log, never a second source of truth — it drives the focus view. */
export interface TranscriptEntry {
  /** seq of the event this entry came from. Stable React key; also the order. */
  seq: number;
  role: "user" | "assistant";
  text: string;
}

/** Newest `TRANSCRIPT_LIMIT` turns are kept on `AgentState`; older turns stay in
 *  the log and are recoverable by replay. Bounds world-state growth on a long
 *  session without touching the source of truth. */
export const TRANSCRIPT_LIMIT = 100;

export interface AgentState {
  id: string;
  name: string;
  agentClass: string;
  cwd: string;
  sessionId: string | null;
  location: Location;
  status: AgentStatus;
  thought: string | null;
  /** Every tool call currently in flight, oldest first. Claude emits several
   *  `tool_use` blocks per turn that run concurrently, so this is a list, not
   *  a single slot. `status` is `working` while it is non-empty. */
  activeTools: ActiveTool[];
  /** Recent tool calls, oldest first, capped at `RECENT_TOOLS_LIMIT` — survives
   *  a tool finishing so the focus view shows a stable activity trail. */
  recentTools: RecentTool[];
  /** canUseTool asks awaiting the user, oldest first. */
  pendingPermissions: PendingPermission[];
  /** toolCallIds the user (or a class rule) refused. The SDK still feeds the
   *  model an error tool_result for these, which arrives as `tool.finished`
   *  with `ok: false` — but a deliberate refusal is not an `erroring` agent, so
   *  the reducer consults this to settle the status calmly. Cleared per id when
   *  that result lands. */
  refusedToolCallIds: string[];
  exitCode: number | null;
  /** Why the session ended abnormally (SDK result subtype), if it did. */
  exitReason: string | null;
  /** User turns handed to this agent so far (initial task + every follow-up).
   *  Honest flavour for the focus view; derived from the log, never a second
   *  source of truth. */
  promptCount: number;
  /** The conversation so far, oldest first, capped at `TRANSCRIPT_LIMIT`. */
  transcript: TranscriptEntry[];
  /** How many turns have fallen off the front of `transcript` (still in the
   *  log). 0 until the cap is actually exceeded — the focus view shows this
   *  count rather than guessing from `transcript.length`. */
  transcriptDropped: number;
  /** ts of the last event applied to this agent. Stored for selectors; the
   *  reducer never compares it to wall-clock. */
  lastEventTs: string | null;
  /** Highest seq applied to THIS agent. The de-dup key (per agent, not global). */
  lastSeq: number;
}

export interface WorldState {
  schemaVersion: number;
  agents: Record<string, AgentState>;
  /** Highest seq seen across all agents. Display/debug only — NOT a de-dup key
   *  (each agent's log has its own seq space). */
  maxSeqSeen: number;
}

export function initialWorld(): WorldState {
  return { schemaVersion: SCHEMA_VERSION, agents: {}, maxSeqSeen: 0 };
}
