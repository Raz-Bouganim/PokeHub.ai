/**
 * Pure NDJSON <-> event helpers. No I/O — the writer that actually touches disk
 * lives on the agent side (`src/agent/eventLog.ts`) and uses `serializeEvent`.
 */

import type { PokeHubEvent } from "./events.ts";

export function serializeEvent(event: PokeHubEvent): string {
  return JSON.stringify(event) + "\n";
}

/**
 * Parse a whole NDJSON log. Blank lines are skipped.
 *
 * An append-only log that was being written when the process crashed will
 * routinely have a half-written last line. That truncated tail is tolerated:
 * if the only thing after a bad line is blank lines, it is dropped and the
 * good events are returned. A malformed *interior* line is real corruption and
 * still throws, with the 1-based line number.
 */
export function parseLog(text: string): PokeHubEvent[] {
  const out: PokeHubEvent[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as PokeHubEvent);
    } catch (cause) {
      const truncatedTail = lines.slice(i + 1).every((l) => !l?.trim());
      if (truncatedTail) break;
      throw new Error(`event log: malformed JSON on line ${i + 1}`, { cause });
    }
  }
  return out;
}
