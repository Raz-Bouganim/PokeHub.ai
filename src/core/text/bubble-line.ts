/**
 * The one-line "thought bubble" form of a longer, possibly-markdown reply.
 * Pure — no React, no I/O.
 */

/**
 * The one-line "thought bubble" form of a longer, possibly-markdown reply.
 *
 * NOT a summary — that needs a model. This is a best-effort *first sentence*
 * with the markdown filed off, skipping heading-only and fence lines so the
 * bubble shows prose ("Purity is enforced by what the reducer is given…")
 * rather than a section label ("## Where purity is enforced").
 *
 * @param text - the full reply text, possibly multi-line markdown
 * @param max  - hard cap on the returned length (an ellipsis is added if hit)
 * @returns the one-line bubble form, `""` for empty/whitespace-only input
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

/**
 * Strip the inline markdown syntax a bubble shouldn't show verbatim.
 *
 * @param s - one line of possibly-marked-up text
 * @returns the line with blockquote/list/heading markers and inline
 *          code/bold/italic/link syntax removed
 */
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
