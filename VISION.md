# PokeHub.ai — Vision & Architecture (v1.1, Aug 2026 — all decided)

> **Thesis:** A map is a better dashboard than a scrollback.

**For:** Claude Code power users (first) · **Shape:** local desktop app · **Cost to user:** $0

---

## What this actually is

> **PokeHub is a desktop app that drives the Claude Code you already have — the way a git app
> like Fork or GitHub Desktop drives the git you already have.**

That comparison answers most questions at once. Fork doesn't reimplement git. It doesn't ask for
your password. It doesn't run in the cloud. It finds the `git` already on your machine, runs the
same commands you'd have typed, and shows the result in a form that's easier to read than
`git log --graph`. PokeHub does exactly that for `claude`.

| The question | The answer |
|---|---|
| Is it an app or a program? | A desktop app. Own window, own dock icon — like VS Code or Docker Desktop. |
| Is it an IDE extension? | No. It sits *beside* your editor, not inside it. The map wants a whole window, and this isn't about editing code — it's about watching and steering agents. |
| Is it a website? | No. Nothing at pokehub.ai would ever run your agents; that domain is only a download page. |
| Where does it run? | Entirely on your machine. There is no PokeHub server anywhere. No code, prompts or file contents leave your computer. |
| How does it talk to Claude Code? | It launches `claude` as a background process — the same program you run in your terminal — and reads its structured output stream. |
| Do I need an API key or token? | **No.** Claude Code is already signed into your account on your machine; PokeHub inherits that. It never sees, stores, or asks for a credential. |
| What do I need first? | Claude Code installed and logged in. That's the entire prerequisite list. |
| What does it cost? | Nothing. Agents run on the Claude subscription you already pay for. |

### Installing it
1. Download PokeHub — a `.dmg` on Mac, eventually a one-line Homebrew install.
2. Drag it to Applications and open it.
3. First launch reads Claude Code's own project history and builds your town from it.
4. That's it. No account to create, no key to paste, no config file to edit.

### Why it has to work this way
The local-app shape isn't only simplest — it's the only permitted one. Anthropic's rules forbid
third-party products from handling subscription credentials on a user's behalf. Because PokeHub
never touches a credential and only drives a program you already own and are signed into, it sits
on the allowed side of that line. That single constraint is what keeps it free, and it's why a
hosted version can't exist.

### What it is not
- **Not a replacement for Claude Code.** It's a face for it. The terminal keeps working, and the
  raw text stream is always one keypress away.
- **Not a different agent or model.** Same Claude Code, same account, same behavior, shown differently.
- **Not a code editor.** Your editor stays open next to it.
- **Not a hosted service.** Nothing to sign up for, keep running, or pay for.

---

## The bet

Running one agent in a terminal is fine. Running four is a mess — four scrollbacks, no
shared clock, no way to answer "what is everything doing right now?" without reading.
Text is a *serial* medium representing *parallel* work.

A map fixes it by making **position mean something**. If a sprite in the Gym always means
"running your test suite," six agents on one screen is a glance, not a read.

### The one rule

> **Every game element encodes real state. Nothing decorative that could be mistaken for information.**

If a sprite moves, something happened. If a bar drops, a real budget shrank. The moment we
add a windmill because windmills look nice, the map stops being trustworthy.

### Failure mode we're designing against

A beautiful thing demoed three times and never opened again, because watching a sprite walk
is slower than reading `Read(auth.ts)`. The game layer must carry density text *can't* —
parallel state, ambient status, spatial recall — and get out of the way everywhere else.
**Raw text stays one keypress away, always.**

---

## The killer moment: permission prompts as encounters

Today an approval prompt is grey text at the bottom of a scrollback, arriving while you're
reading something else. People learn to hit *yes*. That's the most dangerous habit in this
category of tool, and it's a **presentation** problem.

    ┌──────────────────────────────────────────┐
    │ A wild COMMAND appeared!                 │
    │ > rm -rf ./dist && yarn build --force    │
    │ It wants to DELETE 214 files.          ▼ │
    │ [ALLOW ONCE] [ALWAYS] [REFUSE] [INSPECT] │
    └──────────────────────────────────────────┘

