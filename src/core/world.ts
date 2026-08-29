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
  | "exited";

export interface ActiveTool {
  toolCallId: string;
  tool: string;
}

export interface PendingPermission {
  toolCallId: string;
  tool: string;
  input: Record<string, unknown>;
}

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
  /** canUseTool asks awaiting the user, oldest first. */
  pendingPermissions: PendingPermission[];
  exitCode: number | null;
  /** Why the session ended abnormally (SDK result subtype), if it did. */
  exitReason: string | null;
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
