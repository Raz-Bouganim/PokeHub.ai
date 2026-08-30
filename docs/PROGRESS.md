# PokeHub — progress

Running record between sessions. `/kickoff` reads this, `/wrap-up` updates it.
The spec is `VISION.md`. The always-on rules are `CLAUDE.md`.

## Next up

**Phase 1 — Legibility.** Goal for the phase: full room set for one project, encounter-style
permission dialog, journal with diffs, raw-stream toggle — and it must genuinely beat a
terminal for a *single* agent. Follow-up interaction + full-text capture + agent-focus view
all landed 2026-08-30 and were verified live.

**Start here — per-agent raw log.** The RAW EVENT LOG panel in `App.tsx` interleaves every
agent and each agent's `seq` restarts at 001, so a single agent can't be followed. Add:
- A per-`agentId` filter — reuse `selectedId` (already drives the composer and the focus
  panel): when an agent is selected, offer "only this agent" for the raw log too. Every event
  carries `e.agentId` already; the list is `useWorld().log`.
- A stable colour per agent (hash `agentId` → hue) on both the raw-log rows and, ideally, the
  sprite tint accent — so the same agent reads the same everywhere.
- Keep the interleaved "all" view as the default; the filter is a toggle, not a replacement.
The focus panel (`AgentFocus.tsx`) is the place to surface the filtered view, or a segmented
control on the raw-log panel header — either is fine.

Then, in rough priority order (all Phase 1):
- **Journal with diffs.** Files *read* vs *modified* visually distinct (VISION "Legibility
  features"). The `recentTools` trail on `AgentState` (added this session, `RecentTool[]`,
  cap 8) is the seed — it already carries `tool` + `target` + `ok`; the journal is the
  unbounded, grouped-by-turn version with `+N / -M` from `tool.finished.summary`.
- Full room-set polish, encounter-dialog polish.
- Swap the hand-rolled `Markdown.tsx` for `react-markdown` **only if** the transcript becomes
  central and the mini-renderer's gaps (nested lists, task lists) start to bite. Not now.
- UI refactor / real art is **Phase 3**, not now — acknowledged and deferred on purpose.

Reference notes:
- The map is `src/renderer/src/WorldMap.tsx`, mounted in `App.tsx` as a panel *beside* the
  text world view (raw text stays one keypress away — both panels are always visible).
- `npm run spike -- --cwd <repo> --class <Class> --prompt "…"` exercises the whole pipe
  headlessly (no Electron, no map) and prints world state per event — best for debugging the
  reducer. It now `stop()`s itself on the first `agent.turn_finished` (agents no longer
  self-exit after one turn); it does not exercise follow-up.
- `npm run dev` also serves the renderer at `localhost:5173`; it survives a missing preload
  bridge (empty world, no crash), so the map is eyeballable in a plain browser.
- `src/core/text.ts` holds the shared pure text helpers: `bubbleLine()` (markdown-aware
  one-liner for the bubble) and `toolTarget()` (short "what it touched" label). The raw-log
  panel deliberately does *not* use `bubbleLine` — it has its own literal `firstLine` so the
  log stays faithful.
