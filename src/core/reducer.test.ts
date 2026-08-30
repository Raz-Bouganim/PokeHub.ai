import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { PokeHubEvent } from "./events.ts";
import { parseLog } from "./log.ts";
import { reduce, replay } from "./reducer.ts";
import { isStalled, needsAttention } from "./selectors.ts";
import { initialWorld, TRANSCRIPT_LIMIT } from "./world.ts";

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

describe("reducer — follow-up interaction (session resume)", () => {
  // spawn -> one turn -> idle -> a follow-up turn -> idle again.
  const stream: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "F", kind: "agent.spawned", name: "Fen", agentClass: "Builder", cwd: "/f" }),
    ev({ seq: 2, agentId: "F", source: "user", kind: "agent.prompt", text: "add a health check route" }),
    ev({ seq: 3, agentId: "F", kind: "agent.session_started", sessionId: "sess-f" }),
    ev({ seq: 4, agentId: "F", kind: "agent.thinking", thought: "wiring the route" }),
    ev({ seq: 5, agentId: "F", kind: "tool.started", toolCallId: "f1", tool: "Edit", input: {} }),
    ev({ seq: 6, agentId: "F", kind: "tool.finished", toolCallId: "f1", ok: true }),
    ev({ seq: 7, agentId: "F", kind: "agent.thinking", thought: "route added at /healthz", channel: "prose" }),
    ev({ seq: 8, agentId: "F", kind: "agent.turn_finished" }),
    // follow-up turn — same log, session resumed by id
    ev({ seq: 9, agentId: "F", source: "user", kind: "agent.prompt", text: "now add a test for it" }),
    ev({ seq: 10, agentId: "F", kind: "tool.started", toolCallId: "f2", tool: "Write", input: {} }),
    ev({ seq: 11, agentId: "F", kind: "tool.finished", toolCallId: "f2", ok: true }),
    ev({ seq: 12, agentId: "F", kind: "agent.turn_finished" }),
  ];

  it("a clean turn end leaves the agent idle, not exited", () => {
    const world = replay(stream.slice(0, 8), initialWorld());
    const agent = world.agents["F"]!;
    expect(agent.status).toBe("idle");
    expect(agent.location).toBe("route");
    expect(agent.activeTools).toEqual([]);
    expect(agent.exitCode).toBeNull();
    // the last thing it said stays in the bubble while it waits
    expect(agent.thought).toBe("route added at /healthz");
  });

  it("a follow-up prompt revives the idle sprite and counts the turn", () => {
    const afterFirstIdle = replay(stream.slice(0, 8), initialWorld());
    expect(afterFirstIdle.agents["F"]!.promptCount).toBe(1);

    const afterPrompt = replay(stream.slice(0, 9), initialWorld());
    expect(afterPrompt.agents["F"]!.status).toBe("thinking");
    expect(afterPrompt.agents["F"]!.thought).toBeNull();

    const afterFollowUp = replay(stream.slice(0, 10), initialWorld());
    const agent = afterFollowUp.agents["F"]!;
    expect(agent.promptCount).toBe(2);
    expect(agent.status).toBe("working");
    expect(agent.location).toBe("forge");
  });

  it("ends idle again after the follow-up turn, session id retained", () => {
    const world = replay(stream, initialWorld());
    const agent = world.agents["F"]!;
    expect(agent.status).toBe("idle");
    expect(agent.promptCount).toBe(2);
    expect(agent.sessionId).toBe("sess-f");
  });

  it("stays deterministic and per-agent idempotent across the resumed stream", () => {
    const once = replay(stream, initialWorld());
    const twice = replay(stream, once);
    expect(twice).toEqual(once);
    expect(once.maxSeqSeen).toBe(12);
  });

  it("a prompt cannot revive an agent that has genuinely exited", () => {
    const exited: PokeHubEvent[] = [
      ev({ seq: 1, agentId: "G", kind: "agent.spawned", name: "Gale", agentClass: "Scout", cwd: "/g" }),
      ev({ seq: 2, agentId: "G", source: "user", kind: "agent.prompt", text: "look around" }),
      ev({ seq: 3, agentId: "G", kind: "agent.exited", code: 1, reason: "error_max_turns" }),
      ev({ seq: 4, agentId: "G", source: "user", kind: "agent.prompt", text: "try again" }),
    ];
    const agent = replay(exited, initialWorld()).agents["G"]!;
    expect(agent.status).toBe("exited");
    expect(agent.promptCount).toBe(1); // the post-exit prompt is ignored
  });

  it("an out-of-order prompt does not downgrade an agent still showing work", () => {
    const outOfOrder: PokeHubEvent[] = [
      ev({ seq: 1, agentId: "H", kind: "agent.spawned", name: "Hux", agentClass: "Builder", cwd: "/h" }),
      ev({ seq: 2, agentId: "H", source: "user", kind: "agent.prompt", text: "go" }),
      ev({ seq: 3, agentId: "H", kind: "tool.started", toolCallId: "h1", tool: "Edit", input: {} }),
      ev({ seq: 4, agentId: "H", kind: "permission.requested", toolCallId: "h1", tool: "Edit", input: {} }),
      // a stray/replayed prompt while the agent is blocked
      ev({ seq: 5, agentId: "H", source: "user", kind: "agent.prompt", text: "and hurry" }),
    ];
    const agent = replay(outOfOrder, initialWorld()).agents["H"]!;
    expect(agent.status).toBe("blocked");
    expect(agent.pendingPermissions).toHaveLength(1);
    expect(agent.promptCount).toBe(2);
  });

  it("does not flag an idle agent as stalled, however long it waits", () => {
    const world = replay(stream.slice(0, 8), initialWorld());
    const wayLater = Date.parse("2026-08-29T14:00:00.000Z");
    expect(isStalled(world.agents["F"]!, wayLater)).toBe(false);
  });
});

