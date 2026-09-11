# PokeHub — coding standards

How we build **PokeHub itself** in this repo. Not about the agents the app spawns
at runtime — this is the contributor guide for the codebase.

`VISION.md` is the spec, `CLAUDE.md` the always-on rules, `PROGRESS.md` the
running record. This file is the "how to write the code" layer under all three.
It changes only when a convention actually changes — not for status or notes.

**General engineering standards — documentation, file size, reuse, abstraction,
coupling, naming, errors — live in `~/.claude/CLAUDE.md` and the
`coding-standards` skill, and apply here unedited.** This file records only what
is *specific to PokeHub*, or where PokeHub deliberately differs. Where the two
conflict, this file wins. Run `/standards-review` before a commit.

---

## 1. Architecture & module boundaries

The layering, innermost to outermost:

```
core/      pure. zero runtime dependencies. no framework, no I/O, no Date.now().
  │
agent/     the Claude Agent SDK. Node-only. writes the event log.
main/      Electron main process. owns child processes + windows.
  │
preload/   the contextBridge shim.
renderer/  React + PixiJS. draws world state. never spawns or writes.

shared/    IPC channel names + permission types. importable by any side.
```

**Dependency rules (enforced by ESLint `no-restricted-imports`):**

| From | May import | May **not** import |
|---|---|---|
| `core/` | other `core/` files only | anything else, any npm package |
| `agent/` | `core/`, `shared/`, the SDK | `main/`, `preload/`, `renderer/`, Electron |
| `main/` | `core/`, `agent/`, `shared/`, Electron/Node | `renderer/`, `preload/` |
| `preload/` | `shared/`, Electron | `core/`, `agent/`, `main/`, `renderer/` |
| `renderer/` | `core/`, `shared/`, React, Pixi | `agent/`, `main/`, `preload/`, Node built-ins |

- **Relative imports, always with the explicit `.ts` / `.tsx` extension.** Node's
  native type-stripping (`npm run spike`) requires it. No path aliases.
  (Global rule already bans barrel files; registry modules that import siblings
  to build a lookup are code, not a re-export, and stay fine.)
- `core/` is the source of truth. The renderer holds no state the event log
  can't rebuild.

---

## 2. PokeHub's pattern map

**This is the map the global rules point at.** Before introducing any pattern,
reuse the instance already here rather than adding a second mechanism for the
same job:

| Pattern | Lives in |
|---|---|
| Event sourcing + pure reducer | all of `core/` — the spine. Append-only log → pure `reduce()` → world state. Never bypass it. |
| Data-driven dispatch | `rooms`, `agent-class`, `toolKind` |
| Boundary adapter | `agent/translate.ts`, `summarizeToolOutput` |
| Observer / one-way feed | `onAgentEvent`, `onPermissionAsk` → `useWorld` |
| Factory → opaque handle | `spawnAgent()` → `AgentHandle` (`followUp`, `stop`) |
| Facade | `PokeHubBridge` over raw IPC |

**Two deliberate exceptions, with rationale recorded so they're not "simplified" away:**

- **`AgentSupervisor` (class), in `main/`.** Owns the `Map<agentId, AgentHandle>`,
  the spawn/follow-up/stop/stop-all lifecycle, and pending-ask resolution.
  A class because there is exactly one, it has real invariants (every pending ask
  resolves exactly once), and instantiating it in a test beats resetting module
  globals. Injected into the IPC handlers, **not** a global singleton import.
- **`AgentClassPolicy` strategy modules, in `core/agent-class/`.** One module per
  class (`scout.ts`, `builder.ts`, `reviewer.ts`, `runner.ts`, `keeper.ts`), each
  declaring its tool allow-list and (for Runner/Keeper) its Bash policy against a
  shared `AgentClassPolicy` type. The Bash-command parsing (`bashSegments`,
  `WRITE_SMELLS`, the default-deny allow-list logic — full of hard-won edge cases)
  stays in **one** shared `bash-guard.ts`; the class modules only declare
  patterns and call it. A `registry.ts` maps class name → policy.

**Singletons:** banned in `core/` and anything replay-touching (kills
determinism). One injected instance in `main/` is allowed.

---

## 3. File organization

Size and one-export-per-file are global (§2). PokeHub specifics:

- **File names:** `kebab-case.ts` for modules (`event-log.ts`, `use-world.ts`,
  `bash-guard.ts`). `PascalCase.tsx` for React components.
- **Tests** live in a `__tests__/` folder beside the code they cover:
  `core/__tests__/reducer.test.ts`.
- **Renderer** is organized by kind:
  ```
  renderer/src/
    main.tsx, App.tsx        entry + top-level shell
    components/              one .tsx + its .module.css each; a component with
                             real internal complexity may own a subfolder of
                             plain-.ts render helpers (see components/world-map/)
    hooks/                   use-*.ts
    styles/                  global.css, tokens
  ```

---

## 4. TypeScript

Follows the global TypeScript reference as-is (`strict` + every current flag,
no `any`, no `enum`, discriminated unions, `interface` for shapes / `type` for
unions, explicit return types on exports). One PokeHub emphasis:

