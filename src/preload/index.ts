/**
 * Preload: the only bridge between renderer and main. Exposes a typed, minimal
 * surface on `window.pokehub` — no raw ipcRenderer, no Node in the renderer.
 */

import { contextBridge, ipcRenderer } from "electron";
import type { PokeHubEvent } from "../core/events.ts";
import {
  IPC,
  type FollowUpRequest,
  type PermissionAnswer,
  type PermissionAskEnvelope,
  type PokeHubBridge,
  type SpawnRequest,
} from "../shared/ipc.ts";

const bridge: PokeHubBridge = {
  spawnAgent: (req: SpawnRequest) => ipcRenderer.invoke(IPC.spawnAgent, req),

  stopAgent: (agentId: string) => ipcRenderer.send(IPC.stopAgent, { agentId }),

  followUpAgent: (req: FollowUpRequest) => ipcRenderer.invoke(IPC.followUpAgent, req),

  worldSnapshot: () => ipcRenderer.invoke(IPC.worldSnapshot),

  onAgentEvent: (handler) => {
    const listener = (_e: unknown, event: PokeHubEvent) => handler(event);
    ipcRenderer.on(IPC.agentEvent, listener);
    return () => ipcRenderer.off(IPC.agentEvent, listener);
  },

  onPermissionAsk: (handler) => {
    const listener = (_e: unknown, envelope: PermissionAskEnvelope) => {
      // Ack only after the handler takes it without throwing. A crashed React
      // tree (handler throws, or never registered) sends no ack, and main
      // fails the ask closed rather than leaving the agent blocked forever.
      handler(envelope);
      ipcRenderer.send(IPC.permissionAck, { id: envelope.id });
    };
    ipcRenderer.on(IPC.permissionAsk, listener);
    return () => ipcRenderer.off(IPC.permissionAsk, listener);
  },

  answerPermission: (answer: PermissionAnswer) => ipcRenderer.send(IPC.permissionAnswer, answer),
};

contextBridge.exposeInMainWorld("pokehub", bridge);
