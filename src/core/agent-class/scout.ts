import type { AgentClassPolicy } from "./policy.ts";

/** Physically cannot modify anything. Send it into an unfamiliar repo and stop
 *  thinking about it. */
export const scout: AgentClassPolicy = {
  name: "Scout",
  tools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"],
};
