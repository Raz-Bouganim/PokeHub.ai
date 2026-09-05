/**
 * Turn the Agent SDK's per-tool structured output into the journal's short
 * `+N / -M` / "3 matches" / "42 lines" line. Duck-types the SDK shapes rather
 * than importing their types, so an unrecognised tool degrades to `undefined`
 * instead of throwing. Pure.
 */

/**
 * A short human summary of a finished tool call's structured output, for the
 * journal's `+N / -M` line. Duck-types the Agent SDK's per-tool Output shapes
 * (`FileEditOutput`/`FileWriteOutput`'s `structuredPatch` + optional `gitDiff`,
 * `GrepOutput`/`GlobOutput`'s match/file counts, `FileReadOutput`'s line
 * count) rather than importing their types.
 *
 * @param output - the SDK's `tool_use_result` object for one tool call
 * @returns the summary line, or `undefined` for a shape it doesn't recognise
 */
export function summarizeToolOutput(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const o = output as Record<string, unknown>;

  // A brand-new file (Write's `type: "create"`) has nothing to diff against,
  // so the SDK leaves `structuredPatch` empty — checking it first would read
  // as "+0 / -0" for a file that's all new content (confirmed against a live
  // SDK run). Count the content's own lines as the addition instead.
  if (o.type === "create" && typeof o.content === "string") {
    return `+${countLines(o.content)} / -0`;
  }

  if (Array.isArray(o.structuredPatch)) {
    const git = o.gitDiff as { additions?: unknown; deletions?: unknown } | undefined;
    const { additions, deletions } =
      git && typeof git.additions === "number" && typeof git.deletions === "number"
        ? { additions: git.additions, deletions: git.deletions }
        : countPatchLines(o.structuredPatch as { lines?: unknown }[]);
    return `+${additions} / -${deletions}`;
  }

  // Grep: "count" mode reports `numMatches` directly; the default "content"
  // mode instead reports matching lines via a top-level `numLines` and — a
  // real quirk of that mode, confirmed against a live SDK run — leaves
  // `numFiles` at 0 even when it found plenty, so `numFiles` must be checked
  // last, after both. It's still the right read for "files_with_matches" mode
  // (and for Glob, which has no `numMatches`/`numLines` of its own).
  if (typeof o.numMatches === "number") {
    return plural(o.numMatches, "match", "matches");
  }
  if (typeof o.numLines === "number") return plural(o.numLines, "line", "lines");
  if (typeof o.numFiles === "number") return plural(o.numFiles, "file", "files");

  if (o.type === "text" && o.file && typeof o.file === "object") {
    const file = o.file as Record<string, unknown>;
    // Read's own `numLines` has the exact same trailing-newline-as-extra-line
    // miscount as Write's empty-patch case above — confirmed against a live
    // SDK run: a real 3-line file (each line ending in `\n`) comes back
    // reporting `numLines: 4`. Recompute from the actual returned `content`
    // instead of trusting the SDK's count.
    if (typeof file.content === "string") {
      return plural(countLines(file.content), "line", "lines");
    }
    if (typeof file.numLines === "number") {
      return plural(file.numLines, "line", "lines");
    }
  }

  return undefined;
}

/** Count `+`/`-` lines across a unified-diff's hunks. Used only when the SDK
 *  output didn't already include exact `gitDiff` counts. */
function countPatchLines(hunks: { lines?: unknown }[]): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    if (!Array.isArray(hunk.lines)) continue;
    for (const line of hunk.lines) {
      if (typeof line !== "string") continue;
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
    }
  }
  return { additions, deletions };
}

function plural(n: number, singular: string, many: string): string {
  return `${n} ${n === 1 ? singular : many}`;
}

/** Line count that doesn't double-count a trailing newline — `"a\nb\n".split("\n")`
 *  is `["a", "b", ""]` (length 3) for a file that is honestly 2 lines. */
function countLines(content: string): number {
  if (content === "") return 0;
  const lines = content.split("\n").length;
  return content.endsWith("\n") ? lines - 1 : lines;
}
