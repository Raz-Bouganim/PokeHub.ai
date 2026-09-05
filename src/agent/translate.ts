/**
 * Pure translation: one SDK stream message -> zero or more PokeHub event drafts.
 *
 * "Draft" = the event without `v`, `seq`, `ts`. The writer (`eventLog.ts`) stamps
 * those, because sequence and wall-clock are its job, not the translator's. This
 * keeps translation pure and unit-testable against recorded SDK messages.
 *
 * Pairing of started/finished tool calls is NOT done here — the reducer pairs by
 * `toolCallId`, so translation can stay stateless.
 */

import type { PokeHubEvent } from "../core/events.ts";
import { bubbleLine, summarizeToolOutput } from "../core/text.ts";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

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
  /** The tool's full structured Output object (per-tool shape), sibling to the
   *  `tool_result` content block it answers — see `summarizeToolOutput`. Only
   *  meaningful when `message.content` holds exactly one `tool_result` block;
   *  the SDK does not batch several into one user message today. */
  tool_use_result?: unknown;
}

function contentBlocks(msg: SdkMessageLike): ContentBlock[] {
  const c = msg.message?.content;
  return Array.isArray(c) ? c : [];
}

/**
 * @param raw       a message yielded by the SDK `query()` async iterator
 * @param agentId   PokeHub's stable id for this sprite
 * @param sessionId last-known session id (used until the SDK reports one)
 */
export function translate(
  raw: unknown,
  agentId: string,
  sessionId: string | null,
): EventDraft[] {
  const msg = raw as SdkMessageLike;
  if (!msg || typeof msg.type !== "string") return [];
  const sid = msg.session_id ?? sessionId;
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
          ...(msg.compact_metadata?.trigger
            ? { trigger: msg.compact_metadata.trigger }
            : {}),
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
            agentId,
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
            agentId,
            sessionId: sid,
            text: block.text.trim(),
          });
        }
        if (block.type === "tool_use" && block.id && block.name) {
          drafts.push({
            kind: "tool.started",
            source: "agent",
            agentId,
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
            agentId,
            sessionId: sid,
            toolCallId: block.tool_use_id,
            ok: block.is_error !== true,
            ...(summary !== undefined ? { summary } : {}),
          });
        }
      }
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
