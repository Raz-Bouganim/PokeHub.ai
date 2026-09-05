/**
 * The app shell: composer bar, the map + agent-list panels, the focus panel,
 * the raw-log panel, and the encounter modal. Reads world state from `useWorld`
 * and drives everything else through `window.pokehub`.
 *
 * Not unit-tested — React render; verified live via the stub (PROGRESS.md).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { knownClasses } from "../../core/agent-class/registry.ts";
import type { PokeHubEvent } from "../../core/events.ts";
import { agentList } from "../../core/selectors.ts";
import { agentColor } from "../../core/text/agent-color.ts";
import type { PermissionAskEnvelope } from "../../shared/ipc.ts";
import type { PermissionDecision } from "../../shared/permissions.ts";
import { AgentFocus } from "./AgentFocus.tsx";
import styles from "./App.module.css";
import { cx } from "./cx.ts";
import { useWorld } from "./use-world.ts";
import { WorldMap } from "./WorldMap.tsx";

const CLASSES = knownClasses();

/** CSS custom property carrying an agent's identity colour to its stylesheet. */
function agentColorVar(agentId: string): CSSProperties {
  return { "--agent-color": agentColor(agentId) } as CSSProperties;
}

export function App(): JSX.Element {
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
  const [logFilterOn, setLogFilterOn] = useState(false);
  // Re-entry guard: `busy` state only blocks re-entry after a re-render, which
  // can lose the race with a genuine double-click. This flips synchronously.
  const sending = useRef(false);

  useEffect(() => {
    if (!window.pokehub) return;
    // Queue asks — a second agent's encounter must not clobber the first.
    return window.pokehub.onPermissionAsk((envelope) => setAskQueue((q) => [...q, envelope]));
  }, []);

  const selected = selectedId ? world.agents[selectedId] : undefined;
  // Follow-up mode the moment an agent is selected — even before its
  // `agent.spawned` event has been reduced (main already holds the handle), so a
  // send in that gap resumes the session instead of spawning a second agent.
  // A known-exited agent can't take another turn, so fall back to spawning.
  const followMode = selectedId !== null && selected?.status !== "exited";

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

  const answer = (decision: PermissionDecision): void => {
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
    <div className={styles.app}>
      <div className={styles.bar}>
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
          className={styles.cwdInput}
          disabled={followMode}
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={followMode ? `follow-up turn for ${targetName}…` : "task for the agent"}
        />
        <button onClick={() => void send()} disabled={busy}>
          {sendLabel}
        </button>
        {selectedId && (
          <button onClick={() => setSelectedId(null)} title="compose a new agent">
            + new
          </button>
        )}
      </div>

      {(notice !== null || selected?.status === "exited") && (
        <div className={styles.notice}>
          <span className={styles.noticeText}>
            {notice ??
              `${selected?.name ?? "the agent"} has exited — sending will spawn a new agent`}
          </span>
        </div>
      )}

      <div className={styles.left}>
        <div className={cx("panel", styles.mapPanel)}>
          <h2>Map</h2>
          <WorldMap world={world} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="panel">
          <h2>
            World — {agentList(world).length} agents · seq {world.maxSeqSeen}
          </h2>
          {agentList(world).map((a) => (
            <div
              className={cx(styles.agent, a.id === selectedId && styles.selected)}
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              style={agentColorVar(a.id)}
            >
              <strong className={styles.agentName}>{a.name}</strong> <span>({a.agentClass})</span>
              {" — "}
              <span className="room">{a.location}</span>
              {" · "}
              <span className={`status-${a.status}`}>{a.status}</span>
              {a.promptCount > 1 && <span> · {a.promptCount} turns</span>}
              {a.status !== "exited" && (
                <button
                  className={styles.stopBtn}
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
              {a.pendingPermissions[0] && <div>⏸ awaiting: {a.pendingPermissions[0].tool}</div>}
              {a.exitReason && <div>ended: {a.exitReason}</div>}
            </div>
          ))}
          {agentList(world).length === 0 && <p>No agents yet. Spawn one above.</p>}
        </div>
      </div>

      <div className={styles.right}>
        {selected && <AgentFocus agent={selected} onClose={() => setSelectedId(null)} />}
        <div className={cx("panel", styles.rawLog)}>
          <div className={styles.rawLogHead}>
            <h2>Raw event log</h2>
            {selectedId && (
              <label className={styles.rawLogFilter}>
                <input
                  type="checkbox"
                  checked={logFilterOn}
                  onChange={(e) => setLogFilterOn(e.target.checked)}
                />
                only {selected?.name ?? "this agent"}
              </label>
            )}
          </div>
          {(logFilterOn && selectedId ? log.filter((e) => e.agentId === selectedId) : log)
            .slice(-200)
            .map((e) => (
              // (agentId, seq) is unique per agent and stable — no array index,
              // or every row's key shifts once the log passes 200.
              <div
                className={styles.logLine}
                key={`${e.agentId}-${e.seq}`}
                style={agentColorVar(e.agentId)}
              >
                <span className={styles.logAgent}>
                  {world.agents[e.agentId]?.name ?? e.agentId.slice(0, 6)}
                </span>{" "}
                <span className={styles.kind}>
                  {String(e.seq).padStart(3, "0")} {e.kind}
                </span>{" "}
                {summarize(e)}
              </div>
            ))}
        </div>
      </div>

      {ask && (
        <div className={styles.encounterBackdrop}>
          <div className={styles.encounter}>
            <h2>A wild {ask.ask.tool.toUpperCase()} appeared!</h2>
            <p>
              {ask.ask.agentName} — {ask.ask.title ?? `${ask.ask.tool} wants to run:`}
            </p>
            <pre>{JSON.stringify(ask.ask.input, null, 2)}</pre>
            <div className={styles.actions}>
              <button onClick={() => answer("allow_once")}>Allow once</button>
              {ask.ask.canRemember && (
                <button onClick={() => answer("allow_always")}>Always</button>
              )}
              <button onClick={() => answer("refuse")}>Refuse</button>
            </div>
            {askQueue.length > 1 && (
              <p className={styles.moreWaiting}>{askQueue.length - 1} more waiting</p>
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
