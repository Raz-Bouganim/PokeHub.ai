/**
 * Electron main process. Creates the window and wires the IPC channels to a
 * single `AgentSupervisor`, which owns all the real work (agent processes,
 * event logs, permission asks).
 *
 * Deliberately thin: nothing in `src/agent` or `src/core` imports Electron, and
 * `AgentSupervisor` takes Electron in via a hooks object rather than importing
 * it — so swapping Electron for Tauri later means rewriting only this file and
 * the preload.
 */

import { join } from "node:path";
import { BrowserWindow, app, ipcMain } from "electron";
import {
  IPC,
  type FollowUpRequest,
  type FollowUpResult,
  type PermissionAnswer,
  type SpawnRequest,
  type SpawnResult,
  type StopAgentRequest,
} from "../shared/ipc.ts";
import { AgentSupervisor } from "./agent-supervisor.ts";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function rendererReady(): boolean {
  return mainWindow !== null && !mainWindow.isDestroyed();
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (rendererReady()) mainWindow!.webContents.send(channel, payload);
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
    supervisor.failAllAsks();
    supervisor.stopAll();
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on("render-process-gone", () => {
    // The renderer crashed; the window is still up but nothing can answer an
    // encounter. Fail outstanding asks closed instead of hanging every blocked
    // agent until the window is closed by hand.
    supervisor.failAllAsks();
  });

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow = win;
}

const supervisor = new AgentSupervisor({
  send: sendToRenderer,
  rendererReady,
  // `app.getPath` is only valid after `whenReady`; this getter defers the call.
  get sessionsDir() {
    return join(app.getPath("userData"), "sessions");
  },
  agentEventChannel: IPC.agentEvent,
  permissionAskChannel: IPC.permissionAsk,
});

void app.whenReady().then(() => {
  createWindow();

  ipcMain.handle(IPC.spawnAgent, (_evt, req: SpawnRequest): SpawnResult => supervisor.spawn(req));

  ipcMain.on(IPC.permissionAck, (_evt, { id }: { id: string }) => {
    supervisor.ackAsk(id);
  });

  ipcMain.on(IPC.permissionAnswer, (_evt, answer: PermissionAnswer) => {
    supervisor.answer(answer.id, answer.decision);
  });

  ipcMain.on(IPC.stopAgent, (_evt, req: StopAgentRequest) => {
    supervisor.stop(req.agentId);
  });

  ipcMain.handle(IPC.followUpAgent, (_evt, req: FollowUpRequest): Promise<FollowUpResult> =>
    supervisor.followUp(req.agentId, req.text),
  );

  ipcMain.handle(IPC.worldSnapshot, () => supervisor.snapshot());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  supervisor.failAllAsks();
  supervisor.stopAll();
  if (process.platform !== "darwin") app.quit();
});
