// Maps a tool-use id back to the sprite that made the call — the session root,
// or a subagent. The SDK's `canUseTool` callback passes only the tool-use id;
// `translate` has already attributed every `tool.started` to the right sprite,
// so indexing those drafts as they're logged is enough.

import type { PokeHubEvent } from "../core/events.ts";

export interface Owner {
  readonly id: string;
  readonly name: string;
}

export interface ToolCallOwners {
  /** Feed every event as it is appended to the log. */
  track: (event: PokeHubEvent) => void;
  /** The sprite that made `toolUseId`; the root when it isn't a subagent's. */
  resolve: (toolUseId: string) => Owner;
}

export function toolCallOwners(rootId: string, rootName: string): ToolCallOwners {
  const spriteByToolCall = new Map<string, string>();
  const nameBySprite = new Map<string, string>([[rootId, rootName]]);
  const root: Owner = { id: rootId, name: rootName };

  return {
    track(event) {
      if (event.kind === "tool.started") spriteByToolCall.set(event.toolCallId, event.agentId);
      else if (event.kind === "agent.spawned") nameBySprite.set(event.agentId, event.name);
    },
    resolve(toolUseId) {
      const id = spriteByToolCall.get(toolUseId);
      if (id === undefined || id === rootId) return root;
      return { id, name: nameBySprite.get(id) ?? rootName };
    },
  };
}
