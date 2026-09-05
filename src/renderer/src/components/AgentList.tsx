/**
 * The "World" panel: one row per agent with its class, room, status, turn count
 * and a stop button. Clicking a row selects that agent (drives the focus panel,
 * the map highlight, follow-up mode). Pure render of world state.
 *
 * Not unit-tested — React render; verified live via the stub (PROGRESS.md).
 */

import { type CSSProperties } from "react";
import { agentColor } from "../../../core/text/agent-color.ts";
import type { AgentState } from "../../../core/world.ts";
import { cx } from "../cx.ts";
import styles from "./AgentList.module.css";

interface AgentListProps {
  agents: readonly AgentState[];
  maxSeqSeen: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AgentList({
  agents,
  maxSeqSeen,
  selectedId,
  onSelect,
}: AgentListProps): JSX.Element {
  return (
    <div className="panel">
      <h2>
        World — {agents.length} agents · seq {maxSeqSeen}
      </h2>
      {agents.map((a) => (
        <div
          className={cx(styles.agent, a.id === selectedId && styles.selected)}
          key={a.id}
          onClick={() => onSelect(a.id)}
          style={{ "--agent-color": agentColor(a.id) } as CSSProperties}
        >
          <strong className={styles.name}>{a.name}</strong> <span>({a.agentClass})</span>
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
      {agents.length === 0 && <p>No agents yet. Spawn one above.</p>}
    </div>
  );
}
