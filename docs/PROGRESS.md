# PokeHub — progress

Running record between sessions. `/kickoff` reads this, `/wrap-up` updates it.
The spec is `VISION.md`. The always-on rules are `CLAUDE.md`.

## Next up

The full data spine exists and is tested; **the renderer is still text, not a map**. Next task:
replace the renderer's world panel with a **PixiJS** canvas showing the four Phase 0 rooms
(Library, Forge, Gym, Center) plus the Route, and a sprite per agent that fast-travels to the
room `roomForTool` returns when a `tool.started` event lands. Feed it from the same
`useWorld()` hook (already folds the live feed + on-mount snapshot through the pure reducer).
Placeholder art only — coloured blocks. Then run the Phase 0 two-agent pass test: two agents
readable faster than two terminals, and the encounter makes you actually read a command.

Wiring notes for that task:
- `src/renderer/src/useWorld.ts` gives `{ world, log }`; `world.agents` is `Record<id, AgentState>`,
  each with `location` (`"library" | "forge" | "gym" | "center" | "route"`), `status`, `activeTools`,
  `thought`.
- Pixi should be a React component that owns its own canvas (not the page); `pixi.js` not yet
  installed — `npm i pixi.js`.
- Position must snap to `location` on every render; animation is best-effort (decided item #2).
- To see it live you need `claude` logged in and a real repo path; `npm run spike -- --cwd
  <repo> --prompt "..."` exercises the whole pipe headlessly without Electron.

## Done

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

## Gotchas

_Things learned the hard way. One line each — what broke, and what fixed it._

- **A subagent `git add`-ed the whole tree mid-task.** Not a commit, but unexpected; `git reset`
  restored the clean state. Watch for it after fork-based edits.
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

## VISION.md needs updating

_Decisions made in a session that contradict the spec. Recorded here, not edited into the spec._

- VISION's "a Rust supervisor is the right tool for babysitting N child processes" is inverted
  for this app — the supervision lives in the Node Agent SDK, so Electron is the better fit.
  Not a spec change, but the Tauri rationale in VISION §Architecture/Stack is now outdated.
