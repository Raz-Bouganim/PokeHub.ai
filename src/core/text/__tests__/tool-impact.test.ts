import { describe, expect, it } from "vitest";
import { describeImpact, toolImpact } from "../tool-impact.ts";

describe("toolImpact — the encounter dialog's honest quantification", () => {
  it("counts Write's content by line", () => {
    const impact = toolImpact("Write", { file_path: "/repo/src/auth.ts", content: "a\nb\nc" });
    expect(impact).toEqual({
      verb: "write",
      target: "/repo/src/auth.ts",
      count: 3,
      unit: "line",
    });
  });

  it("has no count when Write's content is missing", () => {
    expect(toolImpact("Write", { file_path: "/repo/x.ts" })).toEqual({
      verb: "write to",
      target: "/repo/x.ts",
    });
  });

  it("counts Edit's old_string by line", () => {
    const impact = toolImpact("Edit", { file_path: "a.ts", old_string: "x\ny", new_string: "z" });
    expect(impact).toEqual({ verb: "edit", target: "a.ts", count: 2, unit: "line" });
  });

  it("names NotebookEdit's target with no count", () => {
    expect(toolImpact("NotebookEdit", { notebook_path: "n.ipynb" })).toEqual({
      verb: "edit",
      target: "n.ipynb",
    });
  });

  it("counts literal rm arguments as named targets", () => {
    const impact = toolImpact("Bash", { command: "rm -rf dist build" });
    expect(impact).toEqual({
      verb: "delete",
      target: "rm -rf dist build",
      count: 2,
      unit: "named target",
    });
  });

  it("sums rm targets only across rm/rmdir segments, ignoring the rest", () => {
    const impact = toolImpact("Bash", { command: "rm -rf ./dist && yarn build --force" });
    expect(impact).toEqual({
      verb: "delete",
      target: "rm -rf ./dist && yarn build --force",
      count: 1,
      unit: "named target",
    });
  });

  it("gives up the count when an rm argument is a glob", () => {
    const impact = toolImpact("Bash", { command: "rm -rf *.log" });
    expect(impact.count).toBeUndefined();
    expect(impact.verb).toBe("run");
  });

  it("gives up the count when an rm argument is a variable or command substitution", () => {
    expect(toolImpact("Bash", { command: "rm $FILE" }).count).toBeUndefined();
    expect(toolImpact("Bash", { command: "rm `cat list`" }).count).toBeUndefined();
  });

  it("counts chained non-rm commands by segment", () => {
    const impact = toolImpact("Bash", { command: "npm test && npm run build" });
    expect(impact).toEqual({
      verb: "run",
      target: "npm test && npm run build",
      count: 2,
      unit: "command",
    });
  });

  it("has no count for a single plain command", () => {
    expect(toolImpact("Bash", { command: "npm test" })).toEqual({
      verb: "run",
      target: "npm test",
    });
  });

  it("flags a hidden-write pattern without inventing a count", () => {
    const impact = toolImpact("Bash", { command: "echo hi > out.txt" });
    expect(impact.hiddenWrite).toBe(true);
    expect(impact.count).toBeUndefined();
  });

  it("has no command means run with a null target", () => {
    expect(toolImpact("Bash", {})).toEqual({ verb: "run", target: null });
  });

  it("falls back to the tool's own target label for anything else", () => {
    expect(toolImpact("Grep", { pattern: "foo" })).toEqual({ verb: "grep", target: "foo" });
  });
});

describe("describeImpact — the sentence half", () => {
  it("pluralizes the unit from count", () => {
    expect(describeImpact({ verb: "delete", target: "x", count: 1, unit: "named target" })).toBe(
      "wants to delete 1 named target",
    );
    expect(describeImpact({ verb: "delete", target: "x", count: 3, unit: "named target" })).toBe(
      "wants to delete 3 named targets",
    );
  });

  it("drops the count clause when there is none", () => {
    expect(describeImpact({ verb: "run", target: "npm test" })).toBe("wants to run");
  });
});
