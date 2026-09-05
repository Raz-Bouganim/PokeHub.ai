import { describe, expect, it } from "vitest";
import { toolKind, toolTarget } from "../tool-labels.ts";

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

describe("toolKind — journal read/write/other classification", () => {
  it("classifies file-reading tools as read", () => {
    expect(toolKind("Read")).toBe("read");
    expect(toolKind("Grep")).toBe("read");
    expect(toolKind("Glob")).toBe("read");
    expect(toolKind("WebFetch")).toBe("read");
  });

  it("classifies file-modifying tools as write", () => {
    expect(toolKind("Write")).toBe("write");
    expect(toolKind("Edit")).toBe("write");
    expect(toolKind("MultiEdit")).toBe("write");
    expect(toolKind("NotebookEdit")).toBe("write");
  });

  it("falls back to other for anything unlisted, including Bash", () => {
    expect(toolKind("Bash")).toBe("other");
    expect(toolKind("SomeMcpTool")).toBe("other");
  });
});
