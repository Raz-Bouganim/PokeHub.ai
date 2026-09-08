import { describe, expect, it } from "vitest";
import type { PokeHubEvent } from "../events.ts";
import { reduce } from "../reducer.ts";
import { townBuildings } from "../town.ts";
import { initialWorld, type WorldState } from "../world.ts";

function ev(
  fields: { seq: number; agentId: string; kind: PokeHubEvent["kind"] } & Record<string, unknown>,
): PokeHubEvent {
  return {
    v: 1,
    ts: `2026-09-08T10:00:${String(fields.seq).padStart(2, "0")}.000Z`,
    source: "agent",
    sessionId: null,
    ...fields,
  } as unknown as PokeHubEvent;
}

function spawn(
  seq: number,
  id: string,
  cwd: string,
  extra: Record<string, unknown> = {},
): PokeHubEvent {
  return ev({
    seq,
    agentId: id,
    kind: "agent.spawned",
    name: id,
    agentClass: "Builder",
    cwd,
    ...extra,
  });
}

function world(...events: PokeHubEvent[]): WorldState {
  let w = initialWorld();
  for (const e of events) w = reduce(w, e);
  return w;
}

describe("townBuildings", () => {
  it("is empty for an empty world", () => {
    expect(townBuildings(initialWorld())).toEqual([]);
  });

  it("groups by cwd, one building each, first-seen order", () => {
    const buildings = townBuildings(
      world(
        spawn(1, "a", "/code/cal-api"),
        spawn(1, "b", "/code/cal-web"),
        spawn(1, "c", "/code/cal-api"),
      ),
    );
    expect(buildings.map((b) => b.project)).toEqual(["/code/cal-api", "/code/cal-web"]);
    expect(buildings[0]!.agents.map((a) => a.id)).toEqual(["a", "c"]);
    expect(buildings[1]!.agents.map((a) => a.id)).toEqual(["b"]);
  });

  it("labels a building with the last path segment", () => {
    expect(townBuildings(world(spawn(1, "a", "/Users/x/code/cal-api")))[0]!.label).toBe("cal-api");
  });

  it("labels a blank cwd 'unknown'", () => {
    expect(townBuildings(world(spawn(1, "a", "")))[0]!.label).toBe("unknown");
  });

  it("tallies needsAttention / busy / done", () => {
    const [win] = townBuildings(
      world(
        spawn(1, "blk", "/repo"),
        ev({
          seq: 2,
          agentId: "blk",
          kind: "permission.requested",
          toolCallId: "t1",
          tool: "Bash",
          input: {},
        }),
        spawn(1, "wrk", "/repo"),
        ev({
          seq: 2,
          agentId: "wrk",
          kind: "tool.started",
          toolCallId: "t2",
          tool: "Read",
          input: { file_path: "x.ts" },
        }),
        spawn(1, "ext", "/repo"),
        ev({ seq: 2, agentId: "ext", kind: "agent.exited", code: 0 }),
        spawn(1, "idl", "/repo"),
        ev({ seq: 2, agentId: "idl", kind: "agent.turn_finished" }),
      ),
    );
    expect(win).toMatchObject({ needsAttention: 1, busy: 1, done: 2 });
    expect(win!.agents).toHaveLength(4);
  });

  it("keeps a subagent in its parent's building", () => {
    const buildings = townBuildings(
      world(spawn(1, "P", "/repo"), spawn(2, "sub-t1", "/repo", { parentAgentId: "P" })),
    );
    expect(buildings).toHaveLength(1);
    expect(buildings[0]!.agents.map((a) => a.id)).toEqual(["P", "sub-t1"]);
  });
});
