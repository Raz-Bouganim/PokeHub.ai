# PokeHub — progress

Running record between sessions. `/kickoff` reads this, `/wrap-up` updates it.
The spec is `VISION.md`. The always-on rules are `CLAUDE.md`.

## Next up

**Phase 0 is done — both pass bars cleared (2026-08-30).** Phase 1 (Legibility) starts now.
Goal for the phase: full room set for one project, encounter-style permission dialog, journal
with diffs, raw-stream toggle — and it must genuinely beat a terminal for a *single* agent.

**Start here — follow-up interaction (the #1 gap from the pass test).** Right now the composer
only *spawns*: an agent is fire-and-forget, and there is no way to send it another turn. That
alone fails Phase 1's bar. Wire the session-resume path:
- `session.ts` runs one `query()` per agent via the Agent SDK. The SDK supports resuming a
  session by its ID (we already capture `agent.session_started` with the session ID).
- Add an IPC path: renderer sends `{agentId, text}` for a live/exited agent → main resumes
  that session with a new user turn → new events append to the same NDJSON log.
- Composer UI: when an agent is selected, the composer targets it (follow-up) instead of
  spawning; keep a "new agent" affordance. VISION decision #3 = docked composer with full
  history.

Then, in rough priority order (all Phase 1):
- **Capture full assistant text.** `translate` only keeps `firstLine(text)` for the thought
  bubble; the full reply is stored nowhere. Add a fuller `agent.message` event (or widen
  `agent.thinking`) carrying the whole text, then build the agent-focus view (VISION's
  "one agent, full detail" zoom) to show it — this is finding #2 from the pass test.
- **Per-agent raw log.** The RAW EVENT LOG interleaves every agent and each agent's `seq`
  restarts at 001, so you can't follow one. Add a per-agent filter + colour. Every event
  already carries `agentId`.
- Journal with diffs (files read vs modified visually distinct), full room set polish.
- UI refactor / real art is **Phase 3**, not now — acknowledged and deferred on purpose.

Reference notes:
- The map is `src/renderer/src/WorldMap.tsx`, mounted in `App.tsx` as a panel *beside* the
  text world view (raw text stays one keypress away — both panels are always visible).
- `npm run spike -- --cwd <repo> --class <Class> --prompt "…"` exercises the whole pipe
  headlessly (no Electron, no map) and prints world state per event — best for debugging the
  reducer.
- `npm run dev` also serves the renderer at `localhost:5173`; it survives a missing preload
  bridge (empty world, no crash), so the map is eyeballable in a plain browser.
- Restart `npm run dev` fully between runs — StrictMode remount + Pixi async init is fragile.
- Renderer main chunk is ~1.15 MB now that Pixi is bundled (past Vite's 500 kB warning).
  Code-split before Phase 4 packaging; ignore until then.

## Done

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
- **The thought bubble only shows the first line of an agent's reply** — `translate` records
  `firstLine(text)` for `agent.thinking`. The full assistant response is never captured
  anywhere. Phase 1 needs an agent-focus view + a fuller text event.
- **Phase 0 pass test, live findings (2026-08-30):** (a) agents are fire-and-forget — the
  composer only spawns, no way to send a follow-up turn to a running/exited agent, so a
  reply that invites a follow-up dead-ends; (b) agent replies come back but are visible
  nowhere (same root cause as the thought-bubble line above); (c) the RAW EVENT LOG
  interleaves all agents and each agent's `seq` restarts at 001, so a single agent can't be
  followed — needs a per-`agentId` filter + colour; (d) UI is rough (expected — Phase 3).

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
