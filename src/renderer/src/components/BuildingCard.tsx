// One project in the town overview: its agents as status dots plus the
// "am I done?" tally. Click the card to zoom in, a dot to select that agent.

import type { KeyboardEvent } from "react";
import type { TownBuilding } from "../../../core/town.ts";
import { cx } from "../cx.ts";
import { StatusDot } from "./StatusDot.tsx";
import styles from "./BuildingCard.module.css";

interface BuildingCardProps {
  building: TownBuilding;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEnter: (project: string) => void;
}

export function BuildingCard({
  building,
  selectedId,
  onSelect,
  onEnter,
}: BuildingCardProps): JSX.Element {
  const { project, label, agents, needsAttention, busy, done } = building;
  const enter = (): void => onEnter(project);

  return (
    <div
      className={cx(styles.card, needsAttention > 0 && styles.attention)}
      role="button"
      tabIndex={0}
      title={project}
      onClick={enter}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") enter();
      }}
    >
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>{agents.length}</span>
      </div>

      <div className={styles.dots}>
        {agents.map((a) => (
          <StatusDot
            key={a.id}
            status={a.status}
            title={`${a.name} — ${a.status}`}
            selected={a.id === selectedId}
            onSelect={() => onSelect(a.id)}
          />
        ))}
      </div>

      <div className={styles.tally}>
        {needsAttention > 0 && <span className="status-blocked">{needsAttention} need you</span>}
        {busy > 0 && <span className="status-working">{busy} working</span>}
        {done > 0 && <span className={styles.done}>{done} done</span>}
      </div>
    </div>
  );
}
