// The map's zoom level: the town overview vs. one project's rooms. The town is
// derived each render; the only state is which building you've stepped into.
// One project (or none) has no town — the view stays "building".

import { useState } from "react";
import { townBuildings, type TownBuilding } from "../../../core/town.ts";
import type { WorldState } from "../../../core/world.ts";

export interface MapZoom {
  view: "town" | "building";
  buildings: TownBuilding[];
  /** The building shown in "building" view, or null for the whole world. */
  focused: TownBuilding | null;
  enter: (project: string) => void;
  back: () => void;
}

export function useMapZoom(world: WorldState): MapZoom {
  const [project, setProject] = useState<string | null>(null);
  const buildings = townBuildings(world);
  const multi = buildings.length > 1;
  const focused =
    multi && project !== null ? (buildings.find((b) => b.project === project) ?? null) : null;

  return {
    view: !multi || focused !== null ? "building" : "town",
    buildings,
    focused,
    enter: setProject,
    back: () => setProject(null),
  };
}
