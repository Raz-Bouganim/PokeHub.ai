// The map panel: the town/building zoom, its breadcrumb, and the back control.
// WorldMap stays mounted across the toggle — Pixi init/destroy is fragile
// (PROGRESS gotchas). Verified live via the stub.

import type { WorldState } from "../../../core/world.ts";
import { cx } from "../cx.ts";
import { useMapZoom } from "../hooks/use-map-zoom.ts";
import { TownView } from "./TownView.tsx";
import { WorldMap } from "./WorldMap.tsx";
import styles from "./MapPanel.module.css";

interface MapPanelProps {
  world: WorldState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MapPanel({ world, selectedId, onSelect }: MapPanelProps): JSX.Element {
  const map = useMapZoom(world);
  const title = map.view === "town" ? "Town" : map.focused ? `Town / ${map.focused.label}` : "Map";

  return (
    <div className={cx("panel", styles.panel)}>
      <div className={styles.header}>
        <h2>{title}</h2>
        {map.focused && (
          <button className={styles.back} onClick={map.back}>
            ← town
          </button>
        )}
      </div>

      <div hidden={map.view !== "town"}>
        <TownView
          buildings={map.buildings}
          selectedId={selectedId}
          onSelect={onSelect}
          onEnter={map.enter}
        />
      </div>
      <div hidden={map.view !== "building"}>
        <WorldMap
          world={world}
          selectedId={selectedId}
          onSelect={onSelect}
          focusedProject={map.focused?.project ?? null}
        />
      </div>
    </div>
  );
}
