/**
 * Preload: the only bridge between renderer and main. Exposes a typed, minimal
 * surface on `window.pokehub` — no raw ipcRenderer, no Node in the renderer.
 */

import { contextBridge, ipcRenderer } from "electron";
import type { PokeHubEvent } from "../core/events.ts";
import {
  IPC,
  type PermissionAnswer,
  type PermissionAskEnvelope,
  type PokeHubBridge,
  type SpawnRequest,
} from "../shared/ipc.ts";

const bridge: PokeHubBridge = {
  spawnAgent: (req: SpawnRequest) => ipcRenderer.invoke(IPC.spawnAgent, req),

  stopAgent: (agentId: string) =>
    ipcRenderer.send(IPC.stopAgent, { agentId }),

  worldSnapshot: () => ipcRenderer.invoke(IPC.worldSnapshot),

  onAgentEvent: (handler) => {
    const listener = (_e: unknown, event: PokeHubEvent) => handler(event);
    ipcRenderer.on(IPC.agentEvent, listener);
    return () => ipcRenderer.off(IPC.agentEvent, listener);
  },

  onPermissionAsk: (handler) => {
    const listener = (_e: unknown, envelope: PermissionAskEnvelope) =>
      handler(envelope);
    ipcRenderer.on(IPC.permissionAsk, listener);
    return () => ipcRenderer.off(IPC.permissionAsk, listener);
  },

  answerPermission: (answer: PermissionAnswer) =>
    ipcRenderer.send(IPC.permissionAnswer, answer),
};

contextBridge.exposeInMainWorld("pokehub", bridge);
