import type { AgentClassPolicy } from "./policy.ts";

/** Finds problems and cannot quietly fix them, so review stays review instead
 *  of drifting into a rewrite. */
export const reviewer: AgentClassPolicy = {
  name: "Reviewer",
  tools: ["Read", "Grep", "Glob"],
};