Mechanically this is the Agent SDK's `canUseTool` callback. Everything else is presentation.
**Build this first** — it's the one thing PokeHub does *better* than the terminal, not just
prettier.

---

## The world

### Zoom levels
- **Town** — every project is a building; all agents everywhere as dots. The "am I done?" view.
- **Building** — one repo. Rooms are domains of work. The primary screen.
- **Room / agent focus** — one agent, full detail: the diff, the test output.
- **Raw stream** — unvarnished log, one keypress. Never trap the power user in the metaphor.

### Rooms

| Room | Triggered by | What you see |
|---|---|---|
| The Library | Read, Grep, Glob | Scans shelves; the searched directory's shelf lights up |
| The Forge | Write, Edit | Anvil sparks; `+42 / -7` floats up like damage numbers |
| The Gym | Bash: test, build, lint | A battle vs the suite. Failing test = a hit taken |
| The Center | git status/diff/commit | Heal & save. Staged files on the counter; commit = save file |
| The Mart | MCP servers | One shopkeeper per server; their tools are the stock |
| The Gate | WebSearch, WebFetch | Leaves town, returns carrying what it found |
| The Council | Plan mode, Task dispatch | Parent briefs subagents at a table before they scatter |
| The Route | thinking, idle | Walking with a thought bubble; long think = sits down |

Library / Forge / Gym / Center carry ~90% of real tool traffic. Eight rooms is probably two
too many for v1.

### Agents and parties

Each agent = a sprite with a name, a class from its role, and a one-line thought bubble.
Subagents appear **tethered** to their parent and follow it. Subagent hierarchy is the thing
terminals represent worst and a map represents best: nesting becomes *visible* instead of
inferred from indentation.

### The roster, and where it lives

Two kinds of agent, and the split falls out of how work actually happens. **Roster agents** are
named characters you keep, dispatch and reuse. **One-offs** are the subagents a roster agent
summons mid-task — anonymous by nature, gone when done. You never name a subagent.

The roster is **layered by scope**, matching Claude Code's own layering so PokeHub sits on top
of it rather than beside it:

| Scope | Lives in | In the world |
|---|---|---|
| Your party | `~/.claude/agents/` | Travels with you between towns. General-purpose: reviewer, debugger, doc writer. Yours alone. |
| Local hires | `<repo>/.claude/agents/` | Live in one building. They know *this* codebase. Committed to the repo, so teammates inherit them. |
| Compound staff | `<parent>/.claude/agents/` | Live in the courtyard, available to every building in the fence. Natural home for cross-repo work. |

Because agent discovery is cwd-based, an agent whose `cwd` is the compound's parent folder picks
up the courtyard roster automatically — the game's spatial rule and Claude Code's resolution rule
turn out to be the same rule. Stats (tasks completed, avg context burn, revert rate) are
PokeHub's own but *derived from the event log*, so they never become a second source of truth.

### Classes are permissions, not costumes

An agent definition can declare which tools it may use. So a class is not a description of what
an agent tends to do — it's a hard limit on what it *can* do, enforced before the model sees the
option. Same move as the encounter screen: a real safety feature almost nobody configures, made
visible at a glance.

| Class | Can use | What that buys you |
|---|---|---|
| Scout | Read, Grep, Glob, WebSearch | Physically cannot modify anything. Send it into an unfamiliar repo and stop thinking about it. |
| Builder | Read, Write, Edit, Bash | The workhorse, and the only class that ships code. If something changed, a Builder changed it. |
| Reviewer | Read, Grep, Glob | Finds problems and cannot quietly fix them, so review stays review instead of drifting into a rewrite. |
| Runner | Bash, Read | Runs tests and builds but cannot touch source — so it **cannot make a red suite green by weakening the test.** Worth the whole mechanic on its own. |
| Keeper | git via Bash, Read | The only class allowed to write history. Nothing lands without passing the one agent whose entire job is that gate. |

