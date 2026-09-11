/**
 * Pure translation: one SDK stream message -> zero or more PokeHub event drafts.
 *
 * "Draft" = the event without `v`, `seq`, `ts`. The writer (`event-log.ts`) stamps
 * those, because sequence and wall-clock are its job, not the translator's. This
 * keeps translation pure and unit-testable against recorded SDK messages.
 *
 * Pairing of started/finished tool calls is NOT done here — the reducer pairs by
 * `toolCallId`, so translation can stay stateless.
 *
 * Subagents ride the same stream: a message with `parent_tool_use_id` set is
 * attributed to a child sprite whose id is minted deterministically from that
 * tool-use id (`subAgentId`), so this stays stateless. `system/task_started`
 * spawns the child (with `parentAgentId` = the root), `system/task_notification`
 * exits it.
 */

import type { PokeHubEvent, RateLimitStatus, RateLimitWindow } from "../core/events.ts";
import { bubbleLine } from "../core/text/bubble-line.ts";
import { summarizeToolOutput } from "../core/text/summarize-tool-output.ts";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type EventDraft = DistributiveOmit<PokeHubEvent, "v" | "seq" | "ts">;

/** Minimal shape of the SDK messages we consume. The SDK's own types are far
 *  wider; we narrow to what Phase 0 needs and ignore the rest. */
interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
}
interface SdkMessageLike {
  type: string;
  subtype?: string;
  session_id?: string;
  cwd?: string;
  message?: { content?: ContentBlock[] | string };
  is_error?: boolean;
  compact_metadata?: { trigger?: string };
  parent_tool_use_id?: string | null;
  tool_use_id?: string;
  task_type?: string;
  description?: string;
  subagent_type?: string;
  prompt?: string;
  status?: string;
  tool_use_result?: unknown;
  /** Hand-narrowed: the published `.d.ts` omits `unifiedWindows`, which real runs send. */
  rate_limit_info?: {
    status?: string;
    unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number } | null>;
  };
}

const RATE_LIMIT_STATUSES: readonly RateLimitStatus[] = ["allowed", "allowed_warning", "rejected"];

/** Unknown values read as `allowed` — an uninterpretable status must not make
 *  the gauge claim the budget is spent. */
function rateLimitStatus(raw: string | undefined): RateLimitStatus {
  return RATE_LIMIT_STATUSES.find((s) => s === raw) ?? "allowed";
}

/** `null` when the SDK omitted the window or sent it half-filled.
 *  `resetsAt` arrives in epoch seconds; downstream is milliseconds. */
function rateLimitWindow(
  raw: { utilization?: number; resetsAt?: number } | null | undefined,
): RateLimitWindow | null {
  if (!raw || typeof raw.utilization !== "number" || typeof raw.resetsAt !== "number") return null;
  return { utilization: raw.utilization, resetsAt: raw.resetsAt * 1000 };
}

function contentBlocks(msg: SdkMessageLike): ContentBlock[] {
  const c = msg.message?.content;
  return Array.isArray(c) ? c : [];
}

/** PokeHub id for a subagent, derived from the `Agent`/`Task` tool-use id that
 *  started it. Deterministic and stateless: the same id appears on `task_started`
 *  (as `tool_use_id`), on every subagent message (as `parent_tool_use_id`), and
 *  on `task_notification` — so translate never has to remember a mapping. */
function subAgentId(toolUseId: string): string {
  return `sub-${toolUseId}`;
}

/**
 * @param raw       a message yielded by the SDK `query()` async iterator
 * @param agentId   PokeHub's stable id for the session-root sprite
 * @param sessionId last-known session id (used until the SDK reports one)
 * @param cwd       the root agent's working directory — inherited by any
 *                  subagent, which the SDK does not restate
 */
