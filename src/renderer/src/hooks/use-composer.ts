/**
 * All composer state and the send flow: the four form fields, whether the next
 * send spawns a new agent or resumes the selected one, the busy/notice
 * feedback, and the double-click re-entry guard. The `Composer` component is a
 * pure render of what this returns.
 */

import { useRef, useState } from "react";
import { knownClasses } from "../../../core/agent-class/registry.ts";
import type { WorldState } from "../../../core/world.ts";

const CLASSES = knownClasses();

export interface Composer {
  classes: readonly string[];
  name: string;
  agentClass: string;
  cwd: string;
  prompt: string;
  setName: (v: string) => void;
  setAgentClass: (v: string) => void;
  setCwd: (v: string) => void;
  setPrompt: (v: string) => void;
  /** True when a send resumes the selected agent instead of spawning. */
  followMode: boolean;
  /** Display name of the follow-up target. */
  targetName: string;
  busy: boolean;
  /** A one-line message to show under the bar — a rejected follow-up, a missing
   *  cwd, or "the selected agent has exited" — or `null`. */
  notice: string | null;
  /** The send button's label for the current mode/state. */
  sendLabel: string;
  send: () => Promise<void>;
  /** Leave follow-up mode and compose a fresh agent. */
  clearSelection: () => void;
}

/**
 * @param world       - current world state (for the follow-up target's name)
 * @param selectedId  - the selected agent id, or null
 * @param setSelectedId - selection setter (a spawn targets the new agent)
 * @returns the composer view model
 */
export function useComposer(
  world: WorldState,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
): Composer {
  const [name, setName] = useState("Rowan");
  const [agentClass, setAgentClass] = useState(CLASSES[0] ?? "Builder");
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Re-entry guard: `busy` state only blocks re-entry after a re-render, which
  // can lose the race with a genuine double-click. This flips synchronously.
  const sending = useRef(false);

  const selected = selectedId ? world.agents[selectedId] : undefined;
  // Follow-up mode the moment an agent is selected — even before its
  // `agent.spawned` event has been reduced (main already holds the handle), so a
  // send in that gap resumes the session instead of spawning a second agent.
  // A known-exited agent can't take another turn, so fall back to spawning.
  const followMode = selectedId !== null && selected?.status !== "exited";
  const targetName = selected?.name ?? "agent";

  const send = async (): Promise<void> => {
    if (!prompt.trim() || sending.current) return;
    sending.current = true;
    setNotice(null);
    setBusy(true);
    try {
      if (followMode && selectedId) {
        const res = await window.pokehub.followUpAgent({
          agentId: selectedId,
          text: prompt,
        });
        if (res.ok) setPrompt("");
        else setNotice(res.reason ?? "the follow-up was rejected");
        return;
      }
      if (!cwd) {
        setNotice("a repo path is required to spawn an agent");
        return;
      }
      const { agentId } = await window.pokehub.spawnAgent({
        name,
        agentClass,
        cwd,
        prompt,
      });
      setPrompt("");
      // Target the new agent so the next turn continues its session.
      setSelectedId(agentId);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const sendLabel = busy
    ? followMode
      ? "sending…"
      : "spawning…"
    : followMode
      ? `send to ${targetName}`
      : "spawn agent";

  const exitedNotice =
    selected?.status === "exited"
      ? `${selected.name} has exited — sending will spawn a new agent`
      : null;

  return {
    classes: CLASSES,
    name,
    agentClass,
    cwd,
    prompt,
    setName,
    setAgentClass,
    setCwd,
    setPrompt,
    followMode,
    targetName,
    busy,
    notice: notice ?? exitedNotice,
    sendLabel,
    send,
    clearSelection: () => {
      setSelectedId(null);
    },
  };
}