**The consequence: hand-offs become visible.** A Reviewer that spots a typo *can't* fix it. That
sounds like friction and is actually the best part: the Reviewer files it, a Builder picks it up,
and in the world that's one character walking to the courtyard and handing another a note.
Delegation stops being an invisible nesting level in a transcript and becomes the thing you're
watching. Legible delegation is close to the whole point of this app.

---

## Projects are compounds, not buildings

Cal is three repos. Unicargo is two. A map that can't say "these belong together" is
missing the most useful fact on the screen.

One building per repo was the wrong primitive. The right one is a **fenced compound with a
gate**: the fence is the project, the buildings inside are its repos, the courtyard between
them is where cross-repo work happens.

    ┌ ── PROJECT · CAL ─────────────────────┐        ┌ ── UNICARGO ───────────┐
    │  [yatzil-front]══[yatzil-back]══[cal- │        │  [unicargo-api]══[web] │
    │                                connect]│  ┌───┐ │                        │
    │   courtyard — cross-repo agents here  │──┤lib├──│   courtyard            │
    └──────────────[GATE]───────────────────┘  └───┘ └──────────[GATE]────────┘
       ══ = declared contract (pulses on change)   ── = cross-project dependency

### Why a fence beats floors
Floors *hide*. You see one at a time, and the entire premise of this app is parallel state at
a glance — an elevator is the same problem as a tab. Floors also imply a hierarchy that doesn't
exist: `yatzil-front` isn't above or below `yatzil-back`. A fence groups without hiding and
without ranking.

### What the compound encodes
- **The courtyard** — where an agent whose task spans repos actually stands, `cwd` set to the
  parent folder. Watching it walk out of the backend and into the frontend is precisely the
  fact you want: *it finished the route, now it's updating the client.*
- **Pipes between buildings** — declared contracts: a shared types package, an OpenAPI schema,
  a workspace dependency in `package.json`. When an agent changes one end, the pipe pulses and
  the other building gets a *stale* marker. Highest-value thing the compound can tell you, and
  it's not a metaphor — it's a dependency edge you can compute.
- **The gatehouse** — compound-level status. "2 of 3 repos have uncommitted changes."
  "These two ship together." The coordinated-PR problem, made visible.
- **Shared MCP servers and env** — live in the courtyard, not inside any one building, because
  that's where they actually apply.

### How PokeHub knows which repos belong together
Three cheap heuristics, in confidence order: cross-references in `package.json` /
`docker-compose.yml` / `.env`; sibling directories under a common parent; shared git remote org.
PokeHub *suggests* a fence; you confirm by dragging it closed — a game gesture that writes a
real `pokehub.workspace.json`. Never auto-group silently: a wrong fence is worse than no fence.

### Edge case: a library shared by two projects
A building inside two fences at once breaks the spatial model, and the spatial model is the one
thing we can't afford to break. So **it stands outside both, with roads to each.** Less tidy,
honest about what it is, and it makes "this change touches two projects" impossible to miss.

---

## Reading state at a glance

| Game element | Real state | Why it matters |
|---|---|---|
| HP bar | Context window remaining | Red under 15% = about to compact and get dumber. Today you find out by surprise. |
| PP / Money | Rate-limit budget left in window | Six agents cost 6x. Make the budget visible *before* you spend it. |
| Status effect | Agent is blocked | Awaiting approval, retry loop, or erroring. Most valuable glance-level fact. |
| Level / badges | Sessions & tasks in this repo | Flavor — but honest flavor, it's a real count. |
| Day / night | Wall-clock session length | Ambient "you've been at this 3 hours" without a nag. |
| Building state | Repo health | Lights on = active. Smoke = long process. Cracked roof = dirty tree / red CI. Boarded = untouched 30d. |

