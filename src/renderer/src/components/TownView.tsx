// The town zoom (VISION "Zoom levels" → Town): one card per project. Plain DOM,
// dashboard tier like the focus panel. Verified live via the stub.

import type { TownBuilding } from "../../../core/town.ts";
import { BuildingCard } from "./BuildingCard.tsx";
import styles from "./TownView.module.css";

interface TownViewProps {
  buildings: readonly TownBuilding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEnter: (project: string) => void;
}

export function TownView({ buildings, selectedId, onSelect, onEnter }: TownViewProps): JSX.Element {
  if (buildings.length === 0) {
    return <p className={styles.empty}>No agents yet. Spawn one above.</p>;
  }
  return (
    <div className={styles.town}>
      {buildings.map((b) => (
        <BuildingCard
          key={b.project}
          building={b}
          selectedId={selectedId}
          onSelect={onSelect}
          onEnter={onEnter}
        />
      ))}
    </div>
  );
}