describe("reducer — transcript capture (agent-focus view)", () => {
  const stream: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "T", kind: "agent.spawned", name: "Tam", agentClass: "Builder", cwd: "/t" }),
    ev({ seq: 2, agentId: "T", source: "user", kind: "agent.prompt", text: "add a /healthz route" }),
    ev({ seq: 3, agentId: "T", kind: "agent.session_started", sessionId: "sess-t" }),
    ev({ seq: 4, agentId: "T", kind: "agent.thinking", thought: "wiring it", channel: "prose" }),
    ev({ seq: 5, agentId: "T", kind: "agent.message", text: "I'll wire it into the router.\nOne sec." }),
    ev({ seq: 6, agentId: "T", kind: "tool.started", toolCallId: "t1", tool: "Edit", input: {} }),
    ev({ seq: 7, agentId: "T", kind: "tool.finished", toolCallId: "t1", ok: true }),
    ev({ seq: 8, agentId: "T", kind: "agent.message", text: "Done — added at /healthz." }),
    ev({ seq: 9, agentId: "T", kind: "agent.turn_finished" }),
    ev({ seq: 10, agentId: "T", source: "user", kind: "agent.prompt", text: "now a test" }),
  ];

  it("folds user prompts and assistant messages into one ordered conversation", () => {
    const world = replay(stream, initialWorld());
    expect(world.agents["T"]!.transcript).toEqual([
      { seq: 2, role: "user", text: "add a /healthz route" },
      { seq: 5, role: "assistant", text: "I'll wire it into the router.\nOne sec." },
      { seq: 8, role: "assistant", text: "Done — added at /healthz." },
      { seq: 10, role: "user", text: "now a test" },
    ]);
  });

  it("agent.message captures the turn and drives the one-line bubble", () => {
    const before = replay(stream.slice(0, 7), initialWorld()).agents["T"]!;
    const after = replay(stream.slice(0, 8), initialWorld()).agents["T"]!;
    expect(after.location).toBe(before.location);
    expect(after.transcript).toHaveLength(before.transcript.length + 1);
    // the bubble now shows the first line of the full reply
    expect(after.thought).toBe("Done — added at /healthz.");
    expect(after.status).toBe("thinking");
  });

  it("agent.message does not override a tool in flight or a pending ask", () => {
    // seq 6 = tool.started Edit (no finish) -> working, in the Forge
    const midTool: PokeHubEvent[] = [
      ...stream.slice(0, 6),
      ev({ seq: 7, agentId: "T", kind: "agent.message", text: "editing now" }),
    ];
    const agent = replay(midTool, initialWorld()).agents["T"]!;
    expect(agent.status).toBe("working");
    expect(agent.location).toBe("forge");
    // the running tool keeps the bubble — interim prose does not steal it
    expect(agent.thought).toBeNull();
    // ...but the turn is still captured in the transcript
    expect(agent.transcript.at(-1)).toMatchObject({
      role: "assistant",
      text: "editing now",
    });
  });

  it("a stray agent.message after exit is ignored", () => {
    const world = replay(
      [
        ev({ seq: 1, agentId: "X", kind: "agent.spawned", name: "X", agentClass: "Scout", cwd: "/x" }),
        ev({ seq: 2, agentId: "X", kind: "agent.exited", code: 0 }),
        ev({ seq: 3, agentId: "X", kind: "agent.message", text: "still here?" }),
      ],
      initialWorld(),
    );
    expect(world.agents["X"]!.transcript).toEqual([]);
  });

  it("keeps only the newest TRANSCRIPT_LIMIT turns; older ones stay in the log", () => {
    const many: PokeHubEvent[] = [
      ev({ seq: 1, agentId: "L", kind: "agent.spawned", name: "L", agentClass: "Builder", cwd: "/l" }),
    ];
    const turns = TRANSCRIPT_LIMIT + 20;
    for (let i = 0; i < turns; i++) {
      many.push(
        ev({ seq: i + 2, agentId: "L", kind: "agent.message", text: `line ${i}` }),
      );
    }
    const agent = replay(many, initialWorld()).agents["L"]!;
    expect(agent.transcript).toHaveLength(TRANSCRIPT_LIMIT);
    expect(agent.transcript[0]!.text).toBe(`line ${turns - TRANSCRIPT_LIMIT}`);
    expect(agent.transcript.at(-1)!.text).toBe(`line ${turns - 1}`);
    expect(agent.transcriptDropped).toBe(turns - TRANSCRIPT_LIMIT);
  });

  it("transcriptDropped stays 0 at exactly the cap — nothing has fallen off", () => {
    const exactly: PokeHubEvent[] = [
      ev({ seq: 1, agentId: "E", kind: "agent.spawned", name: "E", agentClass: "Builder", cwd: "/e" }),
    ];
    for (let i = 0; i < TRANSCRIPT_LIMIT; i++) {
      exactly.push(ev({ seq: i + 2, agentId: "E", kind: "agent.message", text: `m${i}` }));
    }
    const agent = replay(exactly, initialWorld()).agents["E"]!;
    expect(agent.transcript).toHaveLength(TRANSCRIPT_LIMIT);
    expect(agent.transcriptDropped).toBe(0);
  });

  it("transcript capture is per-agent idempotent on replay", () => {
    const once = replay(stream, initialWorld());
    const twice = replay(stream, once);
    expect(twice).toEqual(once);
  });
});