### Legibility features
- **The Journal** — every file touched and command run, with diffs. Files *read* vs *modified*
  are visually distinct — it's the question you ask most after the fact.
- **Replay scrub** — the session is a durable event log, so you get a draggable timeline.
- **Undo points** — the Center's save files map to real git state.

---

## Architecture

    claude x N  ──stream──>  Event log  ──replay──>  Reducer  ──>  World state  ──>  Renderer
    (child procs)            (NDJSON ->             (pure fn)      (agents,          (PixiJS
     Agent SDK, TS)           SQLite,                              rooms, stats)      + React)
                              append-only)
         ^                                                                              |
         └────────── canUseTool() — approval resolves the agent's paused promise ────────┘

    Everything above runs on the user's machine. No server, no account, no network hop.

### Stack
- **Shell: Tauri v2** — ~10MB binary vs Electron ~150MB, and a Rust supervisor is the right
  tool for babysitting N child processes. Electron is the lower-friction day-one choice and
  the app code barely changes — this is reversible.
- **UI: React + TypeScript** — the non-map chrome (journal, composer, diffs) is ordinary UI work.
- **Map: PixiJS** — WebGL 2D built for tilemaps/sprites; unlike Phaser it's happy being a
  component inside a React app rather than owning the page.
- **Agent runtime: `@anthropic-ai/claude-agent-sdk`** — event stream, hooks, session resume,
  and the `canUseTool` permission callback. Shells out to the user's own installed `claude`.
- **Store: SQLite** — event log, session index, journal. Local file.

### Architectural rule one: the reducer stays pure

The reducer is a **pure function** from event to world-state delta — no side effects, no
knowledge of Pixi. Test it with recorded event fixtures. If world state is ever mutated from
the renderer, replay breaks and you'll spend a month finding out why. Keep the log as the only
source of truth and the map becomes a projection you can rebuild at any time — which makes
scrubbing, undo, and crash recovery nearly free.

### Architectural rule two: don't invent storage for what Claude Code already stores

The roster is not a PokeHub database — it's `.claude/agents/*.md`, the same files the CLI reads.
Editing an agent in the game writes markdown that still works in a terminal. Projects come from
Claude Code's own history; sessions use its session IDs.

Costs a little convenience, buys three things: an agent you tune in PokeHub works for a teammate
who's never heard of PokeHub, your roster is versioned in git like the rest of the repo, and
uninstalling takes nothing with it. PokeHub is a **lens, not a silo**. Anything it stores of its
own — stats, map layout, fences — must be re-derivable or throwaway.

---

## Constraints and cost

### Hard constraint — Anthropic policy

Since Feb 2026, third-party products may **not** offer "log in with Claude" or route requests
through Free/Pro/Max subscription credentials on behalf of users. Anthropic separately
clarified that *users running a local tool with their own credentials* is unaffected.

**Therefore:** PokeHub must be a local app driving the user's own already-logged-in Claude Code.
It never sees a token, never proxies a request, never offers a login. A hosted pokehub.ai with
Claude sign-in is off the table; hosting would require user-supplied API keys and usage billing,
breaking the $0 promise.

### Two more real limits
- **Branding:** can't call it "Claude Code" or mimic Claude Code's visual identity.
  "Powered by Claude" is the permitted framing.
- **IP:** the Pokemon aesthetic must be an homage built from **original art**. No Nintendo
  sprites, tilesets, fonts, or names. Real cost line, not a footnote.

### Honest caveat
The UI cannot make the model faster. Speed claims must be earned by orchestration and
parallelism. "Makes agent work legible and parallel work manageable" is defensible;
"makes Claude faster" isn't.

### Nothing here is a per-user cost

Blunt version, because the first draft read like a bill: **building PokeHub costs $0 and
shipping it costs $0.** No server, no inference bill, no per-seat anything — and critically,
*no line below grows when a thousand people install it.* Every item is optional polish and
every item has a free path.

