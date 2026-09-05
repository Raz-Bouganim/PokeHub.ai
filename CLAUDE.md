# PokeHub.ai

Desktop app that drives the user's own installed Claude Code and renders parallel agents
as a Pokemon-style map. Full spec: @VISION.md — read it before any design decision.
How we write the code in this repo: @docs/STANDARDS.md — follow it for any code change.

## The two rules
1. **Every game element encodes real state.** No decoration that could be mistaken for
   information. Reject any visual not backed by a real event or number.
2. **Don't invent storage for what Claude Code already stores.** Roster = `.claude/agents/*.md`.
   Projects = Claude Code's own history. Sessions = its session IDs. PokeHub is a lens, not a silo.

## Architecture (non-negotiable)
- `claude` child processes -> stream-json -> append-only event log (a FILE on disk, written by
  the agent side) -> **pure reducer** -> world state -> PixiJS renderer.
- The reducer is pure: no side effects, no `Date.now()`, no Pixi. Time-dependent logic lives in
  selectors and takes `now` as an argument. Breaking this breaks replay, undo and scrubbing.
- Every event carries a `source` field (`'agent' | 'repo' | 'system' | 'user'`) from day one.
- Room assignment is a lookup table, never a switch statement.
- Permissions flow through the Agent SDK's `canUseTool` callback.

## Stack
Electron + React + TypeScript + PixiJS + `@anthropic-ai/claude-agent-sdk`. Package manager: npm.
Shell is Electron (the Agent SDK and `canUseTool` are Node-only); a Tauri port stays possible
because no business logic imports Electron. Event log is NDJSON on disk; SQLite deferred until
after the spike.

## Hard constraints
- Never handle Claude subscription credentials. The app drives the user's already-logged-in
  `claude`; it never sees, stores or proxies a token. No hosted version, no "log in with Claude".
- Never call it "Claude Code" or mimic Claude Code's visuals. "Powered by Claude" is the framing.
- All art original or CC0. No Nintendo assets, names or fonts.

## Current phase
**Phase 1.5 — Coding standards + refactor.** In progress: `docs/STANDARDS.md` is landed;
the codebase is being brought to it one reviewable slice at a time (see `docs/PROGRESS.md`).
Phase 2 work is paused until this closes.

**Phase 2 — Parallel** (next). Phase 1 (Legibility) is done and verified. Then: N concurrent
agents, subagent tethering (nesting made visible), town overview (the "am I done?" zoom), and a
visible rate-limit budget. This is the core bet — parallel state at a glance beats N
scrollbacks. Real art / UI polish is still Phase 3, not now.

## Session hygiene
- `/kickoff` at the start of a session, `/wrap-up` at the end.
- `docs/PROGRESS.md` is the running record and it grows. **This file does not.**
  CLAUDE.md is re-sent on every single turn, so only edit it when a RULE, CONSTRAINT, STACK
  CHOICE or the CURRENT PHASE actually changes. Never append status, history or notes here.
- One session per task. `/clear` between unrelated tasks; `/compact` only mid-task.

## Working agreements
- Don't start implementing until explicitly told to begin. A future-tense plan ("then we'll
  build X") is a roadmap, not a green light. When in doubt, ask.
- Don't commit unless asked.
