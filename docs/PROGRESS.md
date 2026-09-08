# PokeHub — progress

Running record between sessions. `/kickoff` reads this, `/wrap-up` updates it.
The spec is `VISION.md`. The always-on rules are `CLAUDE.md`.

## Next up

**Phase 2 — Parallel.** Phase 1 (Legibility) and Phase 1.5 (coding-standards refactor) are done
and **merged to `main`** — PR #1, merge commit `91a8bd1` (2026-09-05). `docs/STANDARDS.md` is
now the code-conventions authority; follow it for every change and keep `npm run check`
(typecheck + lint `--max-warnings 0` + format:check + test) green before every commit.
Housekeeping: the local `phase-1.5-coding-standards` branch is merged and can be deleted.

Slice 2 (subagent tethering) done 2026-09-08 — 2a (data) + 2b (WorldMap render), committed on
branch `phase-2-subagent-tethering` (not yet merged to `main`). See Done. Remaining Phase 2
work, pick one and confirm scope with the user before building:

**Two loose ends from Slice 2, decide first:**
1. **No agent class allows the `Task`/`Agent` tool** (`src/core/agent-class/*.ts` `tools`
   lists) — the SDK `tools` cap is a hard allow-list, so a classed agent (Builder/Scout/…)
   physically cannot dispatch a subagent; only an unclassed agent can. Tethering is fully built
   but nothing triggers it for a real classed agent. Likely fix: add `Task` to Builder (and
   maybe Scout/Reviewer). Needs a call — see "VISION.md needs updating".
2. **A subagent's tool-permission prompt is attributed to the parent**, not the child —
   `session.ts` `canUseTool` only knows `opts.agentId` (the root); the SDK gives no subagent
   context on the callback. So the encounter dialog says "Boss wants to run `npm test`" when the
   subagent asked, and the parent sprite goes `blocked` while the child's tool is pending. Its
   own slice. `canUseTool`'s `{ toolUseID }` is the child's tool-use id but nothing yet maps it
   back to a `sub-…` agent at ask time.

**Then, the remaining Phase 2 slices, in order:**
- (3) **Town overview** as a new zoom level — every project a building, all agents as dots, the
  "am I done?" zoom.
- (4) **Visible rate-limit / budget gauge** — PP/Money in VISION's glance table. The
  `rate_limit_event` SDK frame (`rate_limit_info.unifiedWindows.{five_hour,seven_day}` with
  `utilization` + `resetsAt`) is the real source; `translate.ts` currently ignores it. Needs a
  new event kind + reducer field + a gauge in the renderer.

Then, in rough priority order:
- **Encounter dialog is below VISION's "killer moment" bar** (found in the 2026-09-05 QA pass):
  it shows the tool name + `JSON.stringify(input)`, not the bare command with the threatened
  action quantified ("wants to DELETE 214 files") and no INSPECT button, no agent identity.
  `components/EncounterDialog.tsx`. Its own small task — the mechanic's whole justification is
  the risk-surfacing.
- **Map identity ring is thin / buried** (same QA pass): the per-agent accent ring in
  `WorldMap.tsx` (1.5px, `r+2`) is drowned by the status ring (`r+4`) + selection ring (`r+7`),
  and vanishes on `exited` agents (container alpha 0.4). Needs an art-direction call — defer to
  Phase 3 unless it bites sooner.
- Swap the hand-rolled `Markdown.tsx` for `react-markdown` **only if** the transcript becomes
  central and the mini-renderer's gaps (nested lists, task lists) start to bite. Not now.
- UI refactor / real art is **Phase 3**, not now — acknowledged and deferred on purpose.

Reference notes (paths as of the Phase 1.5 refactor — see Done 2026-09-05):
- `docs/STANDARDS.md` is the code-conventions doc (architecture boundaries, sanctioned design
  patterns, file org, TS, naming, React, purity, errors, JSDoc, testing). `npm run check` =
  typecheck + lint (`--max-warnings 0`) + format:check + test; run before every commit.
  `npm run lint:fix` / `npm run format` autofix. `eslint.config.js` carries the import-boundary
  table and a few tuned rules (comments explain each).
- The renderer is `src/renderer/src/`: `App.tsx` (thin shell) + `components/` (WorldMap,
  AgentFocus, Markdown, Composer, AgentList, RawLog, EncounterDialog, AgentDot — each with a
  co-located `*.module.css`) + `hooks/` (use-world, use-composer, use-permission-queue) +
  `styles/global.css` (tokens + shared `.panel`/`.room`/`.status-*`, imported **before** any
  component module in `main.tsx` so modules can override). The map (`components/WorldMap.tsx`)
  is a panel *beside* the text world view. `cx.ts` joins class names (CSS Module lookups are
  `string | undefined`).
- `npm run spike -- --cwd <repo> --class <Class> --prompt "…"` exercises the whole pipe
  headlessly (no Electron, no map) and prints world state per event — best for debugging the
  reducer. It now `stop()`s itself on the first `agent.turn_finished` (agents no longer
  self-exit after one turn); it does not exercise follow-up.
- `npm run dev` also serves the renderer at `localhost:5173`; it survives a missing preload
  bridge (empty world, no crash), so the map is eyeballable in a plain browser.
