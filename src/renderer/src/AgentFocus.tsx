/**
 * The agent-focus zoom — VISION's "one agent, full detail" level. Reads a single
 * `AgentState` (built by the pure reducer) and shows the conversation so far,
 * a recent-tools trail, and an HP-bar placeholder for context-window remaining.
 *
 * It is a projection: everything here comes from `world.agents[id]`, nothing is
 * fetched or stored. The transcript is `agent.prompt` + `agent.message` events
 * folded by the reducer, so a reload rebuilds it from the log.
 *
 * Not unit-tested — React render; verified live via the stub (PROGRESS.md).
 */

import { useState } from "react";
import type { AgentState, JournalEntry, RecentTool } from "../../core/world.ts";
import styles from "./AgentFocus.module.css";
import { cx } from "./cx.ts";
import { Markdown } from "./Markdown.tsx";

interface AgentFocusProps {
  agent: AgentState;
  onClose: () => void;
}

export function AgentFocus({ agent, onClose }: AgentFocusProps): JSX.Element {
  const turns = agent.transcript;
  const [tab, setTab] = useState<"conversation" | "journal">("conversation");

  return (
    <div className={cx("panel", styles.focusPanel)}>
      <div className={styles.focusHead}>
        <h2>
          {agent.name} · {agent.agentClass} ·{" "}
          <span className={`status-${agent.status}`}>{agent.status}</span>
        </h2>
        <button onClick={onClose} title="close the focus view">
          ✕
        </button>
      </div>

      <div className={styles.focusMeta}>
        <span className="room">📍 {agent.location}</span>
        <span>·</span>
        <span>
          {agent.promptCount} turn{agent.promptCount === 1 ? "" : "s"}
        </span>
        {agent.sessionId && (
          <>
            <span>·</span>
            <span title={agent.sessionId}>session {agent.sessionId.slice(0, 8)}</span>
          </>
        )}
      </div>

      {/* HP bar — context window remaining (VISION "Reading state at a glance").
          No real number yet: `session.compacted` is captured but not turned into
          a percentage. Rendered as an explicit placeholder, not a full bar that
          could be mistaken for "100% left". */}
      <div className={styles.hp}>
        <div className={styles.hpLabel}>HP · context remaining</div>
        <div className={cx(styles.hpTrack, styles.hpTrackEmpty)} />
        <div className={styles.hpNote}>not yet measured</div>
      </div>

      <div className={styles.focusTools}>
        <div className={styles.focusToolsHead}>
          <strong>recent tools</strong>
          {agent.pendingPermissions[0] && (
            <span className="status-blocked">⏸ awaiting {agent.pendingPermissions[0].tool}</span>
          )}
        </div>
        {agent.recentTools.length === 0 ? (
          <span className={styles.muted}>nothing yet</span>
        ) : (
          <ol className={styles.toolTrail}>
            {agent.recentTools
              .slice()
              .reverse()
              .map((t) => (
                <li key={t.toolCallId} className={toolClass(t)}>
                  <span className={styles.toolDot}>{toolMark(t)}</span>
                  <span className={styles.toolName}>{t.tool}</span>
                  {t.target && <span className={styles.toolTarget}>{t.target}</span>}
                </li>
              ))}
          </ol>
        )}
      </div>

      <div className={styles.focusTabs}>
        <button
          className={tab === "conversation" ? styles.tabActive : ""}
          onClick={() => setTab("conversation")}
        >
          conversation
        </button>
        <button
          className={tab === "journal" ? styles.tabActive : ""}
          onClick={() => setTab("journal")}
        >
          journal{agent.journal.length > 0 ? ` (${agent.journal.length})` : ""}
        </button>
      </div>

      {tab === "conversation" ? (
        <div className={styles.transcript}>
          {agent.transcriptDropped > 0 && (
            <p className={styles.muted}>
              {agent.transcriptDropped} earlier turn
              {agent.transcriptDropped === 1 ? "" : "s"} — in the log, not shown
            </p>
          )}
          {turns.length === 0 && <p className={styles.muted}>No conversation yet.</p>}
          {turns.map((t) => (
            <div className={cx(styles.turn, t.role === "user" && styles.turnUser)} key={t.seq}>
              <div className={styles.turnRole}>{t.role === "user" ? "you" : agent.name}</div>
              {t.role === "assistant" ? (
                <Markdown text={t.text} />
              ) : (
                <div className={styles.turnText}>{t.text}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Journal entries={agent.journal} exited={agent.status === "exited"} />
      )}
    </div>
  );
}

/** The unbounded, grouped-by-turn record of every tool call — VISION's
 *  "files read vs. modified must be visually distinct" journal. Groups are
 *  labelled by turn number (`JournalEntry.turn`, the real `promptCount` at
 *  call time). Sorted ascending explicitly rather than trusting `Map`
 *  insertion order to stay turn-ascending forever. `exited` tells an entry
 *  still `ok: null` apart from one genuinely in flight: the agent is gone, so
 *  a `tool.finished` for it will never arrive — that is not the same fact as
 *  "still running" and must not render as a live spinner. */
function Journal({
  entries,
  exited,
}: {
  entries: readonly JournalEntry[];
  exited: boolean;
}): JSX.Element {
  if (entries.length === 0) return <p className={styles.muted}>Nothing yet.</p>;

  const byTurn = new Map<number, JournalEntry[]>();
  for (const e of entries) {
    const group = byTurn.get(e.turn);
    if (group) group.push(e);
    else byTurn.set(e.turn, [e]);
  }
  const turns = [...byTurn.entries()].sort(([a], [b]) => a - b);

  return (
    <div className={styles.journal}>
      {turns.map(([turn, group]) => (
        <div className={styles.journalTurn} key={turn}>
          <div className={styles.journalTurnHead}>turn {turn}</div>
          <ol className={styles.journalList}>
            {group.map((j) => {
              const abandoned = j.ok === null && exited;
              return (
                <li
                  key={j.toolCallId}
                  className={cx(
                    styles.journalEntry,
                    journalKindClass(j.kind),
                    stateClass(j.ok, abandoned),
                  )}
                >
                  <span className={styles.toolDot}>{stateMark(j.ok, abandoned)}</span>
                  <span className={styles.toolName}>{j.tool}</span>
                  {j.target && <span className={styles.toolTarget}>{j.target}</span>}
                  {j.summary && <span className={styles.journalSummary}>{j.summary}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function journalKindClass(kind: JournalEntry["kind"]): string | undefined {
  if (kind === "read") return styles.journalRead;
  if (kind === "write") return styles.journalWrite;
  return styles.journalOther;
}

/** In-flight = a hollow ring, done = ✓ / ✕ — shared by the recent-tools trail
 *  and the journal so the two views can't drift into different glyphs/colours
 *  for the same fact. `abandoned` is the one state unique to the journal: the
 *  owning agent exited before a `tool.finished` arrived, so `ok: null` means
 *  "will never be known," not "in flight." */
function stateMark(ok: boolean | null, abandoned = false): string {
  if (ok === null) return abandoned ? "⋯" : "◌";
  return ok ? "✓" : "✕";
}

function stateClass(ok: boolean | null, abandoned = false): string | undefined {
  if (ok === null) return abandoned ? styles.toolUnresolved : styles.toolActive;
  return ok ? styles.toolOk : styles.toolBad;
}

function toolMark(t: RecentTool): string {
  return stateMark(t.ok);
}

function toolClass(t: RecentTool): string {
  return cx(styles.tool, stateClass(t.ok));
}
