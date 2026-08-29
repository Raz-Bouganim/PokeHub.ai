import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseLog } from "../core/log.ts";
import type { EventDraft } from "./translate.ts";
import { EventLog } from "./eventLog.ts";

const draft = (agentId: string): EventDraft => ({
  kind: "agent.thinking",
  source: "agent",
  agentId,
  sessionId: "s",
  thought: "thinking",
  channel: "prose",
});

describe("EventLog", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pokehub-log-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("assigns a monotonic seq from 1 and stamps ts", async () => {
    const log = new EventLog(join(dir, "a.ndjson"));
    const a = log.append(draft("x"));
    const b = log.append(draft("x"));
    const c = log.append(draft("x"));
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3]);
    expect(a.v).toBe(1);
    expect(typeof a.ts).toBe("string");
    expect(Number.isNaN(Date.parse(a.ts))).toBe(false);
    await log.close();
  });

  it("creates missing parent directories and round-trips through parseLog", async () => {
    const path = join(dir, "deep", "nested", "session.ndjson");
    const log = new EventLog(path);
    log.append(draft("x"));
    log.append(draft("y"));
    log.append(draft("z"));
    await log.close();

    const events = parseLog(readFileSync(path, "utf8"));
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.agentId)).toEqual(["x", "y", "z"]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});
