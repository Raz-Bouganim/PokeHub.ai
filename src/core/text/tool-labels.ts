/**
 * Short human labels for a tool call: what it touched, and whether it counts as
 * a read or a write in the journal. Pure lookup + string trimming.
 */

import type { ToolInput } from "../events.ts";

/**
 * A short, human "what did it touch" label for a tool call — the filename it
 * read, the pattern it searched, the head of the command it ran.
 *
 * @param tool  - the tool name
 * @param input - the tool's raw input
 * @returns the label, or `null` when there is nothing worth showing
 */
export function toolTarget(tool: string, input: ToolInput): string | null {
  const str = (k: string): string | undefined =>
    typeof input[k] === "string" ? input[k] : undefined;

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
    case "Agent":
    case "Task":
      return str("description") ?? str("subagent_type") ?? null;
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

/**
 * Files *read* vs. *modified* must be visually distinct, not just labelled
 * (VISION "Legibility features") — this is the classification the journal
 * renders as.
 *
 * @param tool - the tool name
 * @returns `"read"`, `"write"`, or `"other"` for anything unclassifiable
 */
export function toolKind(tool: string): "read" | "write" | "other" {
  return TOOL_KIND[tool] ?? "other";
}

function basename(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : p;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
