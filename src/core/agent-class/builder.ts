import type { AgentClassPolicy } from "./policy.ts";

/** The workhorse, and the only class that ships code. If something changed, a
 *  Builder changed it. `Bash` is unrestricted for this class.
 *
 *  Builder is the only class that may dispatch a subagent (`Task`; on the wire
 *  the `tool_use` block is `name: "Agent"`, so both names are listed). It is
 *  already unrestricted, so a Builder-dispatched one-off cannot reach past what
 *  the Builder itself can do — whereas adding `Task` to a restricted class
 *  (Scout, Reviewer, Runner, Keeper) could launder a capability through an
 *  un-gated subagent and break that class's guarantee. Revisit the others once
 *  it is confirmed the SDK's `tools` cap propagates into a subagent. */
export const builder: AgentClassPolicy = {
  name: "Builder",
  tools: [
    "Read",
    "Grep",
    "Glob",
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookEdit",
    "Bash",
    "Task",
    "Agent",
  ],
};