describe("reducer — recent-tools trail (focus view)", () => {
  const stream: PokeHubEvent[] = [
    ev({ seq: 1, agentId: "W", kind: "agent.spawned", name: "Wren", agentClass: "Builder", cwd: "/w" }),
    ev({ seq: 2, agentId: "W", kind: "tool.started", toolCallId: "w1", tool: "Read", input: { file_path: "/w/src/auth.ts" } }),
    ev({ seq: 3, agentId: "W", kind: "tool.finished", toolCallId: "w1", ok: true }),
    ev({ seq: 4, agentId: "W", kind: "tool.started", toolCallId: "w2", tool: "Bash", input: { command: "npm test" } }),
    ev({ seq: 5, agentId: "W", kind: "tool.finished", toolCallId: "w2", ok: false }),
    ev({ seq: 6, agentId: "W", kind: "tool.started", toolCallId: "w3", tool: "Edit", input: { file_path: "/w/src/auth.ts" } }),
  ];

  it("keeps tool calls after they finish, with target and outcome", () => {
    const trail = replay(stream, initialWorld()).agents["W"]!.recentTools;
    expect(trail).toEqual([
      { toolCallId: "w1", tool: "Read", target: "auth.ts", ok: true },
      { toolCallId: "w2", tool: "Bash", target: "npm test", ok: false },
      { toolCallId: "w3", tool: "Edit", target: "auth.ts", ok: null },
    ]);
  });

  it("an in-flight call shows ok: null until its tool.finished lands", () => {
    const mid = replay(stream.slice(0, 4), initialWorld()).agents["W"]!;
    expect(mid.recentTools.at(-1)).toMatchObject({ tool: "Bash", ok: null });
  });

  it("is bounded — the oldest calls fall off, still in the log", () => {
    const many: PokeHubEvent[] = [
      ev({ seq: 1, agentId: "M", kind: "agent.spawned", name: "M", agentClass: "Builder", cwd: "/m" }),
    ];
    for (let i = 0; i < 20; i++) {
      many.push(ev({ seq: i + 2, agentId: "M", kind: "tool.started", toolCallId: `t${i}`, tool: "Read", input: {} }));
    }
    const trail = replay(many, initialWorld()).agents["M"]!.recentTools;
    expect(trail.length).toBeLessThanOrEqual(8);
    expect(trail.at(-1)!.toolCallId).toBe("t19");
  });

  it("a re-delivered tool.started (even post-finish) does not add a second row", () => {
    const trail = replay(
      [
        ...stream.slice(0, 3), // w1 started + finished
        ev({ seq: 7, agentId: "W", kind: "tool.started", toolCallId: "w1", tool: "Read", input: { file_path: "/w/src/auth.ts" } }),
      ],
      initialWorld(),
    ).agents["W"]!.recentTools;
    expect(trail.filter((t) => t.toolCallId === "w1")).toHaveLength(1);
    expect(trail[0]).toMatchObject({ toolCallId: "w1", ok: true });
  });

  it("a late tool.finished for an evicted call is a harmless no-op", () => {
    const trail = replay(
      [
        ev({ seq: 1, agentId: "N", kind: "agent.spawned", name: "N", agentClass: "Builder", cwd: "/n" }),
        ev({ seq: 2, agentId: "N", kind: "tool.started", toolCallId: "ghost", tool: "Read", input: {} }),
        ...Array.from({ length: 10 }, (_, i) =>
          ev({ seq: i + 3, agentId: "N", kind: "tool.started", toolCallId: `x${i}`, tool: "Glob", input: {} }),
        ),
        ev({ seq: 13, agentId: "N", kind: "tool.finished", toolCallId: "ghost", ok: true }),
      ],
      initialWorld(),
    ).agents["N"]!.recentTools;
    expect(trail.some((t) => t.toolCallId === "ghost")).toBe(false);
    expect(trail.length).toBeLessThanOrEqual(8);
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
