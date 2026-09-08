import { describe, expect, it } from "vitest";
import { reduce } from "../../core/reducer.ts";
import { initialWorld, type WorldState } from "../../core/world.ts";
import { SCHEMA_VERSION, type PokeHubEvent } from "../../core/events.ts";
import { translate, type EventDraft } from "../translate.ts";

/** A recorded-shape slice of an SDK `query()` stream: init, a think, a tool
 *  call, its result, and the final result message. */
const sdkStream: Record<string, unknown>[] = [
  { type: "system", subtype: "init", session_id: "sess-1", cwd: "/repo" },
  {
    type: "assistant",
    session_id: "sess-1",
    message: {
      content: [
        {
          type: "text",
          text: "Let me look for the router.\nThen I'll edit it.",
        },
      ],
    },
  },
  {
    type: "assistant",
    session_id: "sess-1",
    message: {
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "Grep",
          input: { pattern: "router" },
        },
      ],
    },
  },
  {
    type: "user",
    session_id: "sess-1",
    message: {
      content: [{ type: "tool_result", tool_use_id: "tool-1", is_error: false }],
    },
  },
  { type: "result", subtype: "success", session_id: "sess-1", is_error: false },
];

/** Mimic what EventLog does: stamp v/seq/ts onto each draft. */
function stamp(drafts: EventDraft[]): PokeHubEvent[] {
  let seq = 0;
  return drafts.map(
    (d) =>
      ({
        ...d,
        v: SCHEMA_VERSION,
        seq: ++seq,
        ts: "2026-08-29T12:00:00.000Z",
      }) as PokeHubEvent,
  );
}

