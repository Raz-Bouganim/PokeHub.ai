import { ENV_PREFIX } from "./bash-guard.ts";
import type { AgentClassPolicy } from "./policy.ts";

/** The only class allowed to write history. Nothing lands without passing the
 *  one agent whose entire job is that gate. `Bash` is gated to git plus
 *  read-only inspection. */
export const keeper: AgentClassPolicy = {
  name: "Keeper",
  tools: ["Bash", "Read", "Grep", "Glob"],
  bash: {
    allow: [
      new RegExp(`${ENV_PREFIX}git(?:\\s|$)`),
      // Read-only inspection is fine alongside git.
      new RegExp(
        `${ENV_PREFIX}(?:cat|less|head|tail|grep|rg|ls|find|diff|wc|stat|pwd|echo|true)(?:\\s|$)`,
      ),
    ],
    // Keeper writes history — not config, not hooks, not `-c` overrides that
    // turn a pager or hook into a shell. Those are how "only git" becomes
    // "arbitrary code".
    deny: [
      /\bgit\s+config\b(?![^|;&]*--get\b)/,
      /\bgit\s+-c\s+\S*(?:pager|hooksPath|editor|sshCommand|askpass)/i,
      /\bgit\s+(?:filter-branch|filter-repo)\b/,
    ],
    reason: "Keeper may only run git (plus read-only inspection).",
  },
};