Realistic summary: **$0 to build and open-source it today. ~$180/yr if and when you want it to
feel like a finished product** — own domain, and a Mac app that opens without a security warning.

| Line item | If you pay | The $0 path |
|---|---|---|
| Model inference | **never** | Runs on the user's own Claude Code under their own subscription. Nothing bills to you, ever. |
| Hosting / backend | **never** | Nothing leaves the machine. There is nothing to host. |
| Distribution | **never** | GitHub Releases. Users download a build or clone and run it. |
| Domain pokehub.ai | ~$80/yr | A free `github.io` page. Buy the domain when the brand starts to matter. |
| Apple notarization | $99/yr | Ship unsigned; Mac users right-click → Open once. Normal for open-source dev tools — just an ugly first-run dialog. |
| Windows signing | $200-400/yr | Ship unsigned; SmartScreen warns once. Skip until Windows users exist. |
| Pixel art | $300-800 | CC0 top-down tilesets (Kenney and similar) or your own hand. Original or CC0 either way — never Nintendo rips. |
| Your dev cost | **$0** | The subscription you already pay for. The only budget you'll feel is your own rate limit. |

---

## Build order

Each phase must be independently worth using, or it won't survive contact with your schedule.

**0 — The spike** *(two weekends, honestly)*
**Two** agents, four rooms, the encounter screen, real events driving real sprites. Ugly
placeholder art throughout. It grew from one weekend to two the moment we decided to judge it on
both tests — and that's the right trade, since a spike that only proves the map leaves the killer
feature unvalidated.

*It passes if both are true:* you can answer "what are they both doing" faster than with two
terminals, **and** the encounter makes you actually read a command you'd normally wave through.
Fail the first and the map is decoration — redesign rather than push on. Fail the second and the
framing isn't earning its keep.

**1 — Legibility** *(first genuinely useful build)*
Full room set for one project, encounter-style permission dialog, journal with diffs,
raw-stream toggle. Beats a terminal for a single agent; you'd use it daily.

**2 — Parallel** *(the actual thesis)*
N concurrent agents, subagent tethering, town overview, visible rate-limit budget.
Proves or kills the core bet.

**3 — World** *(once utility is real)*
Character creation, real art, progression, building states, replay scrub. Deliberately last,
so charm never papers over a weak core.

**4 — Ship**
Packaging, signing, landing page, open-sourcing — also the cleanest answer to the policy
constraint, since users install and authenticate entirely on their own.

### Explicitly deferred — and what v1 must do to keep them cheap

Committed intentions, not someday-features. Each is out of v1 for a reason, and each imposes
exactly one constraint on v1 that stops it becoming a rewrite later.

| Deferred | Why not v1 | What v1 must do anyway |
|---|---|---|
| Attach mode | Detached process supervision is real daemon work; would sink the spike. | Event log is a **file on disk written by the agent side**, never state in app memory. Use Claude Code's session IDs. Then attaching is just tailing a file you didn't write. |
| Repo & team events | Teammates' commits and CI are more moving parts, more ways to be wrong, before the core is proven. | Every event carries a **`source` field** from day one, and the reducer accepts events that didn't come from an agent stream. One field now vs a new pipeline later. |
| Local system state | Dev servers, Docker, ports — nice ambience, zero value until the map is trusted. | Same `source` field. Building state must be **derived** from events, not set directly by agent activity. |
| Mart / Gate / Council / Route | Four more rooms = four more sets of art and transitions for ~10% of tool traffic. | Room assignment is a **lookup table**, not a switch. Adding a room = data change + tileset, never a refactor. |

---

## Decided (v1.0) — all fifteen

These are now assumptions, not options.

1. **Control** — you have a sprite, but every destination is one click of fast travel. Walking
   is optional flavor, never the interaction cost.
2. **Speed mismatch** — position always snaps to truth; animation is best-effort interpolation,
   skipped when the queue backs up. Speed slider exists, because during replay you *do* want to
   watch it walk.
