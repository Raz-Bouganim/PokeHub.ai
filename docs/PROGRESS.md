# PokeHub — progress

Running record between sessions. `/kickoff` reads this, `/wrap-up` updates it.
The spec is `VISION.md`. The always-on rules are `CLAUDE.md`.

## Next up

Phase 0 spike, not yet started. First task: scaffold the app shell and get **one** real
`claude` session's event stream driving **one** sprite between two rooms. Everything else in
Phase 0 builds on that loop working, so prove it before adding anything.

## Done

- **2026-08-29** — Vision and architecture fully specified across four rounds of design.
  Fifteen decisions settled; see "Decided" in VISION.md. No code written yet, deliberately.

## Decisions

- **2026-08-29** — Build Phase 0 in Claude Code in the terminal, one session per task, rather
  than one long session. Session length is the dominant token cost.
- **2026-08-29** — Handoff lives in the repo, not in a chat session: CLAUDE.md for always-on
  rules, VISION.md for the spec, this file for state.

## Gotchas

_Things learned the hard way. One line each — what broke, and what fixed it._

- (none yet)

## VISION.md needs updating

_Decisions made in a session that contradict the spec. Recorded here, not edited into the spec._

- (nothing yet)
