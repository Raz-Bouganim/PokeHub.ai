import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { PokeHubEvent } from "./events.ts";
import { parseLog } from "./log.ts";
import { reduce, replay } from "./reducer.ts";
import { isStalled, needsAttention } from "./selectors.ts";
import { initialWorld } from "./world.ts";

const fixture = fileURLToPath(
  new URL("./__fixtures__/one-agent-two-rooms.ndjson", import.meta.url),
);

/** Build a well-formed event without repeating the envelope everywhere. */
function ev(
  fields: { seq: number; agentId: string; kind: PokeHubEvent["kind"] } & Record<string, unknown>,
): PokeHubEvent {
  return {
    v: 1,
    ts: `2026-08-29T10:00:${String(fields.seq).padStart(2, "0")}.000Z`,
    source: "agent",
    sessionId: null,
    ...fields,
  } as unknown as PokeHubEvent;
}

describe("reducer — replay from a real log file", () => {
  let events: PokeHubEvent[];

  beforeAll(() => {
    events = parseLog(readFileSync(fixture, "utf8"));
  });

  it("walks the sprite Library -> Forge -> Gym as tools fire", () => {
    const seen: string[] = [];
    let world = initialWorld();
    for (const event of events) {
      world = reduce(world, event);
      const loc = world.agents["scout-1"]?.location;
      if (loc && seen.at(-1) !== loc) seen.push(loc);
    }
    expect(seen).toEqual(["route", "library", "forge", "gym", "route"]);
  });

  it("marks the agent blocked while a permission request is pending", () => {
    const world = replay(events.slice(0, 9), initialWorld());
    const agent = world.agents["scout-1"]!;
    expect(agent.status).toBe("blocked");
    expect(agent.pendingPermissions.map((p) => p.tool)).toContain("Edit");
    expect(needsAttention(world).map((a) => a.id)).toEqual(["scout-1"]);
  });

  it("clears the block once the user resolves it", () => {
    const world = replay(events.slice(0, 10), initialWorld());
    const agent = world.agents["scout-1"]!;
    expect(agent.pendingPermissions).toEqual([]);
    // The Edit tool is still in flight, so the agent proceeds (working), not idle.
    expect(agent.status).toBe("working");
  });

  it("goes to erroring on a failed tool result, no inference", () => {
    const world = replay(events.slice(0, 14), initialWorld());
    expect(world.agents["scout-1"]!.status).toBe("erroring");
  });

  it("ends exited with the final session id retained", () => {
    const world = replay(events, initialWorld());
    const agent = world.agents["scout-1"]!;
    expect(agent.status).toBe("exited");
    expect(agent.exitCode).toBe(0);
    expect(agent.exitReason).toBeNull();
    expect(agent.sessionId).toBe("sess-abc");
  });
});

describe("reducer — two agents, overlapping per-log seq (regression: global de-dup)", () => {
  // Each agent writes its own log, both starting at seq 1. A world-global
  // de-dup counter silently drops the second agent's whole stream.
  const stream: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "A", kind: "agent.spawned", name: "Ada", agentClass: "Scout", cwd: "/a" }),
    ev({ seq: 1, agentId: "B", kind: "agent.spawned", name: "Bo", agentClass: "Builder", cwd: "/b" }),
    ev({ seq: 2, agentId: "A", kind: "tool.started", toolCallId: "a1", tool: "Read", input: {} }),
    ev({ seq: 2, agentId: "B", kind: "tool.started", toolCallId: "b1", tool: "Edit", input: {} }),
    ev({ seq: 3, agentId: "A", kind: "tool.finished", toolCallId: "a1", ok: true }),
    ev({ seq: 3, agentId: "B", kind: "permission.requested", toolCallId: "b1", tool: "Edit", input: {} }),
  ];

  it("keeps both agents; the second one is not swallowed", () => {
    const world = replay(stream, initialWorld());
    expect(Object.keys(world.agents).sort()).toEqual(["A", "B"]);

    expect(world.agents["A"]!.location).toBe("library");
    expect(world.agents["A"]!.status).toBe("thinking");

    expect(world.agents["B"]!.location).toBe("forge");
    expect(world.agents["B"]!.status).toBe("blocked");
    expect(world.agents["B"]!.pendingPermissions).toHaveLength(1);
  });

  it("de-dup is still per-agent idempotent", () => {
    const once = replay(stream, initialWorld());
    const twice = replay(stream, once);
    expect(twice).toEqual(once);
    expect(once.maxSeqSeen).toBe(3);
  });
});

