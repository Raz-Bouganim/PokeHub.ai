import { describe, expect, it } from "vitest";
import type { PokeHubEvent } from "../../core/events.ts";
import { toolCallOwners } from "../tool-call-owners.ts";

const spawned = (agentId: string, name: string): PokeHubEvent =>
  ({ kind: "agent.spawned", agentId, name }) as PokeHubEvent;

const started = (agentId: string, toolCallId: string): PokeHubEvent =>
  ({ kind: "tool.started", agentId, toolCallId }) as PokeHubEvent;

describe("toolCallOwners", () => {
  it("resolves an unknown tool-use id to the root", () => {
    const owners = toolCallOwners("root", "Boss");
    expect(owners.resolve("t-unknown")).toEqual({ id: "root", name: "Boss" });
  });

  it("resolves the root's own tool call to the root", () => {
    const owners = toolCallOwners("root", "Boss");
    owners.track(started("root", "t1"));
    expect(owners.resolve("t1")).toEqual({ id: "root", name: "Boss" });
  });

  it("resolves a subagent's tool call to the subagent, with its name", () => {
    const owners = toolCallOwners("root", "Boss");
    owners.track(spawned("sub-x", "Count files"));
    owners.track(started("sub-x", "t2"));
    expect(owners.resolve("t2")).toEqual({ id: "sub-x", name: "Count files" });
  });

  it("falls back to the root name if the subagent was never named", () => {
    const owners = toolCallOwners("root", "Boss");
    owners.track(started("sub-y", "t3"));
    expect(owners.resolve("t3")).toEqual({ id: "sub-y", name: "Boss" });
  });
});
