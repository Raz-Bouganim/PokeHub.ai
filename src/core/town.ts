// The town overview: agents grouped into buildings by project, for the
// "am I done?" glance (VISION "Town"). A building is derived, never stored.

import { agentList } from "./selectors.ts";
import type { AgentState, WorldState } from "./world.ts";

export interface TownBuilding {
  /** Group key — the agents' shared `cwd`. `""` only briefly, pre-`agent.spawned`. */
  readonly project: string;
  /** Last path segment of `project`, or "unknown". */
  readonly label: string;
  readonly agents: readonly AgentState[];
  /** Blocked or erroring — waiting on you. */
  readonly needsAttention: number;
  /** Spawning, thinking, working. */
  readonly busy: number;
  /** Idle or exited — nothing more will happen without you. */
  readonly done: number;
}

function projectLabel(project: string): string {
  const parts = project.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) ?? "unknown";
}

/** One `TownBuilding` per distinct `cwd`, in first-seen order. */
export function townBuildings(world: WorldState): TownBuilding[] {
  const groups = new Map<string, AgentState[]>();
  for (const a of agentList(world)) {
    const arr = groups.get(a.cwd) ?? [];
    arr.push(a);
    groups.set(a.cwd, arr);
  }

  return [...groups].map(([project, agents]) => {
    let needsAttention = 0;
    let busy = 0;
    let done = 0;
    for (const a of agents) {
      if (a.status === "blocked" || a.status === "erroring") needsAttention += 1;
      else if (a.status === "idle" || a.status === "exited") done += 1;
      else busy += 1;
    }
    return { project, label: projectLabel(project), agents, needsAttention, busy, done };
  });
}