describe("reducer — parallel tool calls", () => {
  const stream: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "P", kind: "agent.spawned", name: "Pat", agentClass: "Builder", cwd: "/p" }),
    ev({ seq: 2, agentId: "P", kind: "tool.started", toolCallId: "t1", tool: "Read", input: {} }),
    ev({ seq: 3, agentId: "P", kind: "tool.started", toolCallId: "t2", tool: "Bash", input: { command: "npm test" } }),
    ev({ seq: 4, agentId: "P", kind: "tool.finished", toolCallId: "t1", ok: true }),
    ev({ seq: 5, agentId: "P", kind: "tool.finished", toolCallId: "t2", ok: true }),
  ];

  it("stays working until the last concurrent tool finishes", () => {
    const afterBoth = replay(stream.slice(0, 3), initialWorld());
    expect(afterBoth.agents["P"]!.status).toBe("working");
    expect(afterBoth.agents["P"]!.activeTools).toHaveLength(2);
    // location follows the most recently started tool
    expect(afterBoth.agents["P"]!.location).toBe("gym");

    const afterOne = replay(stream.slice(0, 4), initialWorld());
    expect(afterOne.agents["P"]!.status).toBe("working");
    expect(afterOne.agents["P"]!.activeTools).toHaveLength(1);

    const afterAll = replay(stream, initialWorld());
    expect(afterAll.agents["P"]!.status).toBe("thinking");
    expect(afterAll.agents["P"]!.activeTools).toHaveLength(0);
  });

  it("an out-of-order finish for an unknown tool id is a no-op on activeTools", () => {
    const withStray = [
      ...stream.slice(0, 3),
      ev({ seq: 4, agentId: "P", kind: "tool.finished", toolCallId: "ghost", ok: true }),
    ];
    const world = replay(withStray, initialWorld());
    expect(world.agents["P"]!.activeTools.map((t) => t.toolCallId).sort()).toEqual(["t1", "t2"]);
    expect(world.agents["P"]!.status).toBe("working");
  });
});

describe("reducer — multiple pending permissions", () => {
  const stream: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "Q", kind: "agent.spawned", name: "Q", agentClass: "Builder", cwd: "/q" }),
    ev({ seq: 2, agentId: "Q", kind: "permission.requested", toolCallId: "p1", tool: "Bash", input: {} }),
    ev({ seq: 3, agentId: "Q", kind: "permission.requested", toolCallId: "p2", tool: "Write", input: {} }),
    ev({ seq: 4, agentId: "Q", kind: "permission.resolved", toolCallId: "p1", decision: "allow_once" }),
    ev({ seq: 5, agentId: "Q", kind: "permission.resolved", toolCallId: "p2", decision: "refuse" }),
  ];

  it("stays blocked until every ask is resolved", () => {
    const two = replay(stream.slice(0, 3), initialWorld());
    expect(two.agents["Q"]!.pendingPermissions).toHaveLength(2);
    expect(two.agents["Q"]!.status).toBe("blocked");

    const one = replay(stream.slice(0, 4), initialWorld());
    expect(one.agents["Q"]!.pendingPermissions).toHaveLength(1);
    expect(one.agents["Q"]!.status).toBe("blocked");

    const none = replay(stream, initialWorld());
    expect(none.agents["Q"]!.pendingPermissions).toHaveLength(0);
    expect(none.agents["Q"]!.status).toBe("thinking");
  });
});

describe("reducer — a refusal is not an erroring agent", () => {
  // Refuse -> SDK feeds the model an error tool_result -> tool.finished ok:false.
  // The agent turned red for doing the safe thing; it should just move on.
  const stream: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "R", kind: "agent.spawned", name: "Ru", agentClass: "Builder", cwd: "/r" }),
    ev({ seq: 2, agentId: "R", kind: "tool.started", toolCallId: "x1", tool: "Bash", input: { command: "rm -rf dist" } }),
    ev({ seq: 3, agentId: "R", kind: "permission.requested", toolCallId: "x1", tool: "Bash", input: { command: "rm -rf dist" } }),
    ev({ seq: 4, agentId: "R", kind: "permission.resolved", toolCallId: "x1", decision: "refuse" }),
    ev({ seq: 5, agentId: "R", kind: "tool.finished", toolCallId: "x1", ok: false }),
  ];

  it("settles to thinking, not erroring, and clears the refused id", () => {
    const world = replay(stream, initialWorld());
    const agent = world.agents["R"]!;
    expect(agent.status).toBe("thinking");
    expect(agent.refusedToolCallIds).toEqual([]);
    expect(needsAttention(world)).toEqual([]);
  });

  it("still goes erroring on a genuine tool failure alongside a refusal", () => {
    const withRealError: PokeHubEvent[] = [
      ...stream,
      ev({ seq: 6, agentId: "R", kind: "tool.started", toolCallId: "x2", tool: "Bash", input: { command: "npm test" } }),
      ev({ seq: 7, agentId: "R", kind: "tool.finished", toolCallId: "x2", ok: false }),
    ];
    expect(replay(withRealError, initialWorld()).agents["R"]!.status).toBe("erroring");
  });
});

