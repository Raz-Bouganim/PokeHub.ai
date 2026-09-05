import { ENV_PREFIX, WRITE_SMELLS } from "./bash-guard.ts";
import type { AgentClassPolicy } from "./policy.ts";

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

/** Runs tests and builds but cannot touch source — so it cannot make a red
 *  suite green by weakening the test. `Bash` is on the tool list but gated to
 *  the runners above plus read-only git and inspection. */
export const runner: AgentClassPolicy = {
  name: "Runner",
  tools: ["Bash", "Read", "Grep", "Glob"],
  bash: {
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
    reason: "Runner may only run tests, builds, linters and read-only inspection.",
  },
};
