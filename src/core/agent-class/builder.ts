import type { AgentClassPolicy } from "./policy.ts";

/** The workhorse, and the only class that ships code. If something changed, a
 *  Builder changed it. `Bash` is unrestricted for this class. */
export const builder: AgentClassPolicy = {
  name: "Builder",
  tools: ["Read", "Grep", "Glob", "Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"],
};
