/**
 * The agent-focus zoom — VISION's "one agent, full detail" level. Reads a single
 * `AgentState` (built by the pure reducer) and shows the conversation so far,
 * a recent-tools trail, and an HP-bar placeholder for context-window remaining.
 *
 * It is a projection: everything here comes from `world.agents[id]`, nothing is
 * fetched or stored. The transcript is `agent.prompt` + `agent.message` events
 * folded by the reducer, so a reload rebuilds it from the log.
 */

import type { AgentState, RecentTool } from "../../core/world.ts";
import { Markdown } from "./Markdown.tsx";

export function AgentFocus({
  agent,
  onClose,
}: {
  agent: AgentState;
  onClose: () => void;
}): JSX.Element {
  const turns = agent.transcript;

  return (
    <div className="panel focus-panel">
      <div className="focus-head">
        <h2>
          {agent.name} · {agent.agentClass} ·{" "}
          <span className={`status-${agent.status}`}>{agent.status}</span>
        </h2>
        <button onClick={onClose} title="close the focus view">
          ✕
        </button>
      </div>

      <div className="focus-meta">
        <span className="room">📍 {agent.location}</span>
        <span>·</span>
        <span>
          {agent.promptCount} turn{agent.promptCount === 1 ? "" : "s"}
        </span>
        {agent.sessionId && (
          <>
            <span>·</span>
            <span title={agent.sessionId}>
              session {agent.sessionId.slice(0, 8)}
            </span>
          </>
        )}
      </div>

      {/* HP bar — context window remaining (VISION "Reading state at a glance").
          No real number yet: `session.compacted` is captured but not turned into
          a percentage. Rendered as an explicit placeholder, not a full bar that
          could be mistaken for "100% left". */}
      <div className="hp">
        <div className="hp-label">HP · context remaining</div>
        <div className="hp-track hp-track--empty" />
        <div className="hp-note">not yet measured</div>
      </div>

      <div className="focus-tools">
        <div className="focus-tools-head">
          <strong>recent tools</strong>
          {agent.pendingPermissions[0] && (
            <span className="status-blocked">
              ⏸ awaiting {agent.pendingPermissions[0].tool}
            </span>
          )}
        </div>
        {agent.recentTools.length === 0 ? (
          <span className="muted">nothing yet</span>
        ) : (
          <ol className="tool-trail">
            {agent.recentTools
              .slice()
              .reverse()
              .map((t) => (
                <li key={t.toolCallId} className={toolClass(t)}>
                  <span className="tool-dot">{toolMark(t)}</span>
                  <span className="tool-name">{t.tool}</span>
                  {t.target && <span className="tool-target">{t.target}</span>}
                </li>
              ))}
          </ol>
        )}
      </div>

      <div className="transcript">
        {agent.transcriptDropped > 0 && (
          <p className="muted">
            {agent.transcriptDropped} earlier turn
            {agent.transcriptDropped === 1 ? "" : "s"} — in the log, not shown
          </p>
        )}
        {turns.length === 0 && <p className="muted">No conversation yet.</p>}
        {turns.map((t) => (
          <div className={`turn turn-${t.role}`} key={t.seq}>
            <div className="turn-role">{t.role === "user" ? "you" : agent.name}</div>
            {t.role === "assistant" ? (
              <Markdown text={t.text} />
            ) : (
              <div className="turn-text">{t.text}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** In-flight = a hollow ring; done = ✓ / ✕. */
function toolMark(t: RecentTool): string {
  if (t.ok === null) return "◌";
  return t.ok ? "✓" : "✕";
}

function toolClass(t: RecentTool): string {
  if (t.ok === null) return "tool tool-active";
  return t.ok ? "tool tool-ok" : "tool tool-bad";
}
