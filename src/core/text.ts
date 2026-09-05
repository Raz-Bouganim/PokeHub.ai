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
