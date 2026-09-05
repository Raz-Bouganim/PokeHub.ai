import { describe, expect, it } from "vitest";
import { agentColor, agentHue } from "../agent-color.ts";

describe("agentHue — a stable colour per agent id", () => {
  it("is deterministic for the same id", () => {
    expect(agentHue("agent-1")).toBe(agentHue("agent-1"));
  });

  it("differs for different ids", () => {
    expect(agentHue("agent-1")).not.toBe(agentHue("agent-2"));
  });

  it("is always a valid hue in [0, 360)", () => {
    for (const id of ["a", "agent-1", "", "z".repeat(50)]) {
      const h = agentHue(id);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe("agentColor — the id's identity colour as a string", () => {
  it("wraps the hue in a parseable hsl() string", () => {
    expect(agentColor("agent-1")).toBe(`hsl(${agentHue("agent-1")}, 65%, 65%)`);
  });
});