export function translate(
  raw: unknown,
  agentId: string,
  sessionId: string | null,
  cwd = "",
): EventDraft[] {
  const msg = raw as SdkMessageLike;
  if (!msg || typeof msg.type !== "string") return [];
  const sid = msg.session_id ?? sessionId;
  // A message tagged with `parent_tool_use_id` was produced inside a subagent;
  // every event it yields belongs to that child sprite, not the root.
  const owner =
    typeof msg.parent_tool_use_id === "string" ? subAgentId(msg.parent_tool_use_id) : agentId;
  const drafts: EventDraft[] = [];

  switch (msg.type) {
    case "system": {
      if (msg.subtype === "init" && msg.session_id) {
        drafts.push({
          kind: "agent.session_started",
          source: "agent",
          agentId,
          sessionId: msg.session_id,
        });
      }
      if (msg.subtype === "compact_boundary") {
        drafts.push({
          kind: "session.compacted",
          source: "system",
          agentId,
          sessionId: sid,
          ...(msg.compact_metadata?.trigger ? { trigger: msg.compact_metadata.trigger } : {}),
        });
      }
      // A subagent was dispatched: mint the child sprite and hand it the task
      // prompt. `task_started` fires before any of the child's own messages, so
      // the parent link is always known by the time the child does anything.
      // `task_type` gates out the other things that emit `task_started` — a
      // backgrounded Bash (`local_bash`), an ultracode run (`local_workflow`).
      if (
        msg.subtype === "task_started" &&
        msg.task_type === "local_agent" &&
        typeof msg.tool_use_id === "string"
      ) {
        const child = subAgentId(msg.tool_use_id);
        const label = msg.description?.trim();
        drafts.push({
          kind: "agent.spawned",
          source: "agent",
          agentId: child,
          sessionId: sid,
          name: label && label.length > 0 ? label : "subagent",
          agentClass: msg.subagent_type ?? "subagent",
          cwd,
          parentAgentId: agentId,
        });
        if (msg.prompt?.trim()) {
          drafts.push({
            kind: "agent.prompt",
            source: "user",
            agentId: child,
            sessionId: sid,
            text: msg.prompt.trim(),
          });
        }
      }
      // The subagent settled. `task_notification` is the frame that carries both
      // `tool_use_id` (to key the child) and a terminal `status`.
      if (msg.subtype === "task_notification" && typeof msg.tool_use_id === "string") {
        const child = subAgentId(msg.tool_use_id);
        const failed = msg.status === "failed" || msg.status === "stopped";
        drafts.push({
          kind: "agent.exited",
          source: "agent",
          agentId: child,
          sessionId: sid,
          code: failed ? 1 : 0,
          ...(failed ? { reason: msg.status } : {}),
        });
      }
      break;
    }

    case "assistant": {
      for (const block of contentBlocks(msg)) {
        if (block.type === "thinking" && block.thinking?.trim()) {
          drafts.push({
            kind: "agent.thinking",
            source: "agent",
            agentId: owner,
            sessionId: sid,
            thought: bubbleLine(block.thinking),
            channel: "reasoning",
          });
        }
        if (block.type === "text" && block.text?.trim()) {
          // One canonical event per prose block: the full text. The reducer
          // derives the one-line thought bubble from it (`bubbleLine`), so the
          // log isn't carrying the same text twice. Extended-thinking blocks
          // above still use `agent.thinking` — that text is not the reply.
          drafts.push({
            kind: "agent.message",
            source: "agent",
            agentId: owner,
            sessionId: sid,
            text: block.text.trim(),
          });
        }
        if (block.type === "tool_use" && block.id && block.name) {
          drafts.push({
            kind: "tool.started",
            source: "agent",
            agentId: owner,
            sessionId: sid,
            toolCallId: block.id,
            tool: block.name,
            input: block.input ?? {},
          });
        }
      }
      break;
    }

    case "user": {
      const resultBlocks = contentBlocks(msg).filter((b) => b.type === "tool_result");
      // `tool_use_result` describes exactly ONE tool's output, keyed by
      // position/name, not by `tool_use_id` — it can't be safely attributed to
      // a block if the message ever carries more than one `tool_result` (e.g.
      // parallel tool calls answered together). Attach it only in the common
      // one-block-per-message case; a batched message loses the summary
      // rather than risk stamping the wrong one's diff onto another's call.
      const summary =
        resultBlocks.length === 1 ? summarizeToolOutput(msg.tool_use_result) : undefined;
      for (const block of contentBlocks(msg)) {
        if (block.type === "tool_result" && block.tool_use_id) {
          drafts.push({
            kind: "tool.finished",
            source: "agent",
            agentId: owner,
            sessionId: sid,
            toolCallId: block.tool_use_id,
            ok: block.is_error !== true,
            ...(summary !== undefined ? { summary } : {}),
          });
        }
      }
      break;
    }

    // Account-wide, so it attaches to the session root even mid-subagent.
    case "rate_limit_event": {
      const info = msg.rate_limit_info;
      if (!info) break;
      drafts.push({
        kind: "rate_limit.updated",
        source: "system",
        agentId,
        sessionId: sid,
        status: rateLimitStatus(info.status),
        fiveHour: rateLimitWindow(info.unifiedWindows?.["five_hour"]),
        sevenDay: rateLimitWindow(info.unifiedWindows?.["seven_day"]),
      });
      break;
    }

    case "result": {
      const errored = msg.subtype !== undefined && msg.subtype !== "success";
      if (errored || msg.is_error) {
        drafts.push({
          kind: "agent.exited",
          source: "agent",
          agentId,
          sessionId: sid,
          code: 1,
          ...(errored ? { reason: msg.subtype } : {}),
        });
      } else {
        // A clean turn end is NOT an exit: the session can be resumed with a
        // follow-up. `spawnAgent` keeps the log open and the agent idle.
        drafts.push({
          kind: "agent.turn_finished",
          source: "agent",
          agentId,
          sessionId: sid,
        });
      }
      break;
    }
  }

  return drafts;
}
