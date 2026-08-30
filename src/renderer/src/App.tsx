import { useEffect, useRef, useState } from "react";
import type { PokeHubEvent } from "../../core/events.ts";
import type { PermissionAskEnvelope } from "../../shared/ipc.ts";
import type { PermissionDecision } from "../../shared/permissions.ts";
import { knownClasses } from "../../core/classes.ts";
import { agentList } from "../../core/selectors.ts";
import { useWorld } from "./useWorld.ts";
import { WorldMap } from "./WorldMap.tsx";
import { AgentFocus } from "./AgentFocus.tsx";

const CLASSES = knownClasses();

export function App() {
  const { world, log } = useWorld();
  const [name, setName] = useState("Rowan");
  const [agentClass, setAgentClass] = useState(CLASSES[0] ?? "Builder");
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [askQueue, setAskQueue] = useState<PermissionAskEnvelope[]>([]);
  const [busy, setBusy] = useState(false);
  /** When set, the composer sends a follow-up turn to this agent instead of
   *  spawning a new one. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Re-entry guard: `busy` state only blocks re-entry after a re-render, which
  // can lose the race with a genuine double-click. This flips synchronously.
  const sending = useRef(false);

  useEffect(() => {
    if (!window.pokehub) return;
    // Queue asks — a second agent's encounter must not clobber the first.
    return window.pokehub.onPermissionAsk((envelope) =>
      setAskQueue((q) => [...q, envelope]),
    );
  }, []);

  const selected = selectedId ? world.agents[selectedId] : undefined;
  // Follow-up mode the moment an agent is selected — even before its
  // `agent.spawned` event has been reduced (main already holds the handle), so a
  // send in that gap resumes the session instead of spawning a second agent.
  // A known-exited agent can't take another turn, so fall back to spawning.
  const followMode = selectedId !== null && selected?.status !== "exited";

  const send = async () => {
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

  const answer = (decision: PermissionDecision) => {
    const head = askQueue[0];
    if (!head) return;
    window.pokehub.answerPermission({ id: head.id, decision });
    setAskQueue((q) => q.slice(1));
  };

  const ask = askQueue[0];
  const targetName = selected?.name ?? "agent";
  const sendLabel = busy
    ? followMode
      ? "sending…"
      : "spawning…"
    : followMode
      ? `send to ${targetName}`
      : "spawn agent";

  return (
    <div className="app">
      <div className="bar">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name"
          disabled={followMode}
        />
        <select
          value={agentClass}
          onChange={(e) => setAgentClass(e.target.value)}
          disabled={followMode}
        >
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="/absolute/repo/path"
          style={{ width: 260 }}
          disabled={followMode}
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            followMode ? `follow-up turn for ${targetName}…` : "task for the agent"
          }
        />
        <button onClick={send} disabled={busy}>
          {sendLabel}
        </button>
        {selectedId && (
          <button onClick={() => setSelectedId(null)} title="compose a new agent">
            + new
          </button>
        )}
      </div>

      {(notice || (selected && selected.status === "exited")) && (
        <div className="bar" style={{ marginTop: -4 }}>
          <span style={{ color: "#ffcf5c" }}>
            {notice ??
              `${selected!.name} has exited — sending will spawn a new agent`}
          </span>
        </div>
      )}

      <div className="left">
        <div className="panel map-panel">
          <h2>Map</h2>
          <WorldMap
            world={world}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className="panel">
          <h2>
            World — {agentList(world).length} agents · seq {world.maxSeqSeen}
          </h2>
          {agentList(world).map((a) => (
            <div
              className={`agent${a.id === selectedId ? " selected" : ""}`}
              key={a.id}
              onClick={() => setSelectedId(a.id)}
            >
              <strong>{a.name}</strong> <span>({a.agentClass})</span>
              {" — "}
              <span className="room">{a.location}</span>
              {" · "}
              <span className={`status-${a.status}`}>{a.status}</span>
              {a.promptCount > 1 && <span> · {a.promptCount} turns</span>}
              {a.status !== "exited" && (
                <button
                  style={{ marginLeft: 8, padding: "1px 8px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.pokehub.stopAgent(a.id);
                  }}
                >
                  stop
                </button>
              )}
              {a.activeTools.length > 0 && (
                <div>tools: {a.activeTools.map((t) => t.tool).join(", ")}</div>
              )}
              {a.thought && <div>💭 {a.thought}</div>}
              {a.status === "idle" && <div>✓ idle — send a follow-up turn</div>}
              {a.pendingPermissions[0] && (
                <div>⏸ awaiting: {a.pendingPermissions[0].tool}</div>
              )}
              {a.exitReason && <div>ended: {a.exitReason}</div>}
            </div>
          ))}
          {agentList(world).length === 0 && (
            <p>No agents yet. Spawn one above.</p>
          )}
        </div>
      </div>

      <div className="right">
        {selected && (
          <AgentFocus
            agent={selected}
            onClose={() => setSelectedId(null)}
          />
        )}
        <div className="panel raw-log">
          <h2>Raw event log</h2>
          {log.slice(-200).map((e) => (
            // (agentId, seq) is unique per agent and stable — no array index, or
            // every row's key shifts on each new event once the log passes 200.
            <div className="log-line" key={`${e.agentId}-${e.seq}`}>
              <span className="kind">
                {String(e.seq).padStart(3, "0")} {e.kind}
              </span>{" "}
              {summarize(e)}
            </div>
          ))}
        </div>
      </div>

      {ask && (
        <div className="encounter-backdrop">
          <div className="encounter">
            <h2>A wild {ask.ask.tool.toUpperCase()} appeared!</h2>
            <p>
              {ask.ask.agentName} —{" "}
              {ask.ask.title ?? `${ask.ask.tool} wants to run:`}
            </p>
            <pre>{JSON.stringify(ask.ask.input, null, 2)}</pre>
            <div className="actions">
              <button onClick={() => answer("allow_once")}>Allow once</button>
              {ask.ask.canRemember && (
                <button onClick={() => answer("allow_always")}>Always</button>
              )}
              <button onClick={() => answer("refuse")}>Refuse</button>
            </div>
            {askQueue.length > 1 && (
              <p style={{ opacity: 0.6 }}>
                {askQueue.length - 1} more waiting
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function summarize(e: PokeHubEvent): string {
  switch (e.kind) {
    case "tool.started":
      return `${e.tool} ${JSON.stringify(e.input)}`;
    case "tool.finished":
      return e.ok ? (e.summary ?? "ok") : `ERROR ${e.summary ?? ""}`;
    case "agent.thinking":
      return e.thought ?? "";
    case "agent.message":
      return firstLine(e.text);
    case "agent.prompt":
      return `“${firstLine(e.text)}”`;
    case "agent.turn_finished":
      return "idle — awaiting follow-up";
    case "session.compacted":
      return e.trigger ?? "";
    case "permission.requested":
      return e.tool;
    case "permission.resolved":
      return e.decision;
    case "agent.exited":
      return e.reason ? `${e.reason} (code ${e.code})` : `code ${e.code}`;
    case "agent.spawned":
      return `${e.name} in ${e.cwd}`;
    default:
      return "";
  }
}

/** The literal first line, clipped — the raw log shows what the event actually
 *  carries, not a prettified form of it (VISION: the raw stream stays faithful). */
function firstLine(text: string): string {
  const line = text.trim().split("\n", 1)[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}
