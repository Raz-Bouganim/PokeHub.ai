import { describe, expect, it } from "vitest";
import { agentHue, bubbleLine, stripInlineMarkdown, toolTarget } from "./text.ts";

describe("bubbleLine — a longer reply as one bubble line", () => {
  it("takes the first sentence, not the whole first line", () => {
    expect(
      bubbleLine("I traced it through the code. Here is the full path, hop by hop."),
    ).toBe("I traced it through the code.");
  });

  it("skips a leading markdown heading and shows the prose under it", () => {
    const reply = "## Where purity is enforced\n\nIt is not a lint rule — it is what the reducer is given.";
    expect(bubbleLine(reply)).toBe(
      "It is not a lint rule — it is what the reducer is given.",
    );
  });

  it("skips code fences and blank lines", () => {
    expect(bubbleLine("```ts\nconst x = 1;\n```\nThen it runs the reducer.")).toBe(
      "Then it runs the reducer.",
    );
  });

  it("strips inline markdown from the picked line", () => {
    expect(bubbleLine("The **reducer** stays `pure` and [documented](x).")).toBe(
      "The reducer stays pure and documented.",
    );
  });

  it("does not cut on a decimal point", () => {
    expect(bubbleLine("Bumped to v8.2 today. More soon.")).toBe(
      "Bumped to v8.2 today.",
    );
  });

  it("does not cut on a common abbreviation", () => {
    expect(
      bubbleLine("The router is e.g. in src/app.ts, so I'll edit there."),
    ).toBe("The router is e.g. in src/app.ts, so I'll edit there.");
    expect(bubbleLine("Prefer composition vs. inheritance here. Done.")).toBe(
      "Prefer composition vs. inheritance here.",
    );
  });

  it("does not return a tiny leading fragment", () => {
    expect(bubbleLine("Yes. The reducer stays pure and replay works.")).toBe(
      "Yes. The reducer stays pure and replay works.",
    );
  });

  it("clips an over-long single sentence", () => {
    const long = "x".repeat(200);
    const out = bubbleLine(long, 40);
    expect(out).toHaveLength(40);
    expect(out.endsWith("…")).toBe(true);
  });

  it("falls back to the first line when the message is all headings", () => {
    expect(bubbleLine("# Title\n## Subtitle")).toBe("Title");
  });

  it("is empty for empty input", () => {
    expect(bubbleLine("")).toBe("");
    expect(bubbleLine("\n\n  \n")).toBe("");
  });
});

describe("stripInlineMarkdown", () => {
  it("removes list and quote markers and inline spans", () => {
    expect(stripInlineMarkdown("- a **b** `c`")).toBe("a b c");
    expect(stripInlineMarkdown("> quoted *text*")).toBe("quoted text");
  });
});

describe("toolTarget — the short 'what it touched' label", () => {
  it("uses the basename for file tools", () => {
    expect(toolTarget("Read", { file_path: "/repo/src/core/auth.ts" })).toBe("auth.ts");
    expect(toolTarget("Edit", { file_path: "src/App.tsx" })).toBe("App.tsx");
  });

  it("uses the pattern for search tools", () => {
    expect(toolTarget("Grep", { pattern: "roomForTool" })).toBe("roomForTool");
    expect(toolTarget("Glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
  });

  it("uses a clipped command head for Bash", () => {
    expect(toolTarget("Bash", { command: "npm test" })).toBe("npm test");
    expect(toolTarget("Bash", { command: "x".repeat(80) })!.length).toBeLessThanOrEqual(44);
  });

  it("is null when there is nothing worth showing", () => {
    expect(toolTarget("Read", {})).toBeNull();
    expect(toolTarget("SomeMcpTool", { foo: 1 })).toBeNull();
  });
});

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
