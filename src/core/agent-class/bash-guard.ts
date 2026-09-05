/**
 * The shared Bash-command guard used by every class that gates `Bash`
 * (Runner, Keeper). Pure.
 *
 * Runner and Keeper use a DEFAULT-DENY allow-list of command first-tokens, not a
 * denylist: a live Runner-class agent, told to make a red suite green "by any
 * means", will actively probe a denylist and win — over successive versions it
 * reached `python3 -c`, a `NODE_OPTIONS` loader, `ed`, and `npm pkg set`. A
 * first-token allow-list flips the default so those fail without being named.
 * It still trusts the repo's own `./scripts/*` runners and cannot see inside an
 * `npm run` script; a read-only filesystem for these classes is the real fix,
 * deferred. The encounter screen is the backstop for anything exotic.
 */

import type { BashPolicy, BashVerdict } from "./policy.ts";

/** Leading `VAR=val ` assignments before the real command. A `RegExp` source
 *  fragment, prepended to a class's allow patterns. */
export const ENV_PREFIX = /^(?:\s*\w+=\S*\s+)*/.source;

/** Belt-and-braces deny patterns applied on TOP of an allow-list: even an
 *  allow-listed first token (`npm`, `node`) can still smuggle a write via a
 *  redirection, an inline `-e`, a `data:` loader or a `NODE_OPTIONS`. */
export const WRITE_SMELLS: readonly RegExp[] = [
  // Redirection to a real path. Excludes `2>&1` and `2>/dev/null`.
  />>?\s*(?!&|\/dev\/null\b)[^\s|&;<>]/,
  /\b(python[0-9.]*|ruby|node|deno|bun|php|Rscript)\b[^|;&\n]*\s-(?:c|e)\b/,
  /\bnode\b[^|;&\n]*--eval\b/,
  /(?<!\()<<-?\s*(?:['"]|[A-Za-z_])/, // heredoc
  /data:(?:text|application)\/(?:javascript|ecmascript)/i,
  /\bNODE_OPTIONS\s*=/,
  /\b(?:npm|pnpm|yarn)\s+config\s+(?:set|edit|delete)\b/,
  // `npm pkg set` edits package.json — including the very script `npm test`
  // runs. (An `npm run <script>` whose body is a write still gets through: the
  // guard cannot read package.json. That is the encounter screen's job.)
  /\bnpm\s+pkg\s+(?:set|delete)\b/,
  // `find` can write via `-delete` / `-exec`.
  /\bfind\b[^|;&\n]*\s-(?:delete|exec(?:dir)?|f?printf?|fls)\b/,
];

/**
 * Segments of a compound command, split on `;` `&&` `||` `|` `&` and newlines.
 * fd-dup redirections (`2>&1`, `>&2`) are blanked first so their `&` is not
 * mistaken for a background/`and` separator. This is what stops
 * `git log && rm -rf` sneaking a second command past a first-token check.
 *
 * @param command - the raw shell command
 * @returns the trimmed non-empty segments (at least one)
 */
export function bashSegments(command: string): string[] {
  const parts = command
    .replace(/\d*>&[\d-]+/g, " ")
    .split(/\|\||&&|[;&|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [command.trim()];
}

/**
 * Check a shell command against one class's Bash policy.
 *
 * @param policy  - the class's `BashPolicy`
 * @param command - the raw shell command
 * @returns `{ ok: true }` if every segment passes, else `{ ok: false, reason }`
 */
export function evaluateBashPolicy(policy: BashPolicy, command: string): BashVerdict {
  for (const segment of bashSegments(command)) {
    if (policy.deny.some((re) => re.test(segment))) {
      return { ok: false, reason: policy.reason };
    }
    if (policy.allow.length > 0 && !policy.allow.some((re) => re.test(segment))) {
      return { ok: false, reason: policy.reason };
    }
  }
  return { ok: true };
}
