# PokeHub — coding standards

How we build **PokeHub itself** in this repo. Not about the agents the app spawns
at runtime — this is the contributor guide for the codebase.

`VISION.md` is the spec, `CLAUDE.md` the always-on rules, `PROGRESS.md` the
running record. This file is the "how to write the code" layer under all three.
It changes only when a convention actually changes — not for status or notes.

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

- **No barrel files.** Import the file directly: `import { reduce } from "../core/reducer.ts"`.
  No per-directory `index.ts` that re-exports. (Registry modules that import
  siblings to build a lookup are fine — that's code, not a re-export.)
- **Relative imports, always with the explicit `.ts` / `.tsx` extension.** Node's
  native type-stripping (`npm run spike`) requires it. No path aliases.
- `core/` is the source of truth. The renderer holds no state the event log
  can't rebuild.

---

## 2. Design patterns

The codebase leans on six patterns. These are the sanctioned solutions to their
problems — **reach for one of these before inventing structure.**

| Pattern | Lives in | Rule |
|---|---|---|
| **Event sourcing + pure reducer** | all of `core/` | The spine. Append-only log → pure `reduce()` → world state. Never bypass it. |
| **Data-driven dispatch** | `rooms`, `agent-class`, `toolKind` | Behavior keyed by an enum is a lookup table/object, never a `switch` or `if`-chain. Adding a case is a data edit. |
| **Boundary adapter** | `agent/translate.ts`, `summarizeToolOutput` | External shapes (SDK messages, Electron events) are converted to domain types at the edge. `core/` never sees an SDK type. |
| **Observer / one-way feed** | `onAgentEvent`, `onPermissionAsk` → `useWorld` | main → renderer is a one-directional event stream. No polling, no request/response where an event suffices. |
| **Factory → opaque handle** | `spawnAgent()` → `AgentHandle` | Callers get a handle with a small verb surface (`followUp`, `stop`). They never touch SDK internals. |
| **Facade** | `PokeHubBridge` over raw IPC | The renderer calls typed methods, not `ipcRenderer.invoke("magic-string")`. |

**Beyond these, don't add pattern machinery** without a concrete present-tense
need (CLAUDE.md: "Three similar lines is better than a premature abstraction").
No DI container, no generic `Registry<T>`, no speculative interfaces.

**Two deliberate exceptions, with rationale recorded so they're not "simplified" away:**

- **`AgentSupervisor` (class), in `main/`.** Owns the `Map<agentId, AgentHandle>`,
  the spawn/follow-up/stop/stop-all lifecycle, and pending-ask resolution —
  currently loose module state in `main/index.ts`. A class because there is
  exactly one, it has real invariants (every pending ask resolves exactly once),
  and instantiating it in a test beats resetting module globals. Injected into
  the IPC handlers, **not** a global singleton import.
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

- **Size:** ~200 lines is a smell worth a look; over 300 needs a reason at
  review. The binding rule is **one clear responsibility per file** — a focused
  280-line reducer beats four contrived fragments.
- **One primary export per file.** Small private helpers in the same file are
  fine. A second exported concept is a second file.
- **File names:** `kebab-case.ts` for modules (`event-log.ts`, `use-world.ts`,
  `bash-guard.ts`). `PascalCase.tsx` for React components (the file is named for
  the component). One component per file; a small private sub-component may share
  the file only if it is never reused elsewhere.
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
- **Prefer many small, exact files over one long one.** When a file does two
  things, split it — the import list then documents the pieces. "Contrived
  fragments" means a split with no seam, not a small file.

---

## 4. TypeScript

- `strict` with every current flag on: `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`,
  `isolatedModules`.
- **No `any`.** Use `unknown` and narrow at the boundary (`translate.ts` is the
  model).
- **No `enum`.** Union of string literals.
- **Discriminated unions** for anything with a `kind` / `type` tag. Exhaustive
  `switch` with a `default` branch that stays type-safe (returns unchanged
  state / throws a typed error).
- **`interface`** for object, state, event, and props shapes. **`type`** for
  unions, aliases, and utility types. (This is the code today.)
- **Explicit return type on every exported function and hook.** Catches inference
  drift; documents the surface. ESLint enforces it.
- **`core/` types are deeply `readonly`** — every field `readonly`, lists as
  `readonly T[]`. The compiler enforces "the reducer never mutates"; the code
  already builds fresh objects and arrays everywhere (`[...xs, x]`, never
  `.push`), so the friction is near zero.

---

## 5. Naming

| Thing | Convention | Example |
|---|---|---|
| Types / interfaces | `PascalCase`, no `I`/`T` prefix | `AgentState`, `AgentClassPolicy` |
| Module constants | `SCREAMING_SNAKE_CASE` | `STALL_TIMEOUT_MS`, `RECENT_TOOLS_LIMIT` |
| Functions | verb phrase | `roomForTool`, `spawnAgent`, `resolveAsk` |
| Pure helpers returning a value | say what they return | `bubbleLine`, `agentHue`, `toolTarget` |
| Booleans (vars, props, fields) | `is` / `has` / `should` / `can` / `was` | `isStalled`, `canRemember`, `hasExited` |
| Event kinds | `domain.verb_past` | `agent.spawned`, `tool.finished`, `permission.resolved` |
| Hooks | `useThing` | `useWorld` |
| React components | `PascalCase` | `WorldMap`, `AgentFocus` |

---

## 6. React & the renderer

- **Components render; hooks and selectors decide.** A component is JSX plus
  event handlers that call into a hook. No data-shaping in the body.
  - Derived-from-world-state values → **`core/` selectors** (pure, testable,
    reusable from tests).
  - Stateful UI behavior (the permission-ask queue, the composer/send flow, the
    raw-log filter) → **custom hooks** in `renderer/src/hooks/`.
  - Target: `App.tsx` is a thin shell wiring hooks to components.
- **Styling: CSS Modules, one `.module.css` co-located per component.** Scoped
  class names, zero `style={{}}` for static styling.
  - Values computed from state (agent hue, an HP-bar width) are passed as **CSS
    custom properties**: `style={{ "--hue": hue }}`, consumed in the `.module.css`.
  - `styles/global.css` holds resets, the color palette / tokens, and truly
    global layout.
- One component per file. Split when it exceeds ~80 lines *or* the moment a
  piece of it is reused.
- **Reuse before re-rendering markup.** Reach for an existing primitive
  (`AgentDot`, `StatusDot`, `cx`) before writing a `<span>`/`<div>`. If two
  places render the same shape, it is a component — a named `<BuildingCard>`
  beats a fourth nested `<div>` that another file also has.
- **Keep the tree shallow.** A wrapper element that exists only to group for CSS
  usually means the group wants to be its own component.
- Props: a named `interface FooProps`. No inline prop object types.

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

- **Validate and throw only at boundaries:** IPC handlers in `main/`,
  `session.ts`, the event-log write stream, `preload/`. That's where untrusted
  input and failable I/O enter.
- **`core/` never throws.** Unknown event kinds return state unchanged;
  malformed input is handled or ignored. This is what keeps replay of old logs
  from crashing on events added later.
- **Expected failures return a typed result**, not an exception:
  `{ ok: true } | { ok: false; reason: string }` (as `bashCommandAllowed` and
  `AgentHandle.followUp` already do). Reserve `throw` for "this should never
  happen".
- Unexpected errors bubble to the nearest boundary and are logged there
  (`console.error` in `main`, the `EventLog` error handler for write failures).
- The renderer degrades rather than crashes: no `window.pokehub` → empty,
  warned, alive world.

---

## 9. Comments & docs

Readable code first. A well-named function, type, or file beats a paragraph
explaining a vague one — rename or split before reaching for a comment. Prose
that just narrates the code is noise; cut it.

- **Comment the non-obvious, and only that.** A constraint that isn't visible
  locally, a workaround for an upstream quirk (with a pointer), an invariant the
  types can't express, a "why this and not the obvious thing". One or two lines.
- **JSDoc only where the signature doesn't already say it** — a non-trivial
  return shape, units, ordering guarantees, a caveat. A single sentence is
  enough. Don't ritually document `agentList(world)` or a hook that returns
  exactly what its name promises. `@param`/`@returns` only when they add
  something the types don't.
- **Module header: one line, when the filename and exports don't already tell
  you.** Add a real invariant if the file carries one ("only place that imports
  Electron", the reducer's purity). A render file not under unit test says so in
  a line.
- Keep comments current — a stale one is worse than none.
- Session history and "added for X" belong in `PROGRESS.md` and commit messages,
  never the code.

---

## 10. Testing

- **Pure logic is cheap to test — so test it.** Everything in `core/` and the
  agent-side translators (`translate`, `summarizeToolOutput`) is exercised
  directly against fixtures. Recorded real SDK messages are the fixtures for
  translation; hand-built event arrays for the reducer.
- **Pixi / React render code is not unit-tested.** It's verified live in Chrome
  via the throwaway stub (see `PROGRESS.md` Gotchas). A render file says so in a
  one-line header.
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
