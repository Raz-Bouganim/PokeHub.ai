import { describe, expect, it } from "vitest";
import type { PokeHubEvent } from "./events.ts";
import { parseLog, serializeEvent } from "./log.ts";

const sample: PokeHubEvent[] = [
  {
    v: 1,
    seq: 1,
    ts: "2026-08-29T10:00:00.000Z",
    source: "agent",
    agentId: "a1",
    sessionId: null,
    kind: "agent.spawned",
    name: "Rowan",
    agentClass: "Scout",
    cwd: "/repo",
  },
  {
    v: 1,
    seq: 2,
    ts: "2026-08-29T10:00:01.000Z",
    source: "agent",
    agentId: "a1",
    sessionId: "s",
    kind: "tool.started",
    toolCallId: "t1",
    tool: "Read",
    input: { file_path: "x" },
  },
];

describe("log", () => {
  it("round-trips serializeEvent -> parseLog", () => {
    const text = sample.map(serializeEvent).join("");
    expect(parseLog(text)).toEqual(sample);
  });

  it("skips blank lines anywhere in the log", () => {
    const text =
      "\n" + serializeEvent(sample[0]!) + "\n\n" + serializeEvent(sample[1]!) + "\n";
    expect(parseLog(text)).toEqual(sample);
  });

  it("tolerates a truncated final line (crash mid-write)", () => {
    const text = sample.map(serializeEvent).join("") + '{"v":1,"seq":3,"ts":"2026-08';
    expect(parseLog(text)).toEqual(sample);
  });

  it("tolerates a truncated final line followed by a newline", () => {
    const text = sample.map(serializeEvent).join("") + '{"v":1,"partial\n';
    expect(parseLog(text)).toEqual(sample);
  });

  it("throws with the line number on a malformed interior line", () => {
    const text =
      serializeEvent(sample[0]!) + "{not json}\n" + serializeEvent(sample[1]!);
    expect(() => parseLog(text)).toThrow(/line 2/);
  });
});