describe("reducer — a finished agent stays finished", () => {
  const base: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "Z", kind: "agent.spawned", name: "Zed", agentClass: "Scout", cwd: "/z" }),
    ev({ seq: 2, agentId: "Z", kind: "tool.started", toolCallId: "z1", tool: "Read", input: {} }),
    ev({ seq: 3, agentId: "Z", kind: "agent.exited", code: 0 }),
  ];

  it("ignores a late tool.finished that would otherwise flip it to erroring", () => {
    const world = replay(
      [...base, ev({ seq: 4, agentId: "Z", kind: "tool.finished", toolCallId: "z1", ok: false })],
      initialWorld(),
    );
    const agent = world.agents["Z"]!;
    expect(agent.status).toBe("exited");
    expect(agent.activeTools).toEqual([]);
    expect(agent.lastSeq).toBe(4);
  });

  it("ignores a stray agent.thinking after exit", () => {
    const world = replay(
      [...base, ev({ seq: 4, agentId: "Z", kind: "agent.thinking", thought: "back?" })],
      initialWorld(),
    );
    expect(world.agents["Z"]!.status).toBe("exited");
    expect(world.agents["Z"]!.thought).toBeNull();
  });
});

describe("reducer — purity guarantees", () => {
  const events = parseLog(readFileSync(fixture, "utf8"));

  it("is deterministic: same log, same final state", () => {
    const a = replay(events, initialWorld());
    const b = replay(events, initialWorld());
    expect(a).toEqual(b);
  });

  it("does not mutate its input state", () => {
    const before = initialWorld();
    const snapshot = structuredClone(before);
    reduce(before, events[0]!);
    expect(before).toEqual(snapshot);
  });

  it("is idempotent for already-applied seq numbers", () => {
    const once = replay(events, initialWorld());
    const twice = replay(events, once);
    expect(twice).toEqual(once);
  });

  it("ignores an unknown event kind but still advances maxSeqSeen", () => {
    const world = replay(events.slice(0, 3), initialWorld());
    const weird = {
      v: 1,
      seq: 99,
      ts: "2026-08-29T10:05:00.000Z",
      source: "repo",
      agentId: "scout-1",
      sessionId: "sess-abc",
      kind: "repo.commit_landed",
    } as unknown as PokeHubEvent;
    const after = reduce(world, weird);
    expect(after.maxSeqSeen).toBe(99);
    expect(after.agents["scout-1"]!.status).toBe(world.agents["scout-1"]!.status);
  });

  it("records a session.compacted event without disturbing agent state", () => {
    const world = replay(events.slice(0, 6), initialWorld());
    const compact = {
      v: 1,
      seq: 50,
      ts: "2026-08-29T10:06:00.000Z",
      source: "system",
      agentId: "scout-1",
      sessionId: "sess-abc",
      kind: "session.compacted",
      trigger: "auto",
    } as unknown as PokeHubEvent;
    const after = reduce(world, compact);
    const before = world.agents["scout-1"]!;
    const now = after.agents["scout-1"]!;
    expect(now.status).toBe(before.status);
    expect(now.location).toBe(before.location);
    expect(now.activeTools).toEqual(before.activeTools);
    expect(after.maxSeqSeen).toBe(50);
  });
});

describe("selectors — time lives here, not in the reducer", () => {
  const events = parseLog(readFileSync(fixture, "utf8"));

  it("does not flag a fresh agent as stalled", () => {
    const world = replay(events.slice(0, 6), initialWorld());
    const now = Date.parse("2026-08-29T10:00:05.000Z");
    expect(isStalled(world.agents["scout-1"]!, now)).toBe(false);
  });

  it("flags an agent with no progress past the stall window", () => {
    const world = replay(events.slice(0, 6), initialWorld());
    const now = Date.parse("2026-08-29T10:15:00.000Z");
    expect(isStalled(world.agents["scout-1"]!, now)).toBe(true);
  });
});
