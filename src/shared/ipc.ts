/**
 * The main <-> renderer contract. Shared by both sides so the channel names and
 * payloads stay in one place.
 */

import type { PokeHubEvent } from "../core/events.ts";
import type { PermissionAsk, PermissionDecision } from "./permissions.ts";

export type { PermissionAsk, PermissionDecision };

export interface SpawnRequest {
  name: string;
  agentClass: string;
  cwd: string;
  prompt: string;
}

export interface SpawnResult {
  agentId: string;
  logPath: string;
}

/** A permission ask, tagged with a correlation id the renderer echoes back. */
export interface PermissionAskEnvelope {
  id: string;
  ask: PermissionAsk;
}

export interface PermissionAnswer {
  id: string;
  decision: PermissionDecision;
}

export interface StopAgentRequest {
  agentId: string;
}

export const IPC = {
  /** renderer -> main, invoke */
  spawnAgent: "agent:spawn",
  /** renderer -> main, send: StopAgentRequest */
  stopAgent: "agent:stop",
  /** renderer -> main, invoke: returns every event from every known session log */
  worldSnapshot: "world:snapshot",
  /** main -> renderer, send: one PokeHubEvent */
  agentEvent: "agent:event",
  /** main -> renderer, send: PermissionAskEnvelope */
  permissionAsk: "permission:ask",
  /** renderer -> main, send: { id } — "I received and displayed this ask".
   *  Sent by the preload the moment a handler accepts the envelope without
   *  throwing. Its absence within the deadline tells main the renderer is not
   *  fit to answer (crashed React, no listener) so the ask fails closed. */
  permissionAck: "permission:ack",
  /** renderer -> main, send: PermissionAnswer */
  permissionAnswer: "permission:answer",
} as const;

/** Shape exposed on `window.pokehub` by the preload script. */
export interface PokeHubBridge {
  spawnAgent(req: SpawnRequest): Promise<SpawnResult>;
  stopAgent(agentId: string): void;
  /** Replay source: fold this through the reducer on mount so the world
   *  survives a renderer reload. */
  worldSnapshot(): Promise<PokeHubEvent[]>;
  onAgentEvent(handler: (event: PokeHubEvent) => void): () => void;
  onPermissionAsk(handler: (envelope: PermissionAskEnvelope) => void): () => void;
  answerPermission(answer: PermissionAnswer): void;
}
