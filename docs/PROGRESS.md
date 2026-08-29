# PokeHub — progress

Running record between sessions. `/kickoff` reads this, `/wrap-up` updates it.
The spec is `VISION.md`. The always-on rules are `CLAUDE.md`.

## Next up

The map exists and the spine is reviewed + verified end-to-end. **The only thing left for
Phase 0 is the pass judgment** — it needs a human at the keyboard, not more code.

Run it: `npm run dev`, spawn two agents against a real repo (need `claude` logged in), and
decide both bars honestly:
1. Can you answer "what are both doing right now" faster than with two terminals?
2. Does the encounter screen make you actually read a command you'd normally wave through?

- Fail bar 1 → the map is decoration; redesign the map layer, don't push on.
- Fail bar 2 → the encounter framing isn't earning its keep; rework it.
- Both pass → Phase 0 is done, start Phase 1 (full room set for one project, journal with
  diffs, raw-stream toggle).

Notes for that session:
- The map is `src/renderer/src/WorldMap.tsx`, mounted in `App.tsx` as a panel *beside* the
  text world view (raw text stays one keypress away — both panels are always visible).
- `npm run spike -- --cwd <repo> --class <Class> --prompt "…"` exercises the whole pipe
  headlessly (no Electron, no map) and prints world state per event — best for debugging the
  reducer, not for judging the map.
- Renderer main chunk is ~1.08 MB now that Pixi is bundled (past Vite's 500 kB warning).
  Code-split before Phase 4 packaging; ignore until then.

## Done

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
- **Bundling `pixi.js` pushes the renderer chunk to ~1.08 MB**, past Vite's 500 kB warning.
  Expected; code-split at Phase 4 packaging.

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
