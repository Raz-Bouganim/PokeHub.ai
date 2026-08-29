/**
 * Classes are permissions, not costumes (VISION / decided item #11). A class is
 * a hard allow-list of tools, enforced before the model sees the option.
 *
 * A lookup table, like room assignment — adding a class is a data change.
 * `toolsForClass` returns `undefined` for an unknown class, meaning "no
 * restriction" (inherit the default tool set); callers decide if that is safe.
 *
 * Bash is one tool spanning many capabilities, so the allow-list alone cannot
 * express "Runner may run tests but not write source" or "Keeper may only run
 * git". Those live in `bashCommandAllowed`, enforced at call time via the SDK's
 * `canUseTool` callback (see `agent/session.ts`) — the same mechanism as the
 * encounter screen, just automatic.
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

/** The built-in tool names each class may use. Mirrors VISION's table. */
const CLASS_TOOLS: Readonly<Record<string, readonly string[]>> = {
  // Physically cannot modify anything.
  Scout: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"],
  // The only class that ships code.
  Builder: ["Read", "Grep", "Glob", "Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"],
  // Finds problems, cannot quietly fix them.
  Reviewer: ["Read", "Grep", "Glob"],
  // Runs tests/builds, cannot touch source — cannot make a red suite green by
  // weakening the test. `Bash` here is gated further by `bashCommandAllowed`.
  Runner: ["Bash", "Read", "Grep", "Glob"],
  // The only class allowed to write history. `Bash` here is gated to git.
  Keeper: ["Bash", "Read", "Grep", "Glob"],
};

export function toolsForClass(agentClass: string): string[] | undefined {
  const tools = CLASS_TOOLS[agentClass];
  return tools ? [...tools] : undefined;
}

export function knownClasses(): string[] {
  return Object.keys(CLASS_TOOLS);
}

/**
 * Per-class Bash policy. A command passes when EVERY `;`/`&&`/`||`/`|`-separated
 * segment matches no `deny` pattern and (when `allow` is non-empty) at least one
 * `allow` pattern. Splitting on the operators is what stops `git log && rm -rf`
 * sneaking a second command past a first-token check.
 */
interface BashPolicy {
  allow: readonly RegExp[];
  deny: readonly RegExp[];
  /** Shown to the model on denial and written to the event log. */
  reason: string;
}

/** Leading `VAR=val ` assignments before the real command. */
const ENV_PREFIX = /^(?:\s*\w+=\S*\s+)*/.source;

/** Belt-and-braces deny patterns applied on TOP of an allow-list: even an
 *  allow-listed first token (`npm`, `node`) can still smuggle a write via a
 *  redirection, an inline `-e`, a `data:` loader or a `NODE_OPTIONS`. */
const WRITE_SMELLS: readonly RegExp[] = [
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

/** First tokens a Runner may invoke: test/build/lint runners, language
 *  toolchains, read-only inspection, read-only git, and the repo's own
 *  `./`, `bin/`, `scripts/` entrypoints. Anything else is denied by default —
 *  `ed`, `sed`, `printf`, a bare `>` — without needing to be listed. Extend as
 *  real repos need it. */
const RUNNER_RUNNERS =
  "npm|pnpm|yarn|bun|npx|node|deno|nx|turbo|lerna|corepack|" +
  "python[0-9.]*|pytest|tox|nox|uv|poetry|pipenv|hatch|pdm|" +
  "go|cargo|rustc|mvn|gradle|bundle|rake|rspec|ruby|dotnet|mix|dune|swift|ctest|" +
  "make|cmake|ninja|bazel|meson|task|just|earthly|" +
  "jest|vitest|mocha|ava|tap|playwright|cypress|eslint|prettier|tsc|biome|ruff|" +
  "mypy|flake8|pylint|black|phpunit|composer|" +
  "cat|less|more|head|tail|grep|rg|ag|ls|find|tree|diff|wc|stat|pwd|echo|printf|" +
  "true|false|which|type|file|date|whoami|uname|test|sleep|sort|uniq";

const CLASS_BASH_POLICY: Readonly<Record<string, BashPolicy>> = {
  Runner: {
    allow: [
      new RegExp(`${ENV_PREFIX}(?:${RUNNER_RUNNERS})(?:\\s|$)`),
      new RegExp(`${ENV_PREFIX}(?:\\./|bin/|scripts/)\\S`),
      new RegExp(
        `${ENV_PREFIX}git\\s+(?:status|log|diff|show|branch|remote|rev-parse|` +
          `ls-files|ls-tree|blame|describe|cat-file|for-each-ref|shortlog|` +
          `config\\s+--get)(?:\\s|$)`,
      ),
    ],
    deny: WRITE_SMELLS,
    reason:
      "Runner may only run tests, builds, linters and read-only inspection.",
  },
  Keeper: {
    allow: [
      new RegExp(`${ENV_PREFIX}git(?:\\s|$)`),
      // Read-only inspection is fine alongside git.
      new RegExp(
        `${ENV_PREFIX}(?:cat|less|head|tail|grep|rg|ls|find|diff|wc|stat|pwd|echo|true)(?:\\s|$)`,
      ),
    ],
    // Keeper writes history — not config, not hooks, not `-c` overrides that
    // turn a pager or hook into a shell. Those are how "only git" becomes
    // "arbitrary code".
    deny: [
      /\bgit\s+config\b(?![^|;&]*--get\b)/,
      /\bgit\s+-c\s+\S*(?:pager|hooksPath|editor|sshCommand|askpass)/i,
      /\bgit\s+(?:filter-branch|filter-repo)\b/,
    ],
    reason: "Keeper may only run git (plus read-only inspection).",
  },
};

/** Segments of a compound command, split on `;` `&&` `||` `|` `&` and newlines.
 *  fd-dup redirections (`2>&1`, `>&2`) are blanked first so their `&` is not
 *  mistaken for a background/`and` separator. */
function bashSegments(command: string): string[] {
  const parts = command
    .replace(/\d*>&[\d-]+/g, " ")
    .split(/\|\||&&|[;&|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [command.trim()];
}

/**
 * Pure: may this class run this shell command? Returns `{ ok: true }` for any
 * class without a Bash policy (Builder, or an unknown class).
 */
export function bashCommandAllowed(
  agentClass: string,
  command: string,
): { ok: true } | { ok: false; reason: string } {
  const policy = CLASS_BASH_POLICY[agentClass];
  if (!policy) return { ok: true };

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