3. **Prompt input** — docked composer with full history, file mentions and slash commands,
   styled like a dialogue box. No affordance sacrificed for the bit.
4. **Rooms in v1** — Library, Forge, Gym, Center. Mart / Gate / Council / Route when traffic
   justifies the art.
5. **Your character** — mechanical, not cosmetic. Your stated role becomes the default system
   prompt every agent you spawn inherits.
6. **Multi-repo projects** — fenced compounds with a shared courtyard, not floors. Shared
   libraries stand outside the fences with roads to each.
7. **Agents** — a named roster you keep and reuse, plus anonymous one-offs (which are the
   subagents roster members summon mid-task). Roster layered by scope (yours / per-repo /
   per-compound), stored as `.claude/agents` files, not in a PokeHub database.
8. **Session model** — PokeHub owns the agent processes in v1. Attach-mode is a committed goal,
   not a maybe; the event log schema must be built for it from day one.
9. **Onboarding** — auto-populate the town from Claude Code's own project history on first
   launch. Manual add and remove always available, not a fallback.
10. **World scope in v1** — the map shows your agents and nothing else. Repo events, CI and
    local system state are planned and deferred on purpose.
11. **Classes** — hard tool restrictions, not descriptions. A Reviewer cannot write; a Runner
    cannot edit source. Hand-offs between classes are a visible in-world action.
12. **Dispatch** — composer first, roster second. Type the task, then choose who does it.
13. **Phase 0 pass bar** — two tests, both must pass. See below.
14. **Stuck agents** — mirror Claude Code rather than invent detection. See below.
15. **Art direction & naming** — deliberately deferred (Phase 3 / from use).

---

## Stuck agents, solved by copying

The worry was that "stuck" needs a heuristic, and heuristics that are wrong about agents are
worse than nothing. Three of the four states fall straight out of the event stream with no
inference; the fourth has a rule we copy rather than invent.

| Status | How we know | Guessing involved |
|---|---|---|
| Blocked | A `canUseTool` request is pending — the agent is literally paused waiting on you. | None. We're the ones holding it. |
| Erroring | A tool result came back as an error, or the API is in retry/backoff. | None. It's in the event. |
| Stalled | No streaming progress event inside the stall window. Claude Code's own background-agent stall timer works exactly this way: **`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`, 10 min default, and the timer resets on every streaming progress event.** | None — and this is the good part. *Progress events, not wall clock,* is precisely how you separate a long think from a hang. A deep think still emits progress; a hang doesn't. |
| Looping | Repeated identical tool calls in the log. Claude Code doesn't hand us this one. | Ours to define — but with an append-only log it's a few lines in the reducer, not a research project. |

Two more inherited for free:
- **Bash timeouts** — `BASH_DEFAULT_TIMEOUT_MS` 120000 (2 min), `BASH_MAX_TIMEOUT_MS` 600000
  (10 min). A hung command terminates itself; we render the countdown as a visible timer in the
  Gym, which is more than the terminal shows.
- **Context exhaustion** — already handled by auto-compaction, so the HP bar going red maps to a
  real automatic event rather than something we made up.

"Return to the Center" stays a real move (interrupt, compact, resume clean) but it's a
*convenience*, not the safety net — the safety nets already exist and we're making them visible.
Which is, once again, the entire thesis.

---

## Deferred on purpose (not open)

- **Art direction** — tile size, perspective, palette. Waits for Phase 3; Phase 0 runs on
  placeholder blocks, and choosing a visual language before the mechanics are proven means
  redrawing it.
- **Naming** — "agents" is accurate and a little flat for a world with a Gym and a Keeper. You'll
  know the right word for a Scout's report the second time you wish you had one.

---

*Working document, v0.1. Not affiliated with or endorsed by Nintendo, Game Freak, or
The Pokemon Company. Built on the Claude Agent SDK; powered by Claude.*