- `src/core/text/` holds the shared pure text helpers, one concern per file: `bubble-line.ts`
  (`bubbleLine()`, markdown-aware one-liner), `tool-labels.ts` (`toolTarget()`, `toolKind()`),
  `summarize-tool-output.ts` (`summarizeToolOutput()` — duck-types the SDK's per-tool
  `tool_use_result` into the journal's `+N / -M` / line / match summaries; see Gotchas for the
  SDK quirks), `agent-color.ts` (`agentHue()` / `agentColor()`). The raw-log panel
  (`components/RawLog.tsx`) deliberately does *not* use `bubbleLine` — its own literal
  `firstLine` keeps the log faithful.
- Agent classes: `src/core/agent-class/` — one `AgentClassPolicy` per class file
  (`scout.ts` … `keeper.ts`), a shared `bash-guard.ts` (the default-deny Bash allow-list), and
  `registry.ts` exposing `knownClasses` / `toolsForClass` / `bashCommandAllowed`.
- Main: `src/main/agent-supervisor.ts` (`AgentSupervisor` owns the agent Map + pending asks;
  Electron injected via `SupervisorHooks`) + `spawn-id.ts` (pure `slug` / `normalizeCwd`,
  unit-tested). `index.ts` is just window + IPC wiring.
- To inspect what the SDK's `tool_use_result` actually looks like for a given tool (its `.d.ts`
  comments alone aren't reliable — see Gotchas), write a throwaway `scripts/_dump-<x>.mjs` that
  calls `query()` directly with `canUseTool: async (_n, i) => ({ behavior: "allow",
  updatedInput: i })` and logs `msg.tool_use_result` on `type: "user"` messages. Faster than
  guessing, and how two live miscounts were caught this session. Delete the script when done —
  it's a debugging aid, not part of the app.
