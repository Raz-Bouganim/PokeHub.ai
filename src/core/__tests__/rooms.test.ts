import { describe, expect, it } from "vitest";
import { roomForTool } from "../rooms.ts";

describe("roomForTool", () => {
  it("routes read-family tools to the Library", () => {
    expect(roomForTool("Read", { file_path: "a.ts" })).toBe("library");
    expect(roomForTool("Grep", { pattern: "x" })).toBe("library");
    expect(roomForTool("Glob", { pattern: "**/*.ts" })).toBe("library");
  });

  it("routes write-family tools to the Forge", () => {
    expect(roomForTool("Write", { file_path: "a.ts" })).toBe("forge");
    expect(roomForTool("Edit", { file_path: "a.ts" })).toBe("forge");
    expect(roomForTool("MultiEdit", { file_path: "a.ts" })).toBe("forge");
  });

  it("sends git bash commands to the Center", () => {
    expect(roomForTool("Bash", { command: "git status" })).toBe("center");
    expect(roomForTool("Bash", { command: "cd foo && git commit -m x" })).toBe("center");
  });

  it("sees git through a leading env-var assignment", () => {
    expect(roomForTool("Bash", { command: "GIT_PAGER=cat git log" })).toBe("center");
  });

  it("resolves rule order deterministically — git wins over a trailing test", () => {
    expect(roomForTool("Bash", { command: "git commit -m x && npm test" })).toBe("center");
  });

  it("sends test/build/lint bash commands to the Gym", () => {
    expect(roomForTool("Bash", { command: "npm test" })).toBe("gym");
    expect(roomForTool("Bash", { command: "pnpm run build" })).toBe("gym");
    expect(roomForTool("Bash", { command: "npx vitest run" })).toBe("gym");
    expect(roomForTool("Bash", { command: "eslint src" })).toBe("gym");
  });

  it("returns undefined for tools/commands that place the sprite nowhere", () => {
    expect(roomForTool("Bash", { command: "ls -la" })).toBeUndefined();
    expect(roomForTool("WebFetch", { url: "https://x" })).toBeUndefined();
    expect(roomForTool("Task", {})).toBeUndefined();
  });

  it("does not throw on a Bash call with no command", () => {
    expect(roomForTool("Bash", {})).toBeUndefined();
  });
});
