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
import { join } from "node:path";
import { BrowserWindow, app, ipcMain } from "electron";
import type { PokeHubEvent } from "../core/events.ts";
import { parseLog } from "../core/log.ts";
import { spawnAgent, type AgentHandle } from "../agent/session.ts";
import type { PermissionDecision } from "../shared/permissions.ts";
import {
  IPC,
  type PermissionAnswer,
  type SpawnRequest,
  type SpawnResult,
  type StopAgentRequest,
} from "../shared/ipc.ts";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

/** Every agent we have spawned this session, by id. */
const agents = new Map<string, AgentHandle>();

/** Outstanding `canUseTool` asks, by correlation id. Every entry MUST be
 *  resolved exactly once — on answer, on that agent exiting, or on shutdown —
 *  or the SDK's `canUseTool` promise hangs forever (it has no timeout). */
const pendingAsks = new Map<
  string,
  { agentId: string; resolve: (d: PermissionDecision) => void }
>();

function resolveAsk(id: string, decision: PermissionDecision): void {
  const entry = pendingAsks.get(id);
  if (!entry) return;
  pendingAsks.delete(id);
  entry.resolve(decision);
}

function resolveAsksForAgent(agentId: string, decision: PermissionDecision): void {
  for (const [id, entry] of pendingAsks) {
    if (entry.agentId === agentId) {
      pendingAsks.delete(id);
      entry.resolve(decision);
    }
  }
}

function resolveAllAsks(decision: PermissionDecision): void {
  for (const [id, entry] of pendingAsks) {
    pendingAsks.delete(id);
    entry.resolve(decision);
  }
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
    // No renderer to answer encounters any more — fail them closed.
    resolveAllAsks("refuse");
    if (mainWindow === win) mainWindow = null;
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
        cwd: req.cwd,
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
            pendingAsks.set(id, { agentId, resolve });
            sendToRenderer(IPC.permissionAsk, { id, ask });
          }),
      });

      agents.set(agentId, handle);
      void handle.done.finally(() => resolveAsksForAgent(agentId, "refuse"));

      return { agentId, logPath };
    },
  );

  ipcMain.on(IPC.permissionAnswer, (_evt, answer: PermissionAnswer) => {
    resolveAsk(answer.id, answer.decision);
  });

  ipcMain.on(IPC.stopAgent, (_evt, req: StopAgentRequest) => {
    agents.get(req.agentId)?.stop();
  });

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
  if (process.platform !== "darwin") app.quit();
});

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
}
