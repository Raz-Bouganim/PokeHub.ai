/**
 * Owns every agent process this session and the outstanding `canUseTool` asks.
 *
 * There is exactly one instance, created in `index.ts` and wired to the IPC
 * channels. It is a class (not loose module state) because it has a real
 * invariant — every pending ask MUST be resolved exactly once, or the SDK's
 * `canUseTool` promise hangs forever — and because that makes it testable by
 * instantiation. Electron is injected via `SupervisorHooks`, never imported
 * here, so the Tauri port only rewrites `index.ts`.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnAgent, type AgentHandle } from "../agent/session.ts";
import type { PokeHubEvent } from "../core/events.ts";
import { parseLog } from "../core/log.ts";
import type { PermissionDecision } from "../shared/permissions.ts";
import type { FollowUpResult, SpawnRequest, SpawnResult } from "../shared/ipc.ts";
import { normalizeCwd, slug } from "./spawn-id.ts";

/** How long a permission ask waits for the renderer to confirm receipt before
 *  it is treated as undeliverable and failed closed. A healthy renderer acks in
 *  a single IPC round-trip; this only expires when the renderer has crashed or
 *  never registered a handler. It is NOT a decision deadline — once acked, the
 *  ask waits indefinitely for the user. */
const ACK_DEADLINE_MS = 15_000;

/** The channel names the supervisor sends on. Kept as a parameter of `send`
 *  rather than importing `IPC` so the supervisor stays transport-agnostic. */
export interface SupervisorHooks {
  /** Deliver a payload to the renderer. Must be a no-op when no renderer is
   *  present. */
  send: (channel: string, payload: unknown) => void;
  /** Whether a renderer is present and able to answer an encounter. */
  rendererReady: () => boolean;
  /** Absolute directory for this session's NDJSON logs. */
  sessionsDir: string;
  /** IPC channel name for a streamed agent event. */
  agentEventChannel: string;
  /** IPC channel name for a permission ask envelope. */
  permissionAskChannel: string;
}

interface PendingAsk {
  /** Who asked — the root, or a subagent. Fails closed when this agent exits. */
  agentId: string;
  /** The session's root agent. A subagent has no handle, so its asks are
   *  cleaned up when the session handle finishes, keyed off this. */
  sessionAgentId: string;
  resolve: (decision: PermissionDecision) => void;
  /** Fires if the renderer never acks; cleared on ack and on resolution. */
  ackTimer: ReturnType<typeof setTimeout>;
}

export class AgentSupervisor {
  private readonly hooks: SupervisorHooks;
  private readonly agents = new Map<string, AgentHandle>();
  private readonly pendingAsks = new Map<string, PendingAsk>();

  constructor(hooks: SupervisorHooks) {
    this.hooks = hooks;
  }

  /**
   * Spawn a new agent from a composer request.
   *
   * @param req - the spawn request (name, class, cwd, prompt)
   * @returns the new agent's id and log path
   */
  spawn(req: SpawnRequest): SpawnResult {
    const agentId = `${slug(req.name)}-${randomUUID().slice(0, 8)}`;
    const logPath = join(this.hooks.sessionsDir, `${agentId}.ndjson`);

    const handle = spawnAgent({
      agentId,
      name: req.name,
      agentClass: req.agentClass,
      cwd: normalizeCwd(req.cwd),
      prompt: req.prompt,
      logPath,
      onEvent: (event: PokeHubEvent) => {
        this.hooks.send(this.hooks.agentEventChannel, event);
        if (event.kind === "agent.exited") {
          this.resolveAsksForAgent(event.agentId, "refuse");
        }
      },
      requestPermission: (ask) =>
        new Promise<PermissionDecision>((resolve) => {
          if (!this.hooks.rendererReady()) {
            resolve("refuse");
            return;
          }
          const id = randomUUID();
          const ackTimer = setTimeout(() => {
            // Renderer never confirmed receipt — undeliverable, fail closed.
            this.discardAsk(id)?.resolve("refuse");
          }, ACK_DEADLINE_MS);
          this.pendingAsks.set(id, {
            agentId: ask.agentId,
            sessionAgentId: agentId,
            resolve,
            ackTimer,
          });
          this.hooks.send(this.hooks.permissionAskChannel, { id, ask });
        }),
    });

    this.agents.set(agentId, handle);
    void handle.done.finally(() => {
      // Session gone — fail every ask under it, root's and subagents'.
      this.resolveAsksForSession(agentId, "refuse");
    });

    return { agentId, logPath };
  }

  /**
   * Hand a live or idle agent another user turn.
   *
   * @param agentId - the target agent
   * @param text    - the follow-up message (trimmed here)
   * @returns whether the turn was accepted, with a reason when not
   */
  async followUp(agentId: string, text: string): Promise<FollowUpResult> {
    const handle = this.agents.get(agentId);
    if (!handle) return { ok: false, reason: "unknown agent" };
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, reason: "empty message" };
    return handle.followUp(trimmed);
  }

  /** Stop one agent (flushes and closes its log). */
  stop(agentId: string): void {
    this.agents.get(agentId)?.stop();
  }

  /** Stop every agent — window close / app quit. */
  stopAll(): void {
    for (const handle of this.agents.values()) handle.stop();
  }

  /** The renderer confirmed receipt of an ask: cancel the undeliverable timer
   *  and wait for the user as long as it takes. */
  ackAsk(id: string): void {
    const entry = this.pendingAsks.get(id);
    if (entry) clearTimeout(entry.ackTimer);
  }

  /** The user answered an ask in the encounter screen. */
  answer(id: string, decision: PermissionDecision): void {
    this.discardAsk(id)?.resolve(decision);
  }

  /** Fail every outstanding ask closed — the renderer is gone (window closed or
   *  crashed) so nothing can answer them. */
  failAllAsks(): void {
    for (const id of [...this.pendingAsks.keys()]) {
      this.discardAsk(id)?.resolve("refuse");
    }
  }

  /**
   * Every event from every known session log, for the renderer's on-mount
   * replay.
   *
   * @returns the concatenated events (order across logs does not matter — de-dup
   *          is per agent)
   */
  snapshot(): PokeHubEvent[] {
    const all: PokeHubEvent[] = [];
    for (const handle of this.agents.values()) {
      try {
        all.push(...parseLog(readFileSync(handle.logPath, "utf8")));
      } catch {
        // Missing/unreadable log — skip.
      }
    }
    return all;
  }

  private discardAsk(id: string): PendingAsk | undefined {
    const entry = this.pendingAsks.get(id);
    if (!entry) return undefined;
    clearTimeout(entry.ackTimer);
    this.pendingAsks.delete(id);
    return entry;
  }

  private resolveAsksForAgent(agentId: string, decision: PermissionDecision): void {
    for (const [id, entry] of this.pendingAsks) {
      if (entry.agentId === agentId) this.discardAsk(id)?.resolve(decision);
    }
  }

  private resolveAsksForSession(sessionAgentId: string, decision: PermissionDecision): void {
    for (const [id, entry] of this.pendingAsks) {
      if (entry.sessionAgentId === sessionAgentId) this.discardAsk(id)?.resolve(decision);
    }
  }
}
