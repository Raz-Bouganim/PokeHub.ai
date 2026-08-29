import { useEffect, useState } from "react";
import type { PokeHubEvent } from "../../core/events.ts";
import type { PermissionAskEnvelope } from "../../shared/ipc.ts";
import type { PermissionDecision } from "../../shared/permissions.ts";
import { knownClasses } from "../../core/classes.ts";
import { agentList } from "../../core/selectors.ts";
import { useWorld } from "./useWorld.ts";

const CLASSES = knownClasses();

export function App() {
  const { world, log } = useWorld();
  const [name, setName] = useState("Rowan");
  const [agentClass, setAgentClass] = useState(CLASSES[0] ?? "Builder");
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [askQueue, setAskQueue] = useState<PermissionAskEnvelope[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Queue asks — a second agent's encounter must not clobber the first.
    return window.pokehub.onPermissionAsk((envelope) =>
      setAskQueue((q) => [...q, envelope]),
    );
  }, []);

  const spawn = async () => {
    if (!cwd || !prompt) return;
    setBusy(true);
    try {
      await window.pokehub.spawnAgent({ name, agentClass, cwd, prompt });
      setPrompt("");
    } finally {
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

  return (
    <div className="app">
      <div className="bar">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
        <select value={agentClass} onChange={(e) => setAgentClass(e.target.value)}>
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
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="task for the agent"
        />
        <button onClick={spawn} disabled={busy}>
          {busy ? "spawning…" : "spawn agent"}
        </button>
      </div>

      <div className="panel">
        <h2>
          World — {agentList(world).length} agents · seq {world.maxSeqSeen}
        </h2>
        {agentList(world).map((a) => (
          <div className="agent" key={a.id}>
            <strong>{a.name}</strong> <span>({a.agentClass})</span>
            {" — "}
            <span className="room">{a.location}</span>
            {" · "}
            <span className={`status-${a.status}`}>{a.status}</span>
            {a.status !== "exited" && (
              <button
                style={{ marginLeft: 8, padding: "1px 8px" }}
                onClick={() => window.pokehub.stopAgent(a.id)}
              >
                stop
              </button>
            )}
            {a.activeTools.length > 0 && (
              <div>tools: {a.activeTools.map((t) => t.tool).join(", ")}</div>
            )}
            {a.thought && <div>💭 {a.thought}</div>}
            {a.pendingPermissions[0] && (
              <div>⏸ awaiting: {a.pendingPermissions[0].tool}</div>
            )}
            {a.exitReason && <div>ended: {a.exitReason}</div>}
          </div>
        ))}
        {agentList(world).length === 0 && <p>No agents yet. Spawn one above.</p>}
      </div>

      <div className="panel">
        <h2>Raw event log</h2>
        {log.slice(-200).map((e, i) => (
          <div className="log-line" key={`${e.agentId}-${e.seq}-${i}`}>
            <span className="kind">
              {String(e.seq).padStart(3, "0")} {e.kind}
            </span>{" "}
            {summarize(e)}
          </div>
        ))}
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