- Restart `npm run dev` fully between runs — StrictMode remount + Pixi async init is fragile.
- Renderer main chunk is ~1.15 MB now that Pixi is bundled (past Vite's 500 kB warning).
  Code-split before Phase 4 packaging; ignore until then.

## Done

- **2026-08-30** — **Full assistant-text capture + agent-focus view** (Phase 1, finding #2
  from the pass test). Verified live with a Scout on the PokeHub repo across 4 turns. New
  `agent.message` event carries the verbatim reply; `translate` emits **one** per prose block
  (no more paired `agent.thinking` prose — the reducer derives the bubble via `bubbleLine`).
  `AgentState` gained `transcript` (`TranscriptEntry[]`, cap 100 + `transcriptDropped`
  counter), `recentTools` (`RecentTool[]`, cap 8, survives `tool.finished`). New
  `AgentFocus.tsx` panel: conversation (user turns rendered verbatim, assistant turns through
  a new dependency-free `Markdown.tsx`), recent-tools trail with ◌/✓/✕, HP-bar placeholder.
  Sprites are clickable (`pointertap` → select) with a selection ring. New shared
  `src/core/text.ts` (`bubbleLine`, `toolTarget`). 96 tests (was 68). Two review passes: 3
  cleanup findings then 5 more (one real bug — a Markdown infinite loop), all fixed.
- **2026-08-30** — **Follow-up interaction — resume a spawned agent with another turn.**
  Verified live: ran two agents via `npm run dev` and re-prompted each one. New events
  `agent.prompt` (source `user`, carries turn text) and `agent.turn_finished`; `translate`
  emits `turn_finished` for a clean SDK `result` (only error subtypes / stops still
  `agent.exited`). New `AgentStatus` `"idle"` (turn done, session resumable) + `promptCount`.
  `session.ts` keeps the NDJSON log open across turns via a lifecycle loop; new
  `handle.followUp(text)` runs `query({ resume: sessionId, prompt })`, chained after any
  in-flight turn. New `agent:followup` IPC + `followUpAgent` bridge method. Composer targets a
  selected agent (follow-up) vs spawning, auto-selects a freshly spawned agent, `+ new` clears.
  68 tests (was 61). Review found 5 issues, all fixed (see Decisions + Gotchas).
- **2026-08-30** — **Ran the Phase 0 pass test and it passes on both bars.** Spawned two
  agents (Rowan/Scout + Mavric/Reviewer) against a real repo via `npm run dev`: reading both
  at a glance beat two terminals, and the encounter screen made real commands worth reading.
  Phase 0 spike complete; moving to Phase 1. Four findings logged for Phase 1 (see "Next up").
- **2026-08-30** — Fixed the blank map: Pixi v8's WebGL renderer needs `unsafe-eval`, which
  the renderer CSP forbids — added a side-effect `import "pixi.js/unsafe-eval"` before
  `Application.init()`. The failure was invisible because a missing `window.pokehub` also
  crashed the whole React tree; `useWorld`/`App` now no-op without the bridge. `.map-host`
  got a fixed aspect-ratio box and WorldMap shows init failures as text. Verified the rooms
  render. Committed + pushed (`a4210f4`, `1301625`).
- **2026-08-29** — Reviewed the map + spine changes (fork) and verified the pipeline
  end-to-end against a live `claude` session on a throwaway demo repo (subagent) — spine
  PASS. Fixed all 7 review findings: Pixi async-init cleanup + no dropped world updates;
  refusal is no longer rendered as `erroring` (`refusedToolCallIds` on `AgentState`); an
  exited agent can't be revived by a late frame; raw-log React key; a dead/crashed renderer
  can no longer hang a `canUseTool` ask forever (renderer ack + 15s deliverability timeout +
  `render-process-gone`). 61 tests (was 52).
- **2026-08-29** — Real Bash enforcement for Runner / Keeper classes (`bashCommandAllowed`
  in `core/classes.ts`, wired through `session.ts` `canUseTool`). Started as a denylist, a
  live Runner-class agent beat it three times, so it's now a **default-deny first-token
  allow-list**. `spike-session.ts` gained `--class`.
- **2026-08-29** — Built the Phase 0 map: `src/renderer/src/WorldMap.tsx`, a self-contained
  PixiJS v8 canvas — four rooms + the Route as coloured blocks, one sprite per agent snapped
  to its `location` on every world change, status-tinted, with a thought bubble. Mounted in
  `App.tsx` as a panel beside the text world view. `pixi.js` added.
- **2026-08-29** — Reviewed the scaffold (subagent) and fixed all 10 findings across two
  parallel forks: per-agent `seq` de-dup (a global counter silently dropped every second
  agent), permission-ask queue + guaranteed resolution, class→tool enforcement via `query()`,
  parallel tool-call modelling, tolerant log parsing, on-mount log replay, stop path. 52 tests
  pass (was 24).
- **2026-08-29** — Built the Phase 0 scaffold: framework-free core (`events` schema, pure
  `reducer`, `rooms` lookup table, `selectors`, `classes`), agent side (`translate` SDK-stream
  → events, append-only NDJSON `EventLog`, `session` running one `claude` via the Agent SDK
  with `canUseTool`), and an Electron + React shell with a working (unstyled) encounter modal.
- **2026-08-29** — Researched Tauri v2 vs Electron (subagent); chose **Electron** for Phase 0.
- **2026-08-29** — Vision and architecture fully specified across four rounds of design.
  Fifteen decisions settled; see "Decided" in VISION.md.

## Decisions

- **2026-08-29** — **Electron, not Tauri v2**, for Phase 0 and likely v1. The Agent SDK and
  `canUseTool` are Node-only; supervising `claude`'s grandchildren (bash, MCP) is a known Tauri
  sidecar gap; bundled Chromium keeps the Pixi map identical on macOS/Windows. All business
  logic stays Electron-free so a Tauri port is a shell swap; revisit after Phase 2 with real
  footprint numbers.
- **2026-08-29** — Event log is **NDJSON on disk**, one file per agent under
  `app.getPath('userData')/sessions/<agentId>.ndjson`; **SQLite deferred** past the spike (it's
  an index layer, the file is the source of truth, which VISION requires anyway).
- **2026-08-29** — `seq` is per-log; the reducer de-dups **per agent**, not on a world-global
  counter. `WorldState.maxSeqSeen` is display-only.
- **2026-08-29** — All relative imports carry explicit `.ts`/`.tsx` extensions so the core runs
  under plain `node` (native type-stripping), not just under a bundler.
- **2026-08-29** — Classes are enforced now, not in Phase 1: `core/classes.ts` maps class →
  tool allow-list, passed as `query({ options: { tools } })`.
- **2026-08-29** — The map is a panel *beside* the text world view, not a replacement —
  VISION says raw text stays one keypress away, and the text panel is still the fastest
  debug view. Sprites snap to `location` each render, no tween (decided item #2).
- **2026-08-29** — Runner/Keeper Bash gating is a **default-deny allow-list of command
  first-tokens** + a few "write smell" deny patterns, not a denylist. A denylist against
  arbitrary shell is unwinnable — a Runner-class model told to green a suite "by any means"
  beat successive versions four times (`python3 -c` → `NODE_OPTIONS` data-URI loader → `ed -s`
  → `npm pkg set scripts.test=<sabotage>`). Stopped hardening there **on purpose**: the
  allow-list makes an escape require deliberate engineering that shows up verbatim in the
  encounter screen and the journal, which is the design. The absolute guarantee needs a
  read-only FS for the class — deferred, noted in "VISION.md needs updating".
- **2026-08-29** — A refusal (user or class rule) is logged as
  `permission.resolved{decision:"refuse"}` with `source` `"user"` vs `"system"` to tell them
  apart, and tracked in `refusedToolCallIds` so the SDK's follow-up error result settles the
  agent to `thinking`, not `erroring`.
- **2026-08-29** — Permission-ask deliverability uses a renderer ack + 15s timeout, NOT a
  decision deadline — once the renderer acks, the ask waits for the user indefinitely.
- **2026-08-30** — Keep the strict renderer CSP (`script-src 'self'`, no `unsafe-eval`) and
  make Pixi conform via `pixi.js/unsafe-eval`, rather than loosening the CSP for a library.
- **2026-08-30** — The renderer degrades without the preload bridge (no `window.pokehub` →
  empty world, warning, no crash) instead of assuming Electron — a white screen hid the real
  bug, and a browser-runnable renderer is useful for map work.
- **2026-08-30** — Phase 0 passed on both bars → the phase is now Phase 1 (Legibility). First
  Phase 1 task is **follow-up interaction** (resume a spawned agent with another turn): a
  fire-and-forget composer can't clear Phase 1's "beats a terminal for one agent" bar.
- **2026-08-30** — A clean SDK `result` is **`agent.turn_finished` → status `idle`**, not
  `agent.exited`. A session is many turns; `agent.exited` is reserved for stop / error
  subtypes / abnormal end. `idle` sprites can be re-prompted; the "finished agent stays
  finished" reducer guard still makes a real exit permanent.
- **2026-08-30** — Resume is **per-turn `query({ resume: sessionId })`**, not SDK streaming-
  input mode — matches "attach mode = tail a file", keeps `session.ts` close to the old
  one-`query()` shape, and the log just keeps appending. Between turns the `claude` process
  is gone; only the session id and the open log file persist.
- **2026-08-30** — `handle.followUp()` resolves when the turn is **accepted/queued**, not when
  it completes (a turn runs for minutes). The event stream already reports progress + outcome.
  `{ ok: false }` means only "couldn't accept" (finished / no session yet). This is why the
  IPC handler doesn't freeze the composer.
- **2026-08-30** — Spawning **auto-selects the new agent** so the next composer send continues
  its session; `+ new` deselects. Follow-up mode is keyed off `selectedId` alone (not a
  world-state lookup) so the spawn→first-event gap can't spawn a duplicate.
- **2026-08-30** — Main `stop()`s every agent on window-close / all-closed — needed now that
  the session log is held open across turns and only flushes on `stop()`.
- **2026-08-30** — **One `agent.message` per prose block, bubble derived downstream** — not a
  paired `agent.thinking` + `agent.message` for the same text. Two overlapping events in an
  append-only log means keeping two paths in sync and doubling the text on disk; the reducer
  derives the one-liner with `bubbleLine`. `agent.thinking` now only ever carries extended
  reasoning (`channel: "reasoning"`); `"prose"` is a legacy type value old logs may still hold.
- **2026-08-30** — `agent.message` drives the bubble **only when `talking`** (no tool in
  flight, not blocked) — a running tool already owns the bubble and interim prose must not
  steal it. The transcript is captured regardless.
- **2026-08-30** — Transcript + recent-tools are **capped on `AgentState`** (100 / 8) with the
  overflow still in the log; `transcriptDropped` is a real counter so the focus view can say
  "N earlier turns" honestly instead of guessing from `length >= cap` (which lies at exactly
  the cap).
- **2026-08-30** — `bubbleLine` lives in `src/core/text.ts` and is markdown-aware (skips
  headings/fences, strips inline syntax, first *sentence* not first line). The **raw-log
  panel keeps its own literal `firstLine`** — the escape-hatch log must show what the event
  actually carries, not a prettified form (VISION).
- **2026-08-30** — Hand-rolled `Markdown.tsx` (no dependency, no `dangerouslySetInnerHTML`)
  rather than `react-markdown`. Real UI polish is Phase 3; a ~200-line renderer covering
  headings / lists / code / tables is enough to beat reading raw source. Swap later if needed.

## Gotchas

_Things learned the hard way. One line each — what broke, and what fixed it._

- **Background agents `git add` the whole tree.** Seen twice now (a scaffold-review fork, then a
  verification subagent) — despite explicit "don't stage" instructions. Not a commit. `git reset`
  (no `--hard`) unstages cleanly. Assume any subagent may stage; check `git status` after they run.
- **Electron binary never downloaded during `npm install`** (sandboxed network): `extract-zip`
  in `install.js` also silently no-ops on the 95 MB zip. Fix: `ditto -x -k <cached zip>
  node_modules/electron/dist/` then `printf 'Electron.app/Contents/MacOS/Electron' > path.txt`.
  Will recur on any fresh `node_modules`.
- **Node native TS stripping rejects TS-only syntax** — constructor parameter properties
  (`constructor(private x)`) throw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Use explicit field
  declarations. Also needs `.ts` on every relative import.
- **electron-vite emits the preload as `index.mjs`** (package is `"type": "module"`), not
  `index.js` — `BrowserWindow` `preload:` path must say `.mjs`.
- **`tsconfig` needed `allowImportingTsExtensions` + `noEmit` + `jsx: react-jsx`** once explicit
  extensions and TSX landed; `@types/node` + `types: ["node"]` for the Node built-ins.
- **The Agent SDK's `allowedTools` means auto-approve, not restrict** — the option that caps the
  available built-in tool set is `tools` (`string[]` or `{type:'preset'}`).
- **SDK `result` frame** carries error subtypes (`error_max_turns`, `error_max_budget_usd`);
  collapsing them all to `exit code 1` loses the reason — capture `subtype`.
- **Pixi v8 `Application.destroy()` throws if `init()` hasn't resolved** — `this.renderer` is
  null. React StrictMode's mount→cleanup→remount hits this every dev launch. Fix: an
  `initialised` flag; cleanup only destroys a live app, the init `.then` destroys if disposed.
- **Pixi v8 `app.init({...})` is async** — `app.canvas` doesn't exist until it resolves, so a
  React map component must gate all drawing on it AND keep a `worldRef` so world updates that
  land during init aren't lost (the mount-time `world` is stale by then).
- **A Runner-class agent actively fights the Bash guard** and beat four iterations:
  `python3 -c "…write_text()"` → `NODE_OPTIONS=--experimental-loader=data:…` → `printf … | ed -s`
  → `npm pkg set scripts.test="sed -i … && node t.js"` (rewrites the script `npm test` runs,
  then cleans up so `git status` is clean). Do not try to enumerate every write primitive —
  the allow-list is the fix, the residual (`npm run <script>` bodies) is the encounter's job.
  One run polluted `~/.npmrc` via `npm config set node-options=<loader>` — `npm/pnpm/yarn
  config set` and `npm pkg set` are now denied; check `~/.npmrc` if a headless Runner spike
  acts strangely.
- **`bashSegments` split on bare `&` broke `2>&1`** — `vitest 2>&1` became two segments and
  the `1` failed the allow-list. Fix: blank `\d*>&[\d-]+` fd-dups before splitting.
- **Bundling `pixi.js` pushes the renderer chunk to ~1.15 MB**, past Vite's 500 kB warning.
  Expected; code-split at Phase 4 packaging.
- **Pixi v8 WebGL renderer needs `unsafe-eval`; the renderer CSP forbids it.** `index.html`
  has `script-src 'self'` (no `'unsafe-eval'`), so `Application.init()` threw
  "environment does not allow unsafe-eval" and the map panel sat blank. Fix: a side-effect
  `import "pixi.js/unsafe-eval"` before `Application.init()` — swaps in eval-free shader-sync
  polyfills. Keep the strict CSP.
- **A missing `window.pokehub` (preload) took the whole React tree down** — `useWorld`'s
  effect threw on `.onAgentEvent` and React unmounted everything, so even a Pixi error was
  invisible. `useWorld` + `App` now no-op without the bridge; the map renders in a plain
  browser too, which is how the CSP bug was finally caught (`npm run dev` → localhost:5173).
- **A markdown block parser that doesn't guarantee forward progress infinite-loops.**
  `Markdown.tsx`'s paragraph branch broke out of its gather loop on a line that `isBlockStart`
  recognised (e.g. a stray `| x` that failed the table check) **without** advancing `i`, so
  the outer `while` re-processed it forever and froze the renderer. Fix: the paragraph branch
  now always consumes the current line first (`buf = [t]; i++`). Any hand-rolled line parser
  needs an "i always advances" invariant.
- **`bubbleLine`'s first-sentence cut fired on abbreviations** — `"e.g. the router…"` bubbled
  as just `"e.g."`. Fix: `firstSentence()` skips a `.` that follows a known abbreviation
  (`e.g.` `i.e.` `vs.` `No.` …), sits on a digit, or lands before char 12 (fragment).
- **Re-delivered `tool.started` after its `tool.finished` double-appended to `recentTools`** —
  `alreadyActive` was false (the id left `activeTools` on finish), so a second row with a
  duplicate `toolCallId` appeared → React key collision in `AgentFocus`. Fix: also check
  `recentTools` for the id (`alreadyTrailed`) before appending.
- **`exactOptionalPropertyTypes` + a non-null-asserted `.length`** — `toolTarget()` returns
  `string | null`; `expect(toolTarget(...).length)` needs `!` or a guard in the test.
- **TS narrows a closure-mutated `let` to a stale literal.** `let lifecycle: "running" |
  "idle" | "exited"` is only ever reassigned inside the `emit` closure; TS's control-flow
  analysis doesn't see that, so a later `lifecycle === "exited"` after an earlier guard
  errored as "comparison appears unintentional". Fix: read it through a
  `const hasExited = () => lifecycle === "exited"` helper defined next to the declaration.
- **Code-review of the follow-up feature caught 5 real issues, all fixed:** (1+2) `followUp`
  awaited the whole turn → froze the composer (global `busy`) for minutes and returned
  `{ ok: true }` even on a turn that errored — now resolves on accept; (3) `send`'s `busy`
  re-entry guard used a stale closure value → double-click double-spawned, added a `useRef`;
  (4) `setSelectedId` after spawn pointed at an agent not yet in `world.agents` so `followMode`
  was briefly false → drive `followMode` off `selectedId` directly; (5) `agent.prompt` flipped
  status to `thinking` without regard for in-flight tools/permissions on out-of-order replay →
  guard on `activeTools`/`pendingPermissions` being empty.
- **Phase 0 pass test, live findings (2026-08-30):** (a) agents are fire-and-forget — the
  composer only spawns, no way to send a follow-up turn to a running/exited agent, so a
  reply that invites a follow-up dead-ends; (b) agent replies come back but are visible
  nowhere (same root cause as the thought-bubble line above); (c) the RAW EVENT LOG
  interleaves all agents and each agent's `seq` restarts at 001, so a single agent can't be
  followed — needs a per-`agentId` filter + colour; (d) UI is rough (expected — Phase 3).
  _(a) and (b) fixed 2026-08-30 — follow-up interaction + full-text capture / focus view.
  (c) is the current "Next up". (d) stays Phase 3._

## VISION.md needs updating

_Decisions made in a session that contradict the spec. Recorded here, not edited into the spec._

- VISION's "a Rust supervisor is the right tool for babysitting N child processes" is inverted
  for this app — the supervision lives in the Node Agent SDK, so Electron is the better fit.
  Not a spec change, but the Tauri rationale in VISION §Architecture/Stack is now outdated.
- VISION states the Runner class **"cannot make a red suite green by weakening the test"** as a
  flat guarantee ("Worth the whole mechanic on its own"). With `Bash` in the class that is not
  absolute — it's a default-deny command allow-list plus the encounter screen, and a
  determined agent with a permissive user could still get through (a repo's own `npm run`
  script, an unlisted runner). The honest phrasing is "hard, and visible when attempted". A
  real guarantee needs a read-only filesystem for the class — worth adding to §Classes as a
  deferred item.
