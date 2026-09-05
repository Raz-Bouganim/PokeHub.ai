/**
 * Pure helpers for turning a composer request into a spawn: a filesystem-safe
 * agent id slug, and normalization of the free-typed cwd field. Kept separate
 * from `agent-supervisor.ts` so they can be unit-tested without dragging in
 * Electron.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A filesystem-safe slug from a display name, for the agent id and log filename.
 *
 * @param name - the agent's display name
 * @returns lowercased, non-alphanumerics collapsed to `-`, trimmed of leading/
 *          trailing `-`; `"agent"` if nothing usable remains
 */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agent"
  );
}

/**
 * Normalize the composer's free-typed, often copy-pasted cwd: trim stray
 * whitespace and expand a leading `~` / `~/` (Node does not do this itself).
 * Without it, either mistake resolves to a nonexistent directory and the SDK
 * surfaces a misleading native-binary/libc error instead of the real cause.
 *
 * @param cwd - the raw cwd string from the composer
 * @returns the trimmed, tilde-expanded path
 */
export function normalizeCwd(cwd: string): string {
  const trimmed = cwd.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}
