/**
 * Electron main process. Owns the agent child processes and the event-log
 * files; forwards every logged event to the renderer and relays `canUseTool`
 * asks to the encounter screen.
 *
 * Deliberately thin: all the real logic is in `src/agent` and `src/core`, none
 * of which imports Electron. Swapping Electron for Tauri later means rewriting
 * only this file and the preload.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BrowserWindow, app, ipcMain } from "electron";
import type { PokeHubEvent } from "../core/events.ts";
import { parseLog } from "../core/log.ts";
import { spawnAgent, type AgentHandle } from "../agent/session.ts";
import type { PermissionDecision } from "../shared/permissions.ts";
import {
  IPC,
  type FollowUpRequest,
  type FollowUpResult,
  type PermissionAnswer,
  type SpawnRequest,
  type SpawnResult,
  type StopAgentRequest,
} from "../shared/ipc.ts";

const isDev = !app.isPackaged;

/** How long a permission ask waits for the renderer to confirm receipt before
 *  it is treated as undeliverable and failed closed. A healthy renderer acks in
 *  a single IPC round-trip; this only expires when React has crashed or never
 *  registered a handler. It is NOT a decision deadline — once acked, the ask
 *  waits indefinitely for the user. */
const ACK_DEADLINE_MS = 15_000;

let mainWindow: BrowserWindow | null = null;

/** Every agent we have spawned this session, by id. */
const agents = new Map<string, AgentHandle>();

interface PendingAsk {
  agentId: string;
  resolve: (d: PermissionDecision) => void;
  /** Fires if the renderer never acks; cleared on ack and on resolution. */
  ackTimer: ReturnType<typeof setTimeout>;
}

/** Outstanding `canUseTool` asks, by correlation id. Every entry MUST be
 *  resolved exactly once — on answer, on ack timeout, on that agent exiting, on
 *  renderer loss, or on shutdown — or the SDK's `canUseTool` promise hangs
 *  forever (it has no timeout). */
const pendingAsks = new Map<string, PendingAsk>();

function discardAsk(id: string): PendingAsk | undefined {
  const entry = pendingAsks.get(id);
  if (!entry) return undefined;
  clearTimeout(entry.ackTimer);
  pendingAsks.delete(id);
  return entry;
}

function resolveAsk(id: string, decision: PermissionDecision): void {
  discardAsk(id)?.resolve(decision);
}

function resolveAsksForAgent(agentId: string, decision: PermissionDecision): void {
  for (const [id, entry] of pendingAsks) {
    if (entry.agentId === agentId) discardAsk(id)?.resolve(decision);
  }
}

function resolveAllAsks(decision: PermissionDecision): void {
  for (const id of [...pendingAsks.keys()]) discardAsk(id)?.resolve(decision);
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#0f1020",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  win.on("closed", () => {
    // No renderer to answer encounters any more — fail them closed and end the
    // agents (also flushes each session log cleanly).
    resolveAllAsks("refuse");
    for (const handle of agents.values()) handle.stop();
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on("render-process-gone", () => {
    // The renderer process crashed; the window is still up but nothing can
    // answer an encounter. Fail outstanding asks closed instead of hanging
    // every blocked agent until the window is closed by hand.
    resolveAllAsks("refuse");
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow = win;
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle(
    IPC.spawnAgent,
    async (_evt, req: SpawnRequest): Promise<SpawnResult> => {
      const agentId = `${slug(req.name)}-${randomUUID().slice(0, 8)}`;
      const logPath = join(
        app.getPath("userData"),
        "sessions",
        `${agentId}.ndjson`,
      );

      const handle = spawnAgent({
        agentId,
        name: req.name,
        agentClass: req.agentClass,
        cwd: normalizeCwd(req.cwd),
        prompt: req.prompt,
        logPath,
        onEvent: (event: PokeHubEvent) => {
          sendToRenderer(IPC.agentEvent, event);
          if (event.kind === "agent.exited") {
            resolveAsksForAgent(event.agentId, "refuse");
          }
        },
        requestPermission: (ask) =>
          new Promise<PermissionDecision>((resolve) => {
            if (!mainWindow || mainWindow.isDestroyed()) {
              resolve("refuse");
              return;
            }
            const id = randomUUID();
            const ackTimer = setTimeout(() => {
              // Renderer never confirmed receipt — undeliverable, fail closed.
              discardAsk(id)?.resolve("refuse");
            }, ACK_DEADLINE_MS);
            pendingAsks.set(id, { agentId, resolve, ackTimer });
            sendToRenderer(IPC.permissionAsk, { id, ask });
          }),
      });

      agents.set(agentId, handle);
      void handle.done.finally(() => resolveAsksForAgent(agentId, "refuse"));

      return { agentId, logPath };
    },
  );

  ipcMain.on(IPC.permissionAck, (_evt, { id }: { id: string }) => {
    // Receipt confirmed — stop the undeliverable timer; now wait for the user
    // as long as it takes.
    const entry = pendingAsks.get(id);
    if (entry) clearTimeout(entry.ackTimer);
  });

  ipcMain.on(IPC.permissionAnswer, (_evt, answer: PermissionAnswer) => {
    resolveAsk(answer.id, answer.decision);
  });

  ipcMain.on(IPC.stopAgent, (_evt, req: StopAgentRequest) => {
    agents.get(req.agentId)?.stop();
  });

  ipcMain.handle(
    IPC.followUpAgent,
    async (_evt, req: FollowUpRequest): Promise<FollowUpResult> => {
      const handle = agents.get(req.agentId);
      if (!handle) return { ok: false, reason: "unknown agent" };
      const text = req.text.trim();
      if (!text) return { ok: false, reason: "empty message" };
      return handle.followUp(text);
    },
  );

  ipcMain.handle(IPC.worldSnapshot, (): PokeHubEvent[] => {
    const all: PokeHubEvent[] = [];
    for (const handle of agents.values()) {
      try {
        all.push(...parseLog(readFileSync(handle.logPath, "utf8")));
      } catch {
        // Missing/unreadable log — skip. De-dup is per-agent so order across
        // logs does not matter.
      }
    }
    return all;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  resolveAllAsks("refuse");
  for (const handle of agents.values()) handle.stop();
  if (process.platform !== "darwin") app.quit();
});

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
}

/** The composer's cwd field is free-typed and often copy-pasted: trim stray
 *  whitespace and expand a leading `~`/`~/` (Node does not do this itself).
 *  Without it, either mistake resolves to a nonexistent directory and the SDK
 *  surfaces a misleading native-binary/libc error instead of the real cause. */
function normalizeCwd(cwd: string): string {
  const trimmed = cwd.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}
