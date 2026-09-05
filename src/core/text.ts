/**
 * Small pure text helpers shared by the agent side, the reducer and the
 * renderer. No React, no I/O — safe to import anywhere.
 */

/**
 * The one-line "thought bubble" form of a longer, possibly-markdown reply.
 *
 * NOT a summary — that needs a model. This is a best-effort *first sentence*
 * with the markdown filed off, skipping heading-only and fence lines so the
 * bubble shows prose ("Purity is enforced by what the reducer is given…")
 * rather than a section label ("## Where purity is enforced").
 */
export function bubbleLine(text: string, max = 120): string {
  const lines = text.replace(/\r/g, "").split("\n");

  let pick = "";
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue; // code inside a fence is not prose
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue; // ATX heading — a label, not prose
    if (/^([-*_])\1{2,}$/.test(line)) continue; // --- *** ___ rule
    if (/^\|.*\|$/.test(line)) continue; // table row
    pick = line;
    break;
  }
  // Whole message was headings / fences / tables — fall back to its first line.
  if (!pick) {
    for (const raw of lines) {
      const line = raw.trim();
      if (line) {
        pick = line;
        break;
      }
    }
  }

  pick = stripInlineMarkdown(pick);

  let out = firstSentence(pick).trim();
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + "…";
  return out;
}

/** Common abbreviations whose trailing "." is not a sentence end. */
const ABBREV =
  /(?:^|\s)(?:e\.g|i\.e|etc|vs|cf|al|approx|fig|no|mr|mrs|ms|dr|st|jr|sr|a\.m|p\.m|u\.s|u\.k)\.?$/i;

/**
 * The first sentence of a line — or the whole line if the first "." is really a
 * decimal point, a known abbreviation, or so early the "sentence" would just be
 * a fragment ("e.g." / "Yes.").
 */
function firstSentence(s: string): string {
  const re = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const end = m.index + 1;
    const before = s.slice(0, m.index);
    if (end < 12) continue; // too short to be a useful bubble on its own
    if (/[0-9]$/.test(before)) continue; // decimal / version number
    if (ABBREV.test(before)) continue; // "e.g.", "vs.", "No."
    return s.slice(0, end);
  }
  return s;
}

/** Strip the inline markdown syntax a bubble shouldn't show verbatim. */
export function stripInlineMarkdown(s: string): string {
  return s
    .replace(/^>\s?/, "") // blockquote marker
    .replace(/^(?:[-*+]|\d+\.)\s+/, "") // list marker
    .replace(/^#{1,6}\s+/, "") // heading marker (fallback path)
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> link text
    .trim();
}

/**
 * A short, human "what did it touch" label for a tool call — the filename it
 * read, the pattern it searched, the head of the command it ran. `null` when
 * there is nothing worth showing. Used by the focus view's recent-activity
 * strip and, later, the journal.
 */
export function toolTarget(
  tool: string,
  input: Record<string, unknown>,
): string | null {
  const str = (k: string): string | undefined =>
    typeof input[k] === "string" ? (input[k] as string) : undefined;

  switch (tool) {
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit": {
      const p = str("file_path") ?? str("path") ?? str("notebook_path");
      return p ? basename(p) : null;
    }
    case "Grep":
    case "Glob":
      return str("pattern") ?? null;
    case "Bash": {
      const c = str("command");
      return c ? clip(c.replace(/\s+/g, " ").trim(), 44) : null;
    }
    case "WebFetch":
    case "WebSearch":
      return str("url") ?? str("query") ?? null;
    default:
      return null;
  }
}

/** Direct tool-name -> journal classification. A lookup table, like
 *  `rooms.ts`'s `TOOL_ROOM` — adding a tool later is a data change. Bash and
 *  anything unlisted is `"other"`: it may touch files, but not in a way
 *  PokeHub can honestly call a read or a write without inspecting the command. */
const TOOL_KIND: Readonly<Record<string, "read" | "write">> = {
  Read: "read",
  Grep: "read",
  Glob: "read",
  WebFetch: "read",
  WebSearch: "read",
  Write: "write",
  Edit: "write",
  MultiEdit: "write",
  NotebookEdit: "write",
};

/** Files *read* vs. *modified* must be visually distinct, not just labelled
 *  (VISION "Legibility features") — this is the classification the journal
 *  renders as. */
export function toolKind(tool: string): "read" | "write" | "other" {
  return TOOL_KIND[tool] ?? "other";
}

/**
 * A short human summary of a finished tool call's structured output, for the
 * journal's `+N / -M` line. Duck-types the Agent SDK's per-tool Output shapes
 * (`FileEditOutput`/`FileWriteOutput`'s `structuredPatch` + optional `gitDiff`,
 * `GrepOutput`/`GlobOutput`'s match/file counts, `FileReadOutput`'s line
 * count) rather than importing their types, so it degrades to `undefined`
 * for tools whose shape it doesn't recognise instead of throwing.
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
    const git = o.gitDiff as
      | { additions?: unknown; deletions?: unknown }
      | undefined;
    const { additions, deletions } =
      git && typeof git.additions === "number" && typeof git.deletions === "number"
        ? { additions: git.additions, deletions: git.deletions }
        : countPatchLines(o.structuredPatch as Array<{ lines?: unknown }>);
    return `+${additions} / -${deletions}`;
  }

  // Grep: "count" mode reports `numMatches` directly; the default "content"
  // mode instead reports matching lines via a top-level `numLines` and — a
  // real quirk of that mode, confirmed against a live SDK run — leaves
  // `numFiles` at 0 even when it found plenty, so `numFiles` must be checked
  // last, after both. It's still the right read for "files_with_matches" mode
  // (and for Glob, which has no `numMatches`/`numLines` of its own).
  if (typeof o.numMatches === "number") return plural(o.numMatches, "match", "matches");
  if (typeof o.numLines === "number") return plural(o.numLines, "line", "lines");
  if (typeof o.numFiles === "number") return plural(o.numFiles, "file", "files");

  if (o.type === "text" && o.file && typeof o.file === "object") {
    const file = o.file as Record<string, unknown>;
    // Read's own `numLines` has the exact same trailing-newline-as-extra-line
    // miscount as Write's empty-patch case above — confirmed against a live
    // SDK run: a real 3-line file (each line ending in `\n`) comes back
    // reporting `numLines: 4`. Recompute from the actual returned `content`
    // instead of trusting the SDK's count.
    if (typeof file.content === "string") return plural(countLines(file.content), "line", "lines");
    if (typeof file.numLines === "number") return plural(file.numLines, "line", "lines");
  }

  return undefined;
}

/** Count `+`/`-` lines across a unified-diff's hunks. Used only when the SDK
 *  output didn't already include exact `gitDiff` counts. */
function countPatchLines(
  hunks: Array<{ lines?: unknown }>,
): { additions: number; deletions: number } {
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

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Line count that doesn't double-count a trailing newline — `"a\nb\n".split("\n")`
 *  is `["a", "b", ""]` (length 3) for a file that is honestly 2 lines. */
function countLines(content: string): number {
  if (content === "") return 0;
  const lines = content.split("\n").length;
  return content.endsWith("\n") ? lines - 1 : lines;
}

/**
 * A stable hue (0-359) for an agent id — same agent, same colour, everywhere
 * it shows up (raw-log rows, the sprite accent ring), with no colour registry
 * to keep in sync. Pure hash of the id string.
 */
export function agentHue(agentId: string): number {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function basename(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : p;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
