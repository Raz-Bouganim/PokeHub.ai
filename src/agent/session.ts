/**
 * Runs ONE `claude` session and turns its stream into event-log lines.
 *
 * This is the only place that imports the Agent SDK. Everything downstream
 * (reducer, selectors, renderer) sees only the NDJSON log, so this module can
 * be swapped for "tail a log someone else wrote" (attach-mode) without touching
 * anything else.
 *
 * Permissions flow through the SDK's `canUseTool` callback (CLAUDE.md). The
 * decision itself is delegated to `requestPermission` — in the app that is the
 * encounter screen; in a headless spike it defaults to allow-once.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PokeHubEvent } from "../core/events.ts";
import { bashCommandAllowed, toolsForClass } from "../core/classes.ts";
import type { PermissionAsk, PermissionDecision } from "../shared/permissions.ts";
import { EventLog } from "./eventLog.ts";
import { translate } from "./translate.ts";

export type { PermissionAsk, PermissionDecision };

export interface SpawnAgentOptions {
  agentId: string;
  name: string;
  agentClass: string;
  cwd: string;
  prompt: string;
  /** Absolute path for this session's NDJSON log. */
  logPath: string;
  /** The encounter screen. Defaults to allow-once when omitted. */
  requestPermission?: (ask: PermissionAsk) => Promise<PermissionDecision>;
  /** Called for every event as it is appended — the live feed for a renderer. */
  onEvent?: (event: PokeHubEvent) => void;
  /** Supply your own to share a stop signal; otherwise one is created and
   *  driven by `AgentHandle.stop()`. */
  abortController?: AbortController;
}

export interface AgentHandle {
  agentId: string;
  logPath: string;
  /** Resolves when the session ends and the log is flushed. */
  done: Promise<void>;
  /** Interrupt the session. The log gets a clean `agent.exited`, not an error. */
  stop(): void;
}

export function spawnAgent(opts: SpawnAgentOptions): AgentHandle {
  const abort = opts.abortController ?? new AbortController();
  let finished = false;
  let sessionId: string | null = null;

  let logError: Error | null = null;
  const log = new EventLog(opts.logPath, (err) => {
    // The write stream failed (EPIPE/ENOSPC). Without this handler an unhandled
    // 'error' event crashes the process. We can no longer persist reliably, so
    // tear the session down — the catch/finally path emits a clean exit.
    logError = err;
    abort.abort();
  });

  const emit = (draft: Parameters<typeof log.append>[0]) => {
    const event = log.append(draft);
    if (event.kind === "agent.session_started") sessionId = event.sessionId;
    if (event.kind === "agent.exited") finished = true;
    opts.onEvent?.(event);
    return event;
  };

  emit({
    kind: "agent.spawned",
    source: "agent",
    agentId: opts.agentId,
    sessionId: null,
    name: opts.name,
    agentClass: opts.agentClass,
    cwd: opts.cwd,
  });

  const classTools = toolsForClass(opts.agentClass);

  const run = async () => {
    try {
      const stream = query({
        prompt: opts.prompt,
        options: {
          cwd: opts.cwd,
          abortController: abort,
          // Classes are permissions, not costumes: the class's allow-list is a
          // hard cap on the built-in tool set, applied before the model sees it.
          ...(classTools ? { tools: classTools } : {}),
          canUseTool: async (toolName, input, { toolUseID, title, suggestions }) => {
            emit({
              kind: "permission.requested",
              source: "agent",
              agentId: opts.agentId,
              sessionId,
              toolCallId: toolUseID,
              tool: toolName,
              input,
            });

            // Class enforcement the tool allow-list can't express: Bash is one
            // tool spanning many capabilities, so Runner ("no writes") and
            // Keeper ("git only") are gated here, at call time. The user is not
            // asked — the class already decided.
            if (toolName === "Bash") {
              const command =
                typeof input["command"] === "string" ? input["command"] : "";
              const verdict = bashCommandAllowed(opts.agentClass, command);
              if (!verdict.ok) {
                emit({
                  kind: "permission.resolved",
                  source: "system",
                  agentId: opts.agentId,
                  sessionId,
                  toolCallId: toolUseID,
                  decision: "refuse",
                });
                return { behavior: "deny", message: verdict.reason };
              }
            }

            const ask: PermissionAsk = {
              agentId: opts.agentId,
              agentName: opts.name,
              toolCallId: toolUseID,
              tool: toolName,
              input,
              canRemember: (suggestions?.length ?? 0) > 0,
              ...(title ? { title } : {}),
            };

            const decision = opts.requestPermission
              ? await opts.requestPermission(ask)
              : "allow_once";

            emit({
              kind: "permission.resolved",
              source: "user",
              agentId: opts.agentId,
              sessionId,
              toolCallId: toolUseID,
              decision,
            });

            if (decision === "refuse") {
              return { behavior: "deny", message: "Refused in the encounter screen." };
            }
            if (decision === "allow_always") {
              return {
                behavior: "allow",
                updatedInput: input,
                updatedPermissions: suggestions ?? [],
              };
            }
            return { behavior: "allow", updatedInput: input };
          },
        },
      });

      for await (const msg of stream) {
        for (const draft of translate(msg, opts.agentId, sessionId)) {
          emit(draft);
        }
      }
    } catch (err) {
      const aborted =
        abort.signal.aborted ||
        (err instanceof Error && err.name === "AbortError");

      if (!finished) {
        if (!aborted || logError) {
          emit({
            kind: "tool.finished",
            source: "system",
            agentId: opts.agentId,
            sessionId,
            toolCallId: "session",
            ok: false,
            summary: logError
              ? `log write failed: ${logError.message}`
              : err instanceof Error
                ? err.message
                : String(err),
          });
        }
        emit({
          kind: "agent.exited",
          source: "system",
          agentId: opts.agentId,
          sessionId,
          code: null,
          ...(logError
            ? { reason: "log write failed" }
            : aborted
              ? { reason: "stopped" }
              : {}),
        });
      }
    } finally {
      await log.close().catch(() => {});
    }
  };

  return {
    agentId: opts.agentId,
    logPath: opts.logPath,
    done: run(),
    stop: () => abort.abort(),
  };
}
