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
    components/              one .tsx + its .module.css each
    hooks/                   use-*.ts
    styles/                  global.css, tokens
  ```

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
- One component per file. Split a component when it exceeds ~80 lines *or* the
  moment a piece of it is reused.
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

- **Every exported function / hook gets a JSDoc block:**
  ```ts
  /**
   * One sentence on what it does and why it exists.
   *
   * @param events - the log to fold, oldest first
   * @param from   - the world state to fold onto
   * @returns the resulting world state (a new object)
   */
  ```
  Skip `@param`/`@returns` only when the function takes nothing and returns
  nothing meaningful.
- **Every module gets a header block** stating its single responsibility and any
  invariant it upholds or relies on (the reducer's purity, the per-agent
  `seq` de-dup, "this file is the only place that imports Electron"). A render
  file that isn't unit-tested says so and points at how it's verified.
- **Inline `//` comments explain *why*, never *what*.** A comment that
  paraphrases the code it sits on should be deleted and the code renamed
  instead. Good inline comments: a non-obvious constraint, a workaround for a
  specific upstream quirk (with a pointer), an invariant that isn't visible
  locally.
- Keep them current. A stale comment is worse than none.
- Session history, "added for X", and TODO-narrative belong in `PROGRESS.md` and
  commit messages, not in the code.

---

## 10. Testing

- **Pure logic is cheap to test — so test it.** Everything in `core/` and the
  agent-side translators (`translate`, `summarizeToolOutput`) is exercised
  directly against fixtures. Recorded real SDK messages are the fixtures for
  translation; hand-built event arrays for the reducer.
- **Pixi / React render code is not unit-tested.** It's verified live in Chrome
  via the throwaway stub (see `PROGRESS.md` Gotchas). Each render file's header
  says this.
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
