import { describe, expect, it } from "vitest";
import { summarizeToolOutput } from "../summarize-tool-output.ts";

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
