import { describe, expect, it } from "vitest";
import { knownClasses, toolsForClass } from "./classes.ts";

describe("toolsForClass — classes are hard tool restrictions", () => {
  it("Reviewer finds problems but cannot fix or run them", () => {
    const tools = toolsForClass("Reviewer")!;
    expect(tools).toContain("Read");
    expect(tools).not.toContain("Write");
    expect(tools).not.toContain("Edit");
    expect(tools).not.toContain("Bash");
  });

  it("Runner runs the suite but cannot touch source", () => {
    const tools = toolsForClass("Runner")!;
    expect(tools).toContain("Bash");
    expect(tools).toContain("Read");
    expect(tools).not.toContain("Write");
    expect(tools).not.toContain("Edit");
  });

  it("Scout physically cannot modify anything", () => {
    const tools = toolsForClass("Scout")!;
    expect(tools).not.toContain("Write");
    expect(tools).not.toContain("Edit");
    expect(tools).not.toContain("Bash");
  });

  it("returns a fresh array so callers cannot corrupt the table", () => {
    toolsForClass("Builder")!.push("EVIL");
    expect(toolsForClass("Builder")).not.toContain("EVIL");
  });

  it("returns undefined for an unknown class", () => {
    expect(toolsForClass("Wizard")).toBeUndefined();
  });

  it("knownClasses lists the five VISION classes", () => {
    expect(knownClasses().sort()).toEqual([
      "Builder",
      "Keeper",
      "Reviewer",
      "Runner",
      "Scout",
    ]);
  });
});
