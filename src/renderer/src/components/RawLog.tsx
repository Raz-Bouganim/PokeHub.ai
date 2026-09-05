/**
 * The raw event log — VISION's escape hatch: the unvarnished stream, one
 * keypress away, always. Shows every event as it actually was, colour-tagged by
 * agent, with an optional "only <selected agent>" filter.
 *
 * `summarize` here is deliberately literal — it does NOT go through
 * `bubbleLine`; the raw stream must stay faithful to what the event carries.
 *
 * Not unit-tested — React render; verified live via the stub (PROGRESS.md).
 */

import { type CSSProperties, useState } from "react";
import type { PokeHubEvent } from "../../../core/events.ts";
import { agentColor } from "../../../core/text/agent-color.ts";
import type { AgentState } from "../../../core/world.ts";
import { cx } from "../cx.ts";
import styles from "./RawLog.module.css";

interface RawLogProps {
  log: readonly PokeHubEvent[];
  agents: Readonly<Record<string, AgentState>>;
  selectedId: string | null;
  /** Display name of the selected agent, for the filter label. */
  selectedName: string | undefined;
}

export function RawLog({ log, agents, selectedId, selectedName }: RawLogProps): JSX.Element {
  const [filterOn, setFilterOn] = useState(false);

  const rows = (filterOn && selectedId ? log.filter((e) => e.agentId === selectedId) : log).slice(
    -200,
  );

  return (
    <div className={cx("panel", styles.rawLog)}>
      <div className={styles.head}>
        <h2>Raw event log</h2>
        {selectedId && (
          <label className={styles.filter}>
            <input
              type="checkbox"
              checked={filterOn}
              onChange={(e) => setFilterOn(e.target.checked)}
            />
            only {selectedName ?? "this agent"}
          </label>
        )}
      </div>
      {rows.map((e) => (
        // (agentId, seq) is unique per agent and stable — no array index, or
        // every row's key shifts once the log passes 200.
        <div
          className={styles.line}
          key={`${e.agentId}-${e.seq}`}
          style={{ "--agent-color": agentColor(e.agentId) } as CSSProperties}
        >
          <span className={styles.agent}>{agents[e.agentId]?.name ?? e.agentId.slice(0, 6)}</span>{" "}
          <span className={styles.kind}>
            {String(e.seq).padStart(3, "0")} {e.kind}
          </span>{" "}
          {summarize(e)}
        </div>
      ))}
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

function firstLine(text: string): string {
  const line = text.trim().split("\n", 1)[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}