describe("translate — SDK message -> event drafts", () => {
  it("emits session_started from the init frame", () => {
    const drafts = translate(sdkStream[0]!, "a1", null);
    expect(drafts).toEqual([
      {
        kind: "agent.session_started",
        source: "agent",
        agentId: "a1",
        sessionId: "sess-1",
      },
    ]);
  });

  it("turns assistant prose into a single agent.message with the FULL text", () => {
    const drafts = translate(sdkStream[1]!, "a1", "sess-1");
    // One canonical event per block — the one-line bubble is derived downstream.
    expect(drafts).toEqual([
      {
        kind: "agent.message",
        source: "agent",
        agentId: "a1",
        sessionId: "sess-1",
        text: "Let me look for the router.\nThen I'll edit it.",
      },
    ]);
  });

  it("does not emit agent.message for an extended-thinking block", () => {
    const msg = {
      type: "assistant",
      session_id: "sess-1",
      message: { content: [{ type: "thinking", thinking: "hmm.\nok." }] },
    };
    expect(translate(msg, "a1", "sess-1").map((d) => d.kind)).toEqual(["agent.thinking"]);
  });

  it("turns an extended-thinking block into a reasoning thought", () => {
    const msg = {
      type: "assistant",
      session_id: "sess-1",
      message: {
        content: [
          {
            type: "thinking",
            thinking: "The router is probably in app/.\nCheck there.",
          },
        ],
      },
    };
    const [draft] = translate(msg, "a1", "sess-1");
    expect(draft).toMatchObject({
      kind: "agent.thinking",
      thought: "The router is probably in app/.",
      channel: "reasoning",
    });
  });

  it("turns a tool_use block into tool.started with raw input", () => {
    const [draft] = translate(sdkStream[2]!, "a1", "sess-1");
    expect(draft).toMatchObject({
      kind: "tool.started",
      toolCallId: "tool-1",
      tool: "Grep",
      input: { pattern: "router" },
    });
  });

  it("handles a text block and a tool_use block in one assistant message", () => {
    const msg = {
      type: "assistant",
      session_id: "sess-1",
      message: {
        content: [
          { type: "text", text: "Searching now." },
          {
            type: "tool_use",
            id: "t9",
            name: "Glob",
            input: { pattern: "**/*.ts" },
          },
        ],
      },
    };
    const drafts = translate(msg, "a1", "sess-1");
    expect(drafts.map((d) => d.kind)).toEqual(["agent.message", "tool.started"]);
  });

  it("turns a tool_result block into tool.finished keyed by the same id", () => {
    const [draft] = translate(sdkStream[3]!, "a1", "sess-1");
    expect(draft).toMatchObject({
      kind: "tool.finished",
      toolCallId: "tool-1",
      ok: true,
    });
  });

  it("summarizes tool.finished from the structured tool_use_result (an edit diff)", () => {
    const msg = {
      type: "user",
      session_id: "s",
      message: {
        content: [{ type: "tool_result", tool_use_id: "e1", is_error: false }],
      },
      tool_use_result: {
        filePath: "/repo/auth.ts",
        structuredPatch: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 2,
            lines: ["-a", "+b", "+c"],
          },
        ],
      },
    };
    expect(translate(msg, "a1", "s")[0]).toMatchObject({
      kind: "tool.finished",
      toolCallId: "e1",
      summary: "+2 / -1",
    });
  });

  it("omits summary for every block when a message batches more than one tool_result", () => {
    // `tool_use_result` describes exactly one tool's output — it can't be
    // safely attributed to any one block once a message carries more than
    // one `tool_result` (e.g. parallel tool calls answered together), so
    // none of them should get a summary rather than risk misattributing it.
    const msg = {
      type: "user",
      session_id: "s",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "p1", is_error: false },
          { type: "tool_result", tool_use_id: "p2", is_error: false },
        ],
      },
      tool_use_result: {
        structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["+x"] }],
      },
    };
    const drafts = translate(msg, "a1", "s");
    expect(drafts).toHaveLength(2);
    for (const d of drafts) expect(d).not.toHaveProperty("summary");
  });

  it("omits summary when tool_use_result doesn't match a known shape", () => {
    const msg = {
      type: "user",
      session_id: "s",
      message: {
        content: [{ type: "tool_result", tool_use_id: "b1", is_error: false }],
      },
      tool_use_result: { stdout: "ok", stderr: "", interrupted: false },
    };
    expect(translate(msg, "a1", "s")[0]).not.toHaveProperty("summary");
  });

  it("marks tool.finished not-ok on an error result", () => {
    const errResult = {
      type: "user",
      session_id: "s",
      message: {
        content: [{ type: "tool_result", tool_use_id: "x", is_error: true }],
      },
    };
    expect(translate(errResult, "a1", "s")[0]).toMatchObject({ ok: false });
  });

  it("emits agent.turn_finished (not exited) from a success result frame", () => {
    const [draft] = translate(sdkStream[4]!, "a1", "sess-1");
    expect(draft).toEqual({
      kind: "agent.turn_finished",
      source: "agent",
      agentId: "a1",
      sessionId: "sess-1",
    });
  });

  it("carries the SDK subtype as `reason` on an error result frame", () => {
    const msg = {
      type: "result",
      subtype: "error_max_turns",
      session_id: "s",
      is_error: true,
    };
    const [draft] = translate(msg, "a1", "s");
    expect(draft).toMatchObject({
      kind: "agent.exited",
      code: 1,
      reason: "error_max_turns",
    });
  });

  it("emits session.compacted from a compact_boundary frame", () => {
    const msg = {
      type: "system",
      subtype: "compact_boundary",
      session_id: "s",
      compact_metadata: { trigger: "auto", pre_tokens: 100000 },
    };
    const [draft] = translate(msg, "a1", "s");
    expect(draft).toMatchObject({
      kind: "session.compacted",
      trigger: "auto",
      source: "system",
    });
  });

  it("ignores a user message whose content is a plain string", () => {
    const msg = {
      type: "user",
      session_id: "s",
      message: { content: "hello" },
    };
    expect(translate(msg, "a1", "s")).toEqual([]);
  });

  it("ignores partial / stream_event message types", () => {
    expect(translate({ type: "stream_event", event: {} }, "a1", "s")).toEqual([]);
    expect(translate({ type: "partial_assistant" }, "a1", "s")).toEqual([]);
  });

  it("does not throw on a malformed / typeless value", () => {
    expect(translate(null, "a1", "s")).toEqual([]);
    expect(translate({}, "a1", "s")).toEqual([]);
    expect(translate(42, "a1", "s")).toEqual([]);
  });
});

