import { describe, expect, it } from "vitest";
import {
  agentHue,
  bubbleLine,
  stripInlineMarkdown,
  summarizeToolOutput,
  toolKind,
  toolTarget,
} from "../text.ts";

describe("bubbleLine — a longer reply as one bubble line", () => {
  it("takes the first sentence, not the whole first line", () => {
    expect(bubbleLine("I traced it through the code. Here is the full path, hop by hop.")).toBe(
      "I traced it through the code.",
    );
  });

  it("skips a leading markdown heading and shows the prose under it", () => {
    const reply =
      "## Where purity is enforced\n\nIt is not a lint rule — it is what the reducer is given.";
    expect(bubbleLine(reply)).toBe("It is not a lint rule — it is what the reducer is given.");
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
    expect(bubbleLine("Bumped to v8.2 today. More soon.")).toBe("Bumped to v8.2 today.");
  });

  it("does not cut on a common abbreviation", () => {
    expect(bubbleLine("The router is e.g. in src/app.ts, so I'll edit there.")).toBe(
      "The router is e.g. in src/app.ts, so I'll edit there.",
    );
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

describe("summarizeToolOutput — the journal's +N / -M line", () => {
  it("counts content lines for a brand-new file (Write's empty structuredPatch)", () => {
    // Confirmed against a live SDK run: `type: "create"` always ships an empty
    // structuredPatch (there's nothing to diff against), so reading it first
    // would misreport a real new file as "+0 / -0".
    const out = {
      type: "create",
      filePath: "/repo/new.txt",
      content: "hello world\nsecond line",
      structuredPatch: [],
      originalFile: null,
    };
    expect(summarizeToolOutput(out)).toBe("+2 / -0");
  });

  it("does not double-count a trailing newline as an extra line", () => {
    // "line1\nline2\n".split("\n") is ["line1", "line2", ""] — length 3 for a
    // file that is honestly 2 lines, which is the normal shape of a real
    // file write (nearly every file ends with a trailing newline).
    expect(summarizeToolOutput({ type: "create", content: "line1\nline2\n" })).toBe("+2 / -0");
    expect(summarizeToolOutput({ type: "create", content: "" })).toBe("+0 / -0");
    expect(summarizeToolOutput({ type: "create", content: "\n" })).toBe("+1 / -0");
  });

  it("prefers exact gitDiff counts for an edit", () => {
    const out = {
      structuredPatch: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 2,
          lines: ["-a", "+b", "+c"],
        },
      ],
      gitDiff: {
        filename: "x.ts",
        status: "modified",
        additions: 4,
        deletions: 1,
        changes: 5,
        patch: "",
      },
    };
    expect(summarizeToolOutput(out)).toBe("+4 / -1");
  });

  it("counts +/- patch lines when there is no gitDiff", () => {
    const out = {
      structuredPatch: [
        {
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 3,
          lines: [" ctx", "-old", "+new1", "+new2"],
        },
      ],
    };
    expect(summarizeToolOutput(out)).toBe("+2 / -1");
  });

  it("summarizes a match count for Grep in count mode", () => {
    expect(summarizeToolOutput({ numMatches: 3, numFiles: 2 })).toBe("3 matches");
    expect(summarizeToolOutput({ numMatches: 1, numFiles: 1 })).toBe("1 match");
  });

  it("summarizes a line count for Grep's default content mode, not numFiles", () => {
    // A real quirk confirmed against a live SDK run: content mode reports
    // matches via `numLines` and leaves `numFiles` at 0 even with real hits.
    expect(
      summarizeToolOutput({
        mode: "content",
        numFiles: 0,
        filenames: [],
        numLines: 7,
        totalLines: 7,
      }),
    ).toBe("7 lines");
  });

  it("summarizes a file count for Glob", () => {
    expect(summarizeToolOutput({ numFiles: 5, filenames: [] })).toBe("5 files");
  });

  it("summarizes a line count for Read from the returned content, not the SDK's own numLines", () => {
    // Confirmed against a live SDK run: a real 3-line file (each line ending
    // in a trailing newline — the normal shape of a real file) comes back
    // with `numLines: 4` from the SDK itself. Recomputing from `content`
    // avoids inheriting that miscount.
    expect(
      summarizeToolOutput({
        type: "text",
        file: {
          content: "line one\nline two\nline three\n",
          numLines: 4,
          totalLines: 4,
        },
      }),
    ).toBe("3 lines");
  });

  it("falls back to the SDK's numLines when content is absent", () => {
    expect(summarizeToolOutput({ type: "text", file: { numLines: 42 } })).toBe("42 lines");
  });

  it("is undefined for shapes it doesn't recognise", () => {
    expect(summarizeToolOutput({ stdout: "ok", stderr: "", interrupted: false })).toBeUndefined();
    expect(summarizeToolOutput(null)).toBeUndefined();
    expect(summarizeToolOutput("plain string")).toBeUndefined();
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