- Restart `npm run dev` fully between runs — StrictMode remount + Pixi async init is fragile.
- Renderer main chunk is ~1.15 MB now that Pixi is bundled (past Vite's 500 kB warning).
  Code-split before Phase 4 packaging; ignore until then.

## Done

- **2026-09-08** — **Phase 2 Slice 2b: subagent tether in `WorldMap.tsx`.** Subagents
  (`AgentState.parentAgentId !== null`) render as a smaller sprite (`SUB_BODY_R` 6 vs `BODY_R`
  9) in their own room, with a thin line in the child's identity colour from the child to the
  parent sprite (+ a small dot at the parent end); the line fades (alpha 0.15) when the child
  or parent is exited/idle, and is skipped entirely when the parent has no sprite (unknown id —
  no crash). All ring radii (`identity`, `blocked`/`erroring`, `selection`) are now `r`-relative
  so they scale with the smaller body. Tethers are a single `Graphics` added to `layer` first
  so they draw beneath every sprite; redrawn each `renderAgents` after all positions are final.
  No position offset (the line carries the relationship) — noted as a possible refinement.
  Verified live in Chrome via the throwaway stub across: 2 children in different rooms, a child
  exiting (line fades), the parent moving rooms (lines follow), an orphan child (unknown
  parent → no line), a blocked child, selecting a subagent (selection ring scales), and a full
  replay of a real `npm run spike` subagent log. `npm run check` green, 141 tests (no new —
  Pixi render, not unit-tested; covered by live verification). `WorldMap.tsx` only.
  `scripts/_dump-task.mjs` deleted (throwaway from 2a).

- **2026-09-08** — **Phase 2 Slice 2a: subagent tethering — data layer.** The SDK surfaces a
  subagent inside the *parent's* `query()` stream (one session id), tagging every message with
  a top-level `parent_tool_use_id`; dedicated `system/task_started` + `task_notification` frames
  bookend it. `translate.ts` now: mints a stateless child id `sub-<Agent-tool-use-id>` (the same
  id appears on all three frame types), emits `agent.spawned` (+`agent.prompt`) for the child
  from `task_started` (gated `task_type === "local_agent"`), attributes any
  `parent_tool_use_id`-tagged message's events to the child, and exits the child on
  `task_notification`. `AgentSpawnedEvent.parentAgentId?` (optional — old logs replay);
  `AgentState.parentAgentId`; `subagentsOf()` selector; `session.ts` passes
  `forwardSubagentText: true` (so a child gets a thought bubble) and threads `cwd` into
  `translate`. Reducer: `agent.spawned` no longer force-resets an already-progressed agent
  (out-of-order tolerance), and drops `agent.exited` for an id never spawned (filters phantom
  backgrounded-Bash `task_notification`s). `npm run check` green, **141 tests (was 129)**.
  Verified end-to-end against a real `claude` stream via `npm run spike` (parent dispatches a
  general-purpose subagent that runs Bash and reports back; child spawns tethered, works, exits
  0; parent's Agent tool.finished → turn_finished → idle). Rendered in Slice 2b.

- **2026-09-05** — **Phase 1.5 — coding standards + refactor. MERGED to `main`** (PR #1, merge
  `91a8bd1`). Branch `phase-1.5-coding-standards`, 11 commits, one reviewable slice each,
  `npm run check` + `npm run build` green throughout, 129 tests (was 120), a real-`claude`
  spike verifying the pipeline end-to-end, full live-in-Chrome renderer verification via the
  stub, plus a `/code-review` pass (clean) and two agent-run QA passes. What landed:
  - **Tooling** — Prettier (printWidth 100) + flat-config ESLint
    (`typescript-eslint` recommended-type-checked + stylistic, `eslint-plugin-react-hooks`,
    architectural import-boundary rules as `no-restricted-imports`, `eslint-config-prettier`).
    `npm run check` = typecheck + lint (`--max-warnings 0`) + format:check + test.
  - **`docs/STANDARDS.md`** — the code-conventions doc (architecture boundaries, the six
    sanctioned design patterns, file org, TypeScript, naming, React, purity, error handling,
    comment/JSDoc format, testing, tooling). Referenced from `CLAUDE.md`.
  - **Structure** — tests → `__tests__/`; `core/text.ts` → `core/text/` (4 modules);
    `core/classes.ts` → `core/agent-class/` (`AgentClassPolicy` per class + shared
    `bash-guard.ts` + `registry.ts`); `main/index.ts` → `AgentSupervisor` class + pure
    `spawn-id.ts`; renderer → `App.tsx` shell (75 lines, was 306) + `components/` + `hooks/`;
    CSS Modules per component + `styles/global.css` tokens (was one 594-line `index.css`).
  - **Types** — `core/` types deeply `readonly` (the compiler now enforces "the reducer never
    mutates"); explicit return types on every non-trivial function; JSDoc `@param`/`@returns`
    on exports.
  - **Legibility fix + verify cycle** (last 3 commits) — a QA agent found the per-agent
    identity colour (`agentColor(id)`, `hsl(h,65%,65%)`) was too faint as text tint and absent
    from the focus panel. New `<AgentDot>` solid swatch beside every agent name (raw log, agent
    list, focus header); focus panel gets an `--agent-color` left-border; selected agent-list
    row keeps its identity stripe; the 4 missing `.status-*` colours added, matched to the map
    sprite tints. A verification agent then caught that `main.tsx` imported components before
    `global.css` so the focus stripe was dead code — fixed by importing `global.css` first.
  - Deviations from the plan, both in STANDARDS.md: Prettier printWidth **100** not 80 (the
    source was already ~100); ESLint base is **recommended**-type-checked not strict (strict
    flagged 220 mostly-stylistic issues). A few rules tuned — see `eslint.config.js` comments.
- **2026-09-05** — **Phase 2 Slice 1: multi-agent map legibility** — `WorldMap.tsx` now tiles
  each room's interior into one non-overlapping cell per agent (`tileRoom()`: columns sized from
  room width, rows capped so each keeps ~50px vertical; past the cap, columns narrow instead of
  rows compressing) and truncates every label to its own cell width (`fitMono()`, replacing the
  fixed 36-char cut). N agents sharing a location — the Route especially — no longer overprint
  each other's name/bubble labels. Verified live in Chrome (stub technique) across 3 scenarios:
  3 on the Route, a mixed 9-agent crowd, and 8 forced into one room (4×2 grid). tsc clean, 120
  tests pass (no new tests — Pixi render logic, not unit-testable reducer code; covered by live
  verification). Only `WorldMap.tsx` changed.
- **2026-09-05** — **Phase 1 end-to-end verification — Phase 1 declared done, moving to
  Phase 2.** Two-part check. (1) Real pipeline, headless: `npm run spike` ran a real Builder
  (`claude` 2.1.261) against a throwaway repo — walked Library→Forge→Gym, raised real
  `canUseTool` asks, wrote correct code, `npm test` passed, ended `turn_finished`→`idle`→clean
  stop. Journal captured `+2 / -1` diffs, Read line-counts, verbatim transcript; reducer output
  matched. (2) Renderer, live in Chrome via the throwaway `pokehub-stub.js` technique (see
  Gotchas) driven with real-shaped replayed events: map (4 rooms + Route, sprite room placement,
  status tint, per-agent accent ring, selection ring), encounter dialog (command shown, Always
  gated on `canRemember`), AgentFocus (conversation + `journal (N)` tabs, turn grouping,
  kind-coloured borders, diffs, ✓/✕ marks, recent-tools trail), raw log (per-agent colour +
  `only <agent>` filter), composer (follow-up mode on select, `followUpAgent` clears the prompt,
  exited-agent → spawn-mode + yellow notice), erroring/exited sprite states — all correct.
  tsc clean, 120 tests pass. **Could not** drive a real agent through the actual Electron window
  (claude-in-chrome can't touch the `BrowserWindow`); the two halves are each verified and the
  main↔renderer IPC glue is unchanged since prior live verification. **One rough spot, not a
  Phase 1 blocker, now the first Phase 2 target:** two agents parked on the Route overlap their
  name/bubble labels — `clampCenteredX()` handles edge-clipping, not inter-sprite collision.
  No code changed this session (stub file + its `index.html` script tag added then reverted).
- **2026-09-05** — **Room-set/encounter-dialog audit + two map legibility fixes** (Phase 1).
  Drove the renderer live through Chrome using a synthetic `window.pokehub` stub (see
  Gotchas) rather than asking the user to eyeball it. Found the room set (Library/Forge/
  Gym/Center + Route) and the encounter dialog already functionally complete — multi-agent
  layout, status tinting, per-agent accent rings, selection highlight, queued asks, and
  `canRemember`-gated buttons all work correctly. Fixed two real bugs in `WorldMap.tsx`: (1)
  the `⏸` pending-permission glyph rendered as a tofu box in Pixi's canvas-drawn monospace
  font — replaced with plain text (`wait: <tool>`); (2) a long agent name or thought bubble
  centered on a sprite near the canvas edge rendered partly or fully off-screen — new
  `clampCenteredX()` keeps both labels' absolute screen position inside the canvas margins.
  Also investigated and **ruled out** a third apparent bug (an exited agent's name label not
  rendering at all) — isolation testing showed it only occurs when many agents are pushed in
  a single synchronous batch (a test-harness artifact), not under normal one-event-at-a-time
  usage; not fixed, since there was nothing real to fix. tsc clean, 120 tests pass (no new
  tests — this was a rendering/visual fix, covered by live verification, not unit-testable
  reducer logic).
- **2026-09-05** — **cwd field normalization** (Phase 1, prior session's "start here"). New
  `normalizeCwd()` in `main/index.ts`: `.trim()`s the composer's folder input and expands a
  leading `~`/`~/` to `os.homedir()` before it reaches `spawnAgent`/`query()`. tsc clean, 120
  tests still pass (no new tests — `src/main` has no test coverage at all, since importing it
  drags in `electron`; consistent with existing practice, not a gap introduced here).
- **2026-09-05** — **Journal with diffs** (Phase 1, the prior session's "start here"). New
  `JournalEntry` (`AgentState.journal`, uncapped) extends `Pick<RecentTool, "toolCallId" |
  "tool" | "target" | "ok">` and adds `kind` (read/write/other), `summary`, and `turn`
  (`promptCount` at call time). New `toolKind()` and `summarizeToolOutput()` in `core/text.ts`;
  the latter duck-types the SDK's `tool_use_result` (`structuredPatch`+`gitDiff` for
  Edit/Write, match/file counts for Grep/Glob, `file.content` for Read) into the `+N / -M` /
  line / match summary, wired into `translate.ts`'s `tool.finished` draft. New `AgentFocus.tsx`
  tab (conversation / journal) rendering turn-grouped entries with a kind-coloured left border
  plus a shared ok/fail/in-flight mark. Verified live via `npm run dev` across four manual
  scenarios (grouping + diffs, refusal handling, Grep/Read line counts, abandoned-entry-on-exit)
  — two of which surfaced real SDK-shape bugs mid-verification (see Gotchas). A `/code-review`
  fork found 9 issues on the diff; fixed the 5 real ones (refusal recorded as a failure in the
  journal/`recentTools` trail; a brand-new file's Write always summarizing "+0 / -0"; a message
  batching >1 `tool_result` able to misattribute its summary; a journal entry stuck "in flight"
  forever once its owning agent exits; duplicated mark/class helpers) and consciously skipped 3
  (see Decisions). 120 tests (was 99).
- **2026-09-05** — **Per-agent raw-log filter + stable agent colour** (Phase 1, the prior
  session's "start here"). New `agentHue(agentId)` in `src/core/text.ts` (pure hash → hue
  0-359, tested). `App.tsx`'s raw-log panel gained an "only `<name>`" checkbox that appears once
  an agent is selected (default stays the interleaved "all" view); every log row now shows a
  coloured agent-name tag + matching left-border accent, and the agent-list rows in the left
  panel got the same colour treatment. `WorldMap.tsx` sprites gained a thin per-agent accent
  ring (`hsl(...)` string, Pixi's `Color` parses CSS colour strings directly) independent of
  the status-tint fill, so the same agent reads the same colour in the map, the agent list, and
  the raw log. 99 tests (was 96). Verified live via `npm run dev`.
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

- **2026-09-08** — A subagent is an **`agent.spawned` with `parentAgentId` set**, not a new
  `agent.tethered` event — the SDK's `task_started` frame carries the parent link and fires
  before any child message, so the parent is always known at spawn time.
- **2026-09-08** — The subagent tether is a **line + a smaller sprite, no position offset** —
  the child stays in whatever room its own tool calls place it (that's real state, rule 1), and
  the line + size difference carry "attached to / lesser". Nudging the child toward the parent
  risks the sibling-overlap Slice 1 fixed, for marginal gain. Refinement noted, not done.
- **2026-09-08** — A subagent's PokeHub id is **`sub-<Agent-tool-use-id>`**, derived, not
  registered — the same tool-use id appears on `task_started` (`tool_use_id`), every child
  message (`parent_tool_use_id`), and `task_notification`, so `translate` stays stateless (no
  parent→child map to keep).
- **2026-09-08** — A subagent completing is **`agent.exited`** (code 0, or 1 + `reason` on
  `failed`/`stopped`), never `idle` — a one-off is gone when done and can't be followed up
  (it has no `AgentHandle`); an `idle` sprite would invite a dead-end follow-up.
- **2026-09-08** — `translate` gates the child spawn on **`task_type === "local_agent"`** —
  `task_started` also fires for backgrounded Bash (`local_bash`) and ultracode
  (`local_workflow`); `task_notification` has no such discriminator, so the reducer's
  "can't exit an unknown agent" guard filters those instead.
- **2026-09-08** — **`forwardSubagentText: true`** on the `query()` call — the default forwards
  only a subagent's `tool_use`/`tool_result` blocks (a heartbeat); we want its text/thinking
  too so a tethered sprite gets a thought bubble like any agent.
- **2026-09-08** — Deep nesting (a subagent spawning a subagent) **tethers the grandchild to
  the session root**, not the intermediate agent — `task_started` carries no parent link and
  `translate` only knows the root id. One level of visible nesting is the Phase 2 goal; revisit
  if depth-2 becomes common.

- **2026-09-05** — **`docs/STANDARDS.md` is the code-conventions authority**, one line from
  `CLAUDE.md`; it changes only when a convention actually changes, never for status. Settled
  over 4 rounds of Q&A with the user before any code moved.
- **2026-09-05** — Prettier **printWidth 100**, ESLint base **`recommendedTypeChecked` +
  `stylisticTypeChecked`** (not `strict`) — the source was already ~100, and `strict` flagged
  220 mostly-stylistic issues that aren't this codebase's problem. Both recorded in STANDARDS.md.
- **2026-09-05** — `AgentSupervisor` is a **class** (not loose module state in `main/index.ts`):
  one instance, a real "every pending `canUseTool` ask resolves exactly once" invariant, and
  testable by instantiation. Electron is injected via a `SupervisorHooks` object, never
  imported — keeps the Tauri-port surface to `index.ts` + preload.
- **2026-09-05** — Agent classes are **one `AgentClassPolicy` module per class**
  (`core/agent-class/scout.ts` …) sharing one `bash-guard.ts`. The user chose the strategy-
  module shape; the class files stay thin (a tool list, maybe a bash policy) and `bash-guard.ts`
  keeps the hard-won default-deny edge cases in one place.
- **2026-09-05** — `core/` types are **deeply `readonly`** — the compiler now enforces "the
  reducer never mutates," previously only a header comment + the test suite. Low friction: the
  code already built fresh objects/arrays everywhere (`[...xs, x]`, never `.push`).
- **2026-09-05** — Renderer styling is **CSS Modules per component** + `styles/global.css` for
  tokens and the three cross-component primitives (`.panel`, `.room`, `.status-*`). `global.css`
  is imported **first** in `main.tsx` so a module can override a primitive at equal specificity.
- **2026-09-05** — Agent identity colour is shown as a **solid `<AgentDot>` swatch** next to the
  name, not by tinting the name text — `hsl(h, 65%, 65%)` sits too close to `--fg` (`#d7d9e8`)
  for many hues to read against the dark UI. The tint stays as a secondary cue.
- **2026-09-05** — Text `.status-*` label colours are **matched to `WorldMap`'s `STATUS_TINT`**
  (working = green, exited = muted grey, …) so a status reads the same in the panels and on the
  map. Adds the four that had no colour before (`spawning`/`thinking`/`working`/`exited`).
- **2026-09-05** — The EncounterDialog "killer moment" gap and the buried map identity ring
  (both surfaced by the QA pass) are **deferred, not fixed** — the encounter one is real
  feature work (its own task) and the ring one needs an art-direction call (Phase 3). Recorded
  in Next up so they're not lost.
- **2026-09-05** — Phase 1 declared done on **split verification** (real pipeline proven
  headless via `npm run spike`; renderer proven live in Chrome via the stub), not a single
  real-agent-through-Electron run — `claude-in-chrome` can't drive the `BrowserWindow`, the two
  halves each pass, and the main↔renderer IPC is unchanged since prior sessions verified it live.
- **2026-09-05** — Chasing the "exited agent's name label doesn't render" lead stopped once
  isolation testing (a lone agent spawned+exited in its own tick) rendered fine — the failure
  only reproduced under a 12-agent single-tick synthetic batch, a load pattern real usage never
  produces (real agents spawn one at a time, each its own IPC round-trip). Recorded as a
  gotcha, not fixed — there is nothing confirmed-real to fix, and a speculative fix for an
  unreproduced cause would be guessing.
- **2026-09-05** — `normalizeCwd()` only handles the two forms actually seen live (`~` alone,
  `~/rest`), not arbitrary `~user/...` — Node's own `os.homedir()` only resolves the *current*
  user's home, and no live failure has involved another user's tilde form. Cheapest fix for the
  confirmed bug, not a general path-expansion library.
- **2026-09-05** — An abandoned journal entry (owning agent exited before its `tool.finished`
  arrived) is surfaced **at render time** (`AgentFocus.tsx` checks `agent.status === "exited"`),
  not by mutating the stored `ok`. Keeps `JournalEntry.ok: boolean | null`'s meaning intact
  ("outcome unknown") — "will never be known" is a fact about the agent's lifecycle, not a
  fourth value the tool-call outcome needs to encode.
- **2026-09-05** — `toolKind()` (`core/text.ts`) stays a **separate lookup table** from
  `rooms.ts`'s `TOOL_ROOM`, even though they overlap on Read/Grep/Glob/Write/Edit. A
  code-review finding suggested deriving one from the other; declined — they encode different
  axes (journal read/write semantics vs. spatial room assignment), and merging them would
  couple two concerns that happen to agree today but have no reason to stay identical forever
  (e.g. `WebFetch`/`WebSearch` are journal-"read" with no room at all, since the Gate room is
  deferred).
- **2026-09-05** — The journal's `alreadyJournaled`/`tool.finished` lookups stay a plain
  `.some()`/`.map()` scan over the (uncapped) array, not an id-indexed `Set`/`Map` alongside it.
  A code-review finding flagged the O(n) cost as O(n²) over a very long session; accepted for
  Phase 1 — real session sizes are dozens of calls, not thousands, and an extra index is a
  second piece of state to keep in sync for a problem that doesn't exist yet.
- **2026-09-05** — Tool-output summaries **recompute from the SDK's own returned data**
  (`content`, `structuredPatch`) rather than trusting its precomputed counts (`numLines`,
  `totalLines`) at face value. Forced by two independent live bugs this session (Grep's
  `numFiles`, Read's `numLines` — see Gotchas): a field named `numLines` is not proof it counts
  lines correctly, so anywhere the raw content is also available, count it ourselves.
- **2026-09-05** — Map sprite layout is a **computed tiling** (`tileRoom()`), not fixed
  `x + col*74` offsets. When a room holds more agents than fit in its row budget, **columns get
  narrower and labels truncate** rather than rows compressing — stacked rows overprinting each
  other's labels is the worse failure, and a too-narrow-but-readable-on-click sprite is fine.
- **2026-09-05** — Map labels truncate to **their own cell width** (`fitMono()`), not a global
  char cap. A label centred in a cell that doesn't overlap its neighbours physically cannot
  reach another sprite's label — that non-overlap is the real collision fix; `clampCenteredX()`
  only ever handled the canvas edge, never siblings.
- **2026-09-05** — Per-agent colour is a **pure hash of `agentId` → hue**, not a registry/palette
  assigned at spawn time — no state to keep in sync, and it survives a reload since it's derived
  from the id alone. Rendered as `hsl(h, 65%, 65%)` everywhere (CSS and Pixi both parse it), so
  one function feeds three call sites (raw log, agent list, sprite ring) with no duplication.
- **2026-09-05** — The map's per-agent accent ring is a **separate ring from the status tint**,
  not a recolour of the status fill — status colour is VISION's "most valuable glance-level
  fact" and must stay legible on its own; identity is a secondary, additive signal.
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

- **A subagent's `canUseTool` prompt is attributed to the parent agent** — `session.ts`'s
  `canUseTool` closure only has `opts.agentId` (the session root), and the SDK passes no
  subagent identity on the callback, only `{ toolUseID }` (the child's tool-use id). So a
  subagent asking to run `npm test` surfaces as "«parent» wants to run npm test" and blocks the
  *parent* sprite. Not fixed in Slice 2 — needs a `toolUseID → sub-<id>` map at ask time. Logged
  as loose end #2 in "Next up".
- **Pixi child z-order is insertion order** — adding the tether `Graphics` to `layer` *before*
  any sprite `Container` keeps it painted underneath, and it stays there because every new
  sprite `addChild`s on top later. No `zIndex`/`sortableChildren` needed.
- **`javascript_tool` with a `location.reload()` then a long `await setTimeout` in the same
  call fails** — "Inspected target navigated or closed": the reload detaches the inspected
  context mid-evaluation. Reload in one call, push events in the next.
- **The SDK's Task-dispatch tool is `name: "Agent"` on the wire, not `"Task"`** — the
  `system/init` `tools` list says `Task`, but the emitted `tool_use` block is `Agent`
  (SDK docs call it "the Agent/Task tool"). `translate`/`tool-labels` handle both names.
- **Subagents ride the SAME `query()` stream and session id** — not a separate session as the
  old Slice 2 note assumed. Every subagent message carries a top-level `parent_tool_use_id`
  (envelope field, NOT inside `message`), plus `subagent_type`/`task_description`. Bookended by
  `system/task_started` (before any child message; has `tool_use_id`, `task_type`,
  `subagent_type`, `spawn_depth`, `prompt`) and `system/task_notification` (`tool_use_id`,
  terminal `status`, `summary`). Confirmed via `scripts/_dump-task.mjs` against a real run.
- **By default the SDK forwards only a subagent's `tool_use`/`tool_result` blocks**, not its
  `text`/`thinking` — set `forwardSubagentText: true` in the `query()` options to get the full
  child conversation.
- **`system/task_notification` fires for backgrounded Bash and workflows too**, with no
  `task_type` field to tell them apart from a subagent — so `translate` mints a `sub-<id>`
  `agent.exited` for all of them and the reducer drops the exit for any id it never spawned
  (new guard in `reduce()`). `task_started` is safely gated on `task_type === "local_agent"`.
- **Piping a `node scripts/*.mjs` that runs `query()` through `head` truncates the run** — when
  `head` closes the pipe after N lines, node gets SIGPIPE and the stream aborts mid-session
  (looked like the SDK hanging at message ~14). Redirect to a file, then read the file.
- **No agent class allow-lists `Task`/`Agent`** — `toolsForClass()` returns a hard `tools` cap
  for every known class and none include it, so a classed agent literally cannot dispatch a
  subagent. Only an unknown/unclassed class (cap = "no restriction") can. Flagged for a
  decision (see "VISION.md needs updating").

- **CSS Modules lose every equal-specificity tie to `global.css` unless the global sheet is
  imported first.** `main.tsx` imported `App.tsx` (which transitively pulls in every
  `*.module.css`) *before* `./styles/global.css`, so `global.css` won the cascade — a module's
  `.focusPanel { border-left: … }` override of the shared `.panel { border: … }` was silently
  dead code. Fix: `import "./styles/global.css"` before `import { App }`. Base sheet first,
  components override. (Caught by a verification agent, not by tsc/lint/build.)
- **CSS Module class lookups are `string | undefined` under `noUncheckedIndexedAccess`**
  (`CSSModuleClasses` is a bare index signature). `className={styles.foo}` is fine (React
  accepts `undefined`), but `` `a ${styles.foo}` `` trips `restrict-template-expressions` and
  can emit the literal string `"a undefined"`. Fix: a `cx(...parts)` helper
  (`src/renderer/src/cx.ts`) that filters falsy and joins.
- **The codebase was hand-formatted at ~100 cols, not 80.** Setting Prettier `printWidth: 80`
  exploded every multi-key test-fixture object literal → a ~2000-line reflow in the "adopt
  formatter" commit. Check `awk '{print length}' | sort -rn` across `src/` before picking a
  width; 100 gave a near-empty diff for the source.
- **`typescript-eslint` `strictTypeChecked` flags ~220 mostly-stylistic issues on this repo**
  (`no-non-null-assertion` ×87, `dot-notation` ×57 on index-signature bracket access,
  `no-confusing-void-expression` ×22 on React arrow handlers). `recommendedTypeChecked` +
  `stylisticTypeChecked` is the sane "type-checked" baseline; then tune a few
  (`dot-notation` `allowIndexSignaturePropertyAccess: true`; `require-await: "off"` — `async`
  is used on purpose to pin a `Promise` return shape on IPC handlers).
- **Flat-config `no-restricted-imports` import-boundary rules must exempt test files** — a
  `core/__tests__/*.test.ts` legitimately imports `node:fs`/`node:url` for fixtures. Add
  `ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"]` to each boundary config block.
- **`eslint-plugin-react-hooks` v7 (`react-hooks/refs`) flags writing `ref.current` in the
  component body.** `WorldMap` set `worldRef.current = world` during render so the async Pixi
  `init()` callback would see the latest world. Fix: move the ref sync into a `useEffect()`
  (no dep array) declared *before* the draw effects, so it flushes first.
- **`git checkout main` with no pathspec switches branches** — `git checkout main --` (empty
  path list) is treated as `git checkout main`, not a no-op. Left the working tree on `main`
  mid-session (no loss — commits were on the feature branch). Use `git switch` / `git restore`,
  which can't be misread, or always give `checkout` an explicit path.
- **claude-in-chrome cannot drive the real Electron window** — it automates Chrome tabs only,
  and the Electron `BrowserWindow` isn't one. It CAN drive the plain-browser fallback
  (`npm run dev` at `localhost:5173`), but that has no `window.pokehub` bridge, so the world is
  always empty. **Working technique to still visually verify the map/encounter dialog with
  real-looking data:** temporarily add `src/renderer/public/pokehub-stub.js` (a self-contained
  IIFE that defines `window.pokehub` with a fake `spawnAgent`/`worldSnapshot`/`onAgentEvent`/
  `onPermissionAsk`, plus a `window.__pokehubPush(event)` helper that feeds the reducer) and
  reference it with `<script src="/pokehub-stub.js">` **before** the `main.tsx` module script
  in `src/renderer/index.html` (must be a separate file, not an inline `<script>` — the CSP is
  `script-src 'self'`, no `'unsafe-inline'`). Reload the tab, then push real `PokeHubEvent`
  objects via `javascript_tool` to drive any scenario (multi-agent rooms, permission asks,
  exited/erroring states) without touching a real repo or spending real API usage. **Delete the
  stub file and revert the `index.html` script tag when done** — same throwaway-script
  convention as `scripts/_dump-<x>.mjs`, not part of the app. _Re-used 2026-09-05 for the Phase
  1 verification; that stub also exposed a `window.__ask(ask)` helper that calls the
  `onPermissionAsk` handler directly, which is how the encounter dialog got driven. Helper names
  are arbitrary per throwaway — this run used `__push` / `__ask`._
- **Map label collision with >1 agent per location was two bugs, not one** (fixed 2026-09-05,
  Phase 2 Slice 1). (1) Column spacing was a fixed 74px but the thought bubble truncated at 36
  chars (~200px), so any two agents in a room overlapped labels — fixed by tiling the room into
  non-overlapping cells and truncating each label to *its cell's* width. (2) First fix attempt
  capped row height at 46px; a sprite + name-below (`+12`) + thought-above (`-26`) needs ~50px,
  so a second row's thought bubble overprinted the first row's names — fixed by never
  compressing rows below `SLOT_ROW_H` (50) and narrowing columns instead once a room is crowded.
- **A real agent's first `Read`/`Edit` of a file often fails with a relative path** and it
  immediately retries with an absolute one (Claude Code requires absolute paths). Confirmed in
  the 2026-09-05 spike: `add.js` and `add.test.js` each logged a failed `Read` (`ok: false`)
  then a successful one. This is faithful rendering of real behaviour, not a bug — but it means
  a healthy run legitimately shows ✕ entries in the journal / recent-tools trail, so "✕ then ✓
  on the same target" is normal, not a problem to chase.
- **A single synthetic batch of many agents pushed in one JS tick can make a Pixi `Text` label
  silently fail to render** (confirmed live: 12 agents pushed via one `javascript_exec` call,
  one exited agent's name never appeared on the map despite every inspectable Pixi property —
  `.text`, `.visible`, `.renderable`, `.alpha`, `.destroyed`, parent — reporting correct,
  visible values). An isolated single-agent spawn+exit in its own tick rendered fine. Treated
  as a synthetic-load artifact (React batching many `setWorld` calls into one giant Pixi frame
  with a dozen simultaneous new `Text` rasterizations), not a real bug — real agents spawn one
  IPC event at a time. If a sprite's label ever goes missing in **real** use, this is the first
  thing to rule back in.
- **Pixi's canvas-drawn `fontFamily: "monospace"` text has no glyph for `⏸` (or presumably other
  emoji/symbol marks) — renders as a tofu box, invisible at a glance.** Confirmed live in
  `WorldMap.tsx`'s thought bubble. The DOM/HTML panels (`App.tsx`, `AgentFocus.tsx`) don't have
  this problem — the browser's own emoji font fallback covers `⏸ 💭 ✓ ✕ ◌`, so this is specific
  to Pixi `Text` objects on the canvas. Fix: plain ASCII text only inside the map.
- **A Pixi sprite label centered on its container (`x = -width/2`) can render partly or fully
  off the visible canvas** when the sprite sits near the left/right edge and the label is wide
  (a long agent name, or an untruncated thought bubble) — confirmed live, text simply vanished
  past x=0. Fix: `clampCenteredX()` in `WorldMap.tsx` clamps the label's local x so
  `container.x + x` and `container.x + x + width` both stay inside `[margin, W - margin]`.
- **claude-in-chrome was disconnected for most of this session, then reconnected mid-session
  (2026-09-05)** via `/mcp` — the earlier "not connected" state (and macOS `screencapture`
  lacking screen-recording permission) meant `npm run dev` + tsc + vitest was as far as
  automated verification went for the cwd-normalization fix (a non-UI change, so this didn't
  block it). Now connected: the next UI task (room-set/encounter polish) should actually be
  driven through Chrome rather than asking the user to eyeball it — check connection state
  first, since it can drop between sessions.
- **Background agents `git add` the whole tree.** Seen three times now (a scaffold-review fork,
  a verification subagent, then a `/code-review` fork) — despite explicit "don't stage"
  instructions. Not a commit. `git reset` (no `--hard`) unstages cleanly. Assume any subagent
  may stage; check `git status` after they run.
- **The composer's `cwd` field does zero normalization** — no `.trim()`, no `~` expansion.
  Confirmed twice live this session: a literal `~/Desktop/...` and a stray leading space (from
  copy-paste) each resolved to a nonexistent directory, and the failure surfaced as the SDK's
  generic `"Claude Code native binary ... exists but failed to launch ... doesn't match this
  system's libc"` message — which is actually just "the cwd doesn't exist," dressed up as a
  platform/libc problem. If that error ever shows up again, check the literal `cwd` string
  (including whitespace) before suspecting the binary. **Fixed 2026-09-05** —
  `normalizeCwd()` in `main/index.ts`.
- **Grep's default `"content"` output mode leaves `numFiles` at 0 even with real matches** —
  confirmed against a live SDK run (a query that found 6 real matches came back with
  `numFiles: 0, filenames: []`). Its match count instead lives in the top-level `numLines`
  field (lines of matching content returned). `numMatches` only appears in `"count"` mode.
  `summarizeToolOutput()` checks `numMatches` → `numLines` → `numFiles`, in that order.
- **Write's `type: "create"` output always ships an empty `structuredPatch`** (there's nothing
  to diff a new file against) — confirmed live: a real 2-line file creation came back
  `structuredPatch: []`, which would read as `"+0 / -0"` if checked first. Fix: check
  `type === "create"` before `structuredPatch`, and count the new file's own `content` lines.
- **Read's `FileReadOutput.numLines`/`totalLines` overcounts by one on a file with a trailing
  newline** (the normal shape of a real file) — confirmed live: a genuinely 3-line file
  (`"a\nb\nc\n"`) came back reporting `numLines: 4`, i.e. the exact same "naive
  `content.split("\n")` counts the empty string after the final `\n` as a line" bug fixed for
  Write's create case above, except baked into a field the SDK reports directly rather than
  something we compute. Fix: ignore `numLines`/`totalLines`, recompute from `file.content` with
  the same trailing-newline-safe counter used for Write.
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
- **Classes vs. subagent dispatch (found 2026-09-08, Slice 2a).** VISION makes "legible
  delegation … close to the whole point of this app" and describes classes handing work off to
  each other. But classes are enforced as a hard `tools` allow-list passed to `query()`, and
  **no class includes `Task`/`Agent`** — so as written, a Builder/Scout/Reviewer/Runner/Keeper
  physically cannot dispatch a subagent; only an unclassed agent can. Either the class
  allow-lists need `Task` added (probably Builder + Scout + Reviewer — the ones that would
  delegate), or VISION should say which classes may delegate. Needs a call before Slice 2b's
  tether is reachable in the real app.