- **`core/` types are deeply `readonly`** — every field `readonly`, lists as
  `readonly T[]`. The compiler enforces "the reducer never mutates"; the code
  already builds fresh objects and arrays everywhere (`[...xs, x]`, never
  `.push`).

---

## 5. Naming

Global naming rules apply. PokeHub-specific conventions:

| Thing | Convention | Example |
|---|---|---|
| Event kinds | `domain.verb_past` | `agent.spawned`, `tool.finished`, `permission.resolved` |
| Pure helpers returning a value | say what they return | `bubbleLine`, `agentHue`, `toolTarget` |
| Module constants | `SCREAMING_SNAKE_CASE` | `STALL_TIMEOUT_MS`, `RECENT_TOOLS_LIMIT` |

---

## 6. React & the renderer

Global React rules apply (components render / hooks decide, CSS Modules, ~80-line
split, named `FooProps`). PokeHub specifics:

- Derived-from-world-state values are **`core/` selectors** — pure, testable, and
  callable from tests without React. Not `useMemo` in a component.
- Stateful UI behavior (the permission-ask queue, the composer/send flow, the
  raw-log filter) → custom hooks in `renderer/src/hooks/`.
- `App.tsx` is a thin shell wiring hooks to components.
- **Reach for the existing primitives** — `AgentDot`, `StatusDot`, `cx` — before
  writing a `<span>`/`<div>`.
- Values computed from state pass as CSS custom properties:
  `style={{ "--hue": hue }}`, consumed in the `.module.css`.

---

## 7. Purity & side effects

- **`core/` is pure and total.** No I/O, no `Date.now()`, no randomness, no
  mutation of inputs. Given the same events it always produces the same world.
- **Time-dependent decisions live in selectors** and take `now` (epoch ms) as an
  explicit argument (`isStalled(agent, now)`). Never read the clock inside the
  reducer.
- Side effects are allowed only in `agent/` (SDK, log writes), `main/`
  (processes, windows, files), and `preload/`. The renderer's only effects are
  React state and IPC calls made through the bridge facade.

---

## 8. Error handling

Global error rules apply (typed results for expected failures, throw only for
"should never happen", never swallow). PokeHub's boundaries and one hard rule:

- **Validate and throw only at these boundaries:** IPC handlers in `main/`,
  `session.ts`, the event-log write stream, `preload/`.
- **`core/` never throws.** Unknown event kinds return state unchanged;
  malformed input is handled or ignored. This is what keeps replay of old logs
  from crashing on events added later.
- Unexpected errors bubble to the nearest boundary and are logged there
  (`console.error` in `main`, the `EventLog` error handler for write failures).
- The renderer degrades rather than crashes: no `window.pokehub` → empty,
  warned, alive world.

---

## 9. Comments & docs

The global documentation policy applies verbatim: readable code first, inline
comments only for a non-local constraint / upstream quirk / invariant the types
can't express / why-not-the-obvious-thing, and a short purpose+params+returns
docblock on every exported function.

Two PokeHub additions:

- **Module header: one line, when the filename and exports don't already tell
  you** — and make it a real invariant ("only place that imports Electron", the
  reducer's purity).
- **A render file not under unit test says so in a one-line header.**

---

## 10. Testing

- **Pure logic is cheap to test — so test it.** Everything in `core/` and the
  agent-side translators (`translate`, `summarizeToolOutput`) is exercised
  directly against fixtures. Recorded real SDK messages are the fixtures for
  translation; hand-built event arrays for the reducer.
- **Pixi / React render code is not unit-tested.** It's verified live in Chrome
  via the throwaway stub (see `PROGRESS.md` Gotchas).
- **Never mock the reducer or the event types.** Tests fold real events through
  the real `reduce()`. A mock that drifts from the reducer is a test that lies.
- Beyond that, coverage is a judgment call per change — write the test when it
  would catch a real regression, skip the ceremony when it wouldn't.
- `npm test` (vitest) must be green before every commit.

---

## 11. Tooling

- **Prettier** — 2-space indent, double quotes, semicolons, trailing commas
  everywhere, **print width 100** (the source was already written at ~100; test
  fixtures with long object literals get reflowed), always-parenthesize arrow
  params. `npm run format` writes, `npm run format:check` verifies.
- **ESLint** (flat config, `eslint.config.js`): `typescript-eslint`
  `recommended-type-checked` + `stylistic-type-checked`,
  `eslint-plugin-react-hooks` for `renderer/`, the boundary
  `no-restricted-imports` table from §1 (test files exempt), and
  `eslint-config-prettier` last so it never fights the formatter. A few
  stylistic rules are tuned where the codebase has a deliberate idiom
  (`dot-notation` allows index-signature bracket access; `require-await` is off —
  `async` is used to pin a Promise return shape). `npm run lint`.
- **`npm run check`** = `typecheck` + `lint` + `format:check` + `test`. Run it
  before every commit. During the Phase 1.5 refactor, rules pending a later
  slice sit at `"warn"` (they don't fail `check`); Slice 8 promotes the last of
  them and adds `--max-warnings 0`. CI (Phase 4) runs `check`.
- New runtime dependencies need a real justification — the $0 promise and the
  bundle size both matter. Dev dependencies: lighter bar, still deliberate.
