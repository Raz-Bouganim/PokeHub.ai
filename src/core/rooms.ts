/**
 * Room assignment: a lookup table, never a switch statement (CLAUDE.md).
 *
 * Adding a room later = add rows here + a tileset. No control flow changes.
 * `roomForTool` returns `undefined` when a tool does not place the sprite
 * anywhere specific — the caller keeps the sprite where it is / on the route.
 */

import type { Room, ToolInput } from "./events.ts";

/** Direct tool-name -> room. The ~90% of traffic that needs no inspection. */
const TOOL_ROOM: Readonly<Record<string, Room>> = {
  Read: "library",
  Grep: "library",
  Glob: "library",
  Write: "forge",
  Edit: "forge",
  MultiEdit: "forge",
  NotebookEdit: "forge",
};

/**
 * Bash is one tool covering several rooms, so it gets its own table, keyed by
 * a match against the command string. First matching row wins, so order is
 * significant: `git commit && npm test` resolves to `center`, not `gym`.
 * Acceptable for Phase 0. Unmatched Bash commands return `undefined` (sprite
 * stays put).
 */
const BASH_ROOM_RULES: readonly {
  readonly match: RegExp;
  readonly room: Room;
}[] = [
  // `(\w+=\S+\s+)*` lets leading env assignments through, e.g. `GIT_PAGER=cat git log`.
  { match: /(^|[;&|]\s*)(\w+=\S+\s+)*git(\s|$)/, room: "center" },
  {
    match: /\b(vitest|jest|pytest|mocha|ava|go test|cargo test|rspec|phpunit)\b/,
    room: "gym",
  },
  { match: /\bnpm\s+(run\s+)?(test|build|lint)\b/, room: "gym" },
  { match: /\b(pnpm|yarn|bun)\s+(run\s+)?(test|build|lint)\b/, room: "gym" },
  {
    match: /\b(tsc|eslint|prettier|ruff|clippy|make|webpack|rollup|turbo)\b/,
    room: "gym",
  },
  { match: /\b(build|lint|test)\b/, room: "gym" },
];

function roomForBash(input: ToolInput): Room | undefined {
  const command = typeof input.command === "string" ? input.command : "";
  for (const rule of BASH_ROOM_RULES) {
    if (rule.match.test(command)) return rule.room;
  }
  return undefined;
}

/**
 * The room a tool call places the sprite in. Pure — a lookup, never a switch.
 *
 * @param tool  - the tool name (`Read`, `Bash`, …)
 * @param input - the tool's raw input (only `Bash` inspects it, for the command)
 * @returns the room, or `undefined` when the tool places the sprite nowhere
 *          specific (the caller keeps it where it is)
 */
export function roomForTool(tool: string, input: ToolInput): Room | undefined {
  if (tool === "Bash") return roomForBash(input);
  return TOOL_ROOM[tool];
}