describe("translate — subagent dispatch (Task/Agent)", () => {
  // Shapes recorded from a real `claude` stream (SDK 0.3.x): the dispatch tool
  // is on the wire as `name: "Agent"`, the subagent rides the same session,
  // tagged with `parent_tool_use_id`.
  const taskStarted = {
    type: "system",
    subtype: "task_started",
    task_id: "task_abc",
    tool_use_id: "toolu_dispatch",
    task_type: "local_agent",
    description: "Count .ts files under src/",
    subagent_type: "general-purpose",
    spawn_depth: 1,
    prompt: "Count how many .ts files are under src/. Report the number.",
    session_id: "sess-1",
  };
  const childToolUse = {
    type: "assistant",
    session_id: "sess-1",
    parent_tool_use_id: "toolu_dispatch",
    message: {
      content: [
        { type: "tool_use", id: "c1", name: "Bash", input: { command: "find src -name '*.ts'" } },
      ],
    },
  };
  const taskNotification = {
    type: "system",
    subtype: "task_notification",
    task_id: "task_abc",
    tool_use_id: "toolu_dispatch",
    status: "completed",
    output_file: "/tmp/task_abc.output",
    summary: "43 .ts files",
    session_id: "sess-1",
  };

  it("spawns a child sprite from task_started, tethered to the root, with the task prompt", () => {
    const drafts = translate(taskStarted, "root", "sess-1", "/repo");
    expect(drafts).toEqual([
      {
        kind: "agent.spawned",
        source: "agent",
        agentId: "sub-toolu_dispatch",
        sessionId: "sess-1",
        name: "Count .ts files under src/",
        agentClass: "general-purpose",
        cwd: "/repo",
        parentAgentId: "root",
      },
      {
        kind: "agent.prompt",
        source: "user",
        agentId: "sub-toolu_dispatch",
        sessionId: "sess-1",
        text: "Count how many .ts files are under src/. Report the number.",
      },
    ]);
  });

  it("ignores a task_started that isn't a subagent (backgrounded Bash / workflow)", () => {
    expect(
      translate({ ...taskStarted, task_type: "local_bash" }, "root", "sess-1", "/repo"),
    ).toEqual([]);
  });

  it("attributes a parent_tool_use_id-tagged tool call to the child, not the root", () => {
    const [draft] = translate(childToolUse, "root", "sess-1");
    expect(draft).toMatchObject({
      kind: "tool.started",
      agentId: "sub-toolu_dispatch",
      tool: "Bash",
    });
  });

  it("exits the child on a terminal task_notification", () => {
    expect(translate(taskNotification, "root", "sess-1")).toEqual([
      {
        kind: "agent.exited",
        source: "agent",
        agentId: "sub-toolu_dispatch",
        sessionId: "sess-1",
        code: 0,
      },
    ]);
  });

  it("marks a failed/stopped task_notification as a non-zero exit with a reason", () => {
    const [draft] = translate({ ...taskNotification, status: "failed" }, "root", "sess-1");
    expect(draft).toMatchObject({ kind: "agent.exited", code: 1, reason: "failed" });
  });

  it("full pipe: parent + tethered child, both in the world", () => {
    const parentDispatch = {
      type: "assistant",
      session_id: "sess-1",
      message: {
        content: [
          {
            type: "tool_use",
            id: "toolu_dispatch",
            name: "Agent",
            input: { description: "Count .ts files under src/", subagent_type: "general-purpose" },
          },
        ],
      },
    };
    const childResult = {
      type: "user",
      session_id: "sess-1",
      parent_tool_use_id: "toolu_dispatch",
      message: { content: [{ type: "tool_result", tool_use_id: "c1", is_error: false }] },
    };
    const stream = [
      { type: "system", subtype: "init", session_id: "sess-1", cwd: "/repo" },
      parentDispatch,
      taskStarted,
      childToolUse,
      childResult,
      taskNotification,
      { type: "result", subtype: "success", session_id: "sess-1", is_error: false },
    ];
    const events = stamp(stream.flatMap((m) => translate(m, "root", null, "/repo")));

    let world: WorldState = initialWorld();
    for (const event of events) world = reduce(world, event);

    const child = world.agents["sub-toolu_dispatch"]!;
    expect(child.parentAgentId).toBe("root");
    expect(child.status).toBe("exited");
    expect(child.journal.map((j) => j.tool)).toEqual(["Bash"]);
    // The root ran the dispatch tool and finished its turn cleanly.
    expect(world.agents["root"]!.status).toBe("idle");
    expect(world.agents["root"]!.journal.map((j) => j.tool)).toEqual(["Agent"]);
  });
});

describe("translate + reduce — the full pipe on a recorded stream", () => {
  it("drives an agent from spawn to idle, walking into the Library", () => {
    const drafts = sdkStream.flatMap((m) => translate(m, "a1", null));
    const events = stamp(drafts);

    let world: WorldState = initialWorld();
    const locations: string[] = [];
    for (const event of events) {
      world = reduce(world, event);
      locations.push(world.agents["a1"]!.location);
    }

    const agent = world.agents["a1"]!;
    expect(agent.sessionId).toBe("sess-1");
    // A clean turn end leaves the agent idle and resumable, not exited.
    expect(agent.status).toBe("idle");
    expect(locations).toContain("library");
  });
});
