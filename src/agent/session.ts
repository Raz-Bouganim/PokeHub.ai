/**
 * Runs ONE `claude` session and turns its stream into event-log lines.
 *
 * This is the only place that imports the Agent SDK. Everything downstream
 * (reducer, selectors, renderer) sees only the NDJSON log, so this module can
 * be swapped for "tail a log someone else wrote" (attach-mode) without touching
 * anything else.
 *
 * A session is more than one turn. `spawnAgent` runs the first turn; `followUp`
 * resumes the same session (by its id, captured from `agent.session_started`)
 * with another user turn, appending to the SAME log. Between turns the agent is
 * `idle`, not `exited` — a fire-and-forget composer can't clear Phase 1's bar.
 *
 * Permissions flow through the SDK's `canUseTool` callback (CLAUDE.md). The
 * decision itself is delegated to `requestPermission` — in the app that is the
 * encounter screen; in a headless spike it defaults to allow-once.
 */

import { query, type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { PokeHubEvent } from "../core/events.ts";
import { bashCommandAllowed, toolsForClass } from "../core/classes.ts";
import type { PermissionAsk, PermissionDecision } from "../shared/permissions.ts";
import { EventLog } from "./event-log.ts";
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

export interface FollowUpResult {
  ok: boolean;
  /** Why the follow-up was rejected, when `ok` is false. */
  reason?: string;
}

export interface AgentHandle {
  agentId: string;
  logPath: string;
  /** Resolves when the agent is finished for good — stopped, or a turn ended
   *  abnormally with no follow-up to rescue it — and the log has flushed. An
   *  idle agent awaiting a follow-up has NOT resolved this. */
  done: Promise<void>;
  /** Hand the session another user turn (the first turn's session is resumed by
   *  id). Queues behind a turn that is still streaming. Resolves as soon as the
   *  turn is accepted — NOT when it completes; watch the event stream for that.
   *  Rejected (`ok: false`) only if the agent has finished or has no session id
   *  yet. */
  followUp(text: string): Promise<FollowUpResult>;
  /** Interrupt: aborts a streaming turn (or closes an idle session), writes a
   *  clean `agent.exited`, flushes and closes the log. */
  stop(): void;
}

export function spawnAgent(opts: SpawnAgentOptions): AgentHandle {
  const abort = opts.abortController ?? new AbortController();
  let sessionId: string | null = null;
  // running: a query() turn is streaming. idle: a turn ended cleanly and the
  // session is resumable. exited: finished for good, nothing more will run.
  let lifecycle: "running" | "idle" | "exited" = "running";
  let stopped = false;

  // `lifecycle` is only ever mutated inside `emit`; read it through this helper
  // so a call site's earlier `=== "exited"` guard doesn't narrow a later one to
  // an "unintentional comparison" (the closure write is invisible to TS's CFA).
  const hasExited = (): boolean => lifecycle === "exited";

  let logError: Error | null = null;
  const log = new EventLog(opts.logPath, (err) => {
    // The write stream failed (EPIPE/ENOSPC). Without this handler an unhandled
    // 'error' event crashes the process. We can no longer persist reliably, so
    // tear the session down — the catch path emits a clean exit.
    logError = err;
    abort.abort();
  });

  const emit = (draft: Parameters<typeof log.append>[0]) => {
    const event = log.append(draft);
    if (event.kind === "agent.session_started") sessionId = event.sessionId;
    else if (event.kind === "agent.prompt") lifecycle = "running";
    else if (event.kind === "agent.turn_finished") lifecycle = "idle";
    else if (event.kind === "agent.exited") lifecycle = "exited";
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
  emit({
    kind: "agent.prompt",
    source: "user",
    agentId: opts.agentId,
    sessionId: null,
    text: opts.prompt,
  });

  const classTools = toolsForClass(opts.agentClass);

  const canUseTool: CanUseTool = async (toolName, input, { toolUseID, title, suggestions }) => {
    emit({
      kind: "permission.requested",
      source: "agent",
      agentId: opts.agentId,
      sessionId,
      toolCallId: toolUseID,
      tool: toolName,
      input,
    });

    // Class enforcement the tool allow-list can't express: Bash is one tool
    // spanning many capabilities, so Runner ("no writes") and Keeper ("git
    // only") are gated here, at call time. The user is not asked — the class
    // already decided.
    if (toolName === "Bash") {
      const command = typeof input["command"] === "string" ? input["command"] : "";
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

    const decision = opts.requestPermission ? await opts.requestPermission(ask) : "allow_once";

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
  };

  /** Stream one `claude` turn into the log. `resume` continues an existing
   *  session; `null` starts a fresh one. */
  const runTurn = async (prompt: string, resume: string | null): Promise<void> => {
    try {
      const stream = query({
        prompt,
        options: {
          cwd: opts.cwd,
          abortController: abort,
          ...(resume ? { resume } : {}),
          // Classes are permissions, not costumes: the class's allow-list is a
          // hard cap on the built-in tool set, applied before the model sees it.
          ...(classTools ? { tools: classTools } : {}),
          canUseTool,
        },
      });

      for await (const msg of stream) {
        for (const draft of translate(msg, opts.agentId, sessionId)) {
          emit(draft);
        }
      }
    } catch (err) {
      const aborted = abort.signal.aborted || (err instanceof Error && err.name === "AbortError");

      if (!hasExited()) {
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
          ...(logError ? { reason: "log write failed" } : aborted ? { reason: "stopped" } : {}),
        });
      }
    }
  };

  // `turn` always holds the promise for the latest (or currently streaming)
  // turn. `followUp` chains onto it so turns run strictly in order.
  let turn: Promise<void> = runTurn(opts.prompt, null);

  let resolveDone!: () => void;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  // A one-shot gate the lifecycle loop parks on while the agent is idle;
  // `followUp` and `stop` open it (and `followUp` rotates in a fresh one).
  let openGate!: () => void;
  let gate = new Promise<void>((r) => {
    openGate = r;
  });

  /**
   * Accept another user turn. Resolves as soon as the turn is *queued* — NOT
   * when it finishes: a turn runs for minutes, and the SDK stream already
   * reports its progress and outcome (including `agent.exited` on error). The
   * result only says whether the follow-up could be accepted at all.
   */
  const followUp = async (text: string): Promise<FollowUpResult> => {
    if (stopped || hasExited()) {
      return { ok: false, reason: "the agent has finished" };
    }
    if (!sessionId) {
      return { ok: false, reason: "the session has not started yet" };
    }

    const prev = turn;
    turn = (async () => {
      await prev.catch(() => {});
      // The agent may have stopped or errored while an earlier turn drained.
      if (stopped || hasExited()) return;
      emit({
        kind: "agent.prompt",
        source: "user",
        agentId: opts.agentId,
        sessionId,
        text,
      });
      await runTurn(text, sessionId);
    })();

    // Wake the lifecycle loop: a new turn is pending. Rotate the gate first so a
    // subsequent idle parks on a fresh one.
    const open = openGate;
    gate = new Promise<void>((r) => {
      openGate = r;
    });
    open();

    return { ok: true };
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (lifecycle === "idle") {
      // No streaming turn to abort — close the idle session with a clean exit.
      emit({
        kind: "agent.exited",
        source: "system",
        agentId: opts.agentId,
        sessionId,
        code: 0,
        reason: "stopped",
      });
    } else {
      // A streaming turn's catch path emits the clean `agent.exited`.
      abort.abort();
    }
    openGate();
  };

  // Lifecycle loop: keep the log open across turns; close it once the agent can
  // do nothing more — stopped, or a turn ended abnormally with no follow-up.
  void (async () => {
    while (!stopped) {
      const settled = turn;
      await settled.catch(() => {});
      if (turn !== settled) continue; // a follow-up replaced it — keep going
      if (hasExited()) break; // abnormal end, nobody rescued it
      await gate; // idle — park until followUp() or stop()
    }
    await log.close().catch(() => {});
    resolveDone();
  })();

  return {
    agentId: opts.agentId,
    logPath: opts.logPath,
    done,
    followUp,
    stop,
  };
}
