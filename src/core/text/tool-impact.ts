/** `count` is set only when the input alone proves it — an ambiguous rm target
 *  or a chained non-`rm` command leaves it out rather than guess. */

import { bashSegments, WRITE_SMELLS } from "../agent-class/bash-guard.ts";
import type { ToolInput } from "../events.ts";
import { toolTarget } from "./tool-labels.ts";

export interface ToolImpact {
  readonly verb: string;
  /** A file path, or the full command text. */
  readonly target: string | null;
  readonly count?: number;
  /** Singular noun for `count`, pluralized by `describeImpact`. */
  readonly unit?: string;
  /** A real `WRITE_SMELLS` regex hit, not a guess. */
  readonly hiddenWrite?: boolean;
}

const GLOB_CHARS = /[*?[\]{}]/;

/**
 * The encounter dialog's honest quantification of a tool call, in place of
 * raw JSON — never an estimate.
 *
 * @returns the verb, target, and (when derivable) count to render
 */
export function toolImpact(toolName: string, rawInput: ToolInput): ToolImpact {
  const str = (k: string): string | undefined =>
    typeof rawInput[k] === "string" ? rawInput[k] : undefined;

  switch (toolName) {
    case "Write": {
      const content = str("content");
      return {
        verb: content !== undefined ? "write" : "write to",
        target: str("file_path") ?? null,
        ...(content !== undefined ? { count: lineCount(content), unit: "line" } : {}),
      };
    }
    case "Edit": {
      const oldString = str("old_string");
      return {
        verb: "edit",
        target: str("file_path") ?? null,
        ...(oldString !== undefined ? { count: lineCount(oldString), unit: "line" } : {}),
      };
    }
    case "NotebookEdit":
      return { verb: "edit", target: str("notebook_path") ?? null };
    case "Bash": {
      const command = str("command");
      if (!command) return { verb: "run", target: null };
      const trimmed = command.trim();
      const hiddenWrite = WRITE_SMELLS.some((re) => re.test(trimmed));
      const removed = removeTargets(trimmed);
      if (removed) {
        return {
          verb: "delete",
          target: trimmed,
          count: removed.length,
          unit: "named target",
          ...(hiddenWrite ? { hiddenWrite } : {}),
        };
      }
      const segments = bashSegments(trimmed);
      return {
        verb: "run",
        target: trimmed,
        ...(segments.length > 1 ? { count: segments.length, unit: "command" } : {}),
        ...(hiddenWrite ? { hiddenWrite } : {}),
      };
    }
    default:
      return { verb: toolName.toLowerCase(), target: toolTarget(toolName, rawInput) };
  }
}

/** Renders a `ToolImpact` as the dialog's sentence. */
export function describeImpact(impact: ToolImpact): string {
  if (impact.count === undefined || !impact.unit) return `wants to ${impact.verb}`;
  const noun = impact.count === 1 ? impact.unit : `${impact.unit}s`;
  return `wants to ${impact.verb} ${impact.count} ${noun}`;
}

/** Literal `rm`/`rmdir` arguments across every segment — `null` if any could
 *  expand to more than itself (a glob, `$var`, backticks). */
function removeTargets(command: string): string[] | null {
  const targets: string[] = [];
  for (const segment of bashSegments(command)) {
    const [head, ...rest] = segment.split(/\s+/).filter(Boolean);
    if (head !== "rm" && head !== "rmdir") continue;
    for (const tok of rest) {
      if (tok.startsWith("-")) continue;
      if (GLOB_CHARS.test(tok) || tok.includes("$") || tok.includes("`")) return null;
      targets.push(tok);
    }
  }
  return targets.length > 0 ? targets : null;
}

function lineCount(s: string): number {
  return s.length === 0 ? 0 : s.split("\n").length;
}
