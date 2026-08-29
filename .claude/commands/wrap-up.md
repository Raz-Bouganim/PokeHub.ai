---
description: Capture and document the session before ending it
---

End-of-session wrap-up for PokeHub. Work from the session we just had — don't ask me
follow-up questions, and don't re-explore the codebase to reconstruct it.

1. Re-read `docs/PROGRESS.md`.

2. Update it:
   - **Done** — move anything finished this session here, newest first, dated, one sentence each.
   - **Next up** — rewrite it so the next session knows exactly where to start. Be specific
     enough that it could begin without reading anything else.
   - **Gotchas** — anything learned the hard way: a wrong turn, a library that misbehaved, a
     constraint discovered. One line each, naming what broke and what fixed it. This is the
     most valuable section in the file, so err toward recording too much here.
   - **Decisions** — anything decided this session, with the reasoning in half a sentence.

3. Only if a **rule, constraint, stack choice, or the current phase** actually changed, edit
   `CLAUDE.md` to match. That file is re-sent on every turn, so it must stay short: never
   append status, history or session notes to it. If nothing structural changed, leave it alone.

4. If something decided this session contradicts `VISION.md`, record it under
   "VISION.md needs updating" in PROGRESS.md rather than editing the spec yourself.

5. Show me a 3-line summary of what you changed, then stop.

Do not commit anything unless I ask.
