/**
 * Classes are permissions, not costumes (VISION / decided item #11). A class is
 * a hard allow-list of tools, enforced before the model sees the option.
 *
 * A lookup table, like room assignment — adding a class is a data change.
 * `toolsForClass` returns `undefined` for an unknown class, meaning "no
 * restriction" (inherit the default tool set); callers decide if that is safe.
 */

/** The built-in tool names each class may use. Mirrors VISION's table. */
const CLASS_TOOLS: Readonly<Record<string, readonly string[]>> = {
  // Physically cannot modify anything.
  Scout: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"],
  // The only class that ships code.
  Builder: ["Read", "Grep", "Glob", "Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"],
  // Finds problems, cannot quietly fix them.
  Reviewer: ["Read", "Grep", "Glob"],
  // Runs tests/builds, cannot touch source — cannot make a red suite green by
  // weakening the test.
  Runner: ["Bash", "Read", "Grep", "Glob"],
  // The only class allowed to write history.
  Keeper: ["Bash", "Read", "Grep", "Glob"],
};

export function toolsForClass(agentClass: string): string[] | undefined {
  const tools = CLASS_TOOLS[agentClass];
  return tools ? [...tools] : undefined;
}

export function knownClasses(): string[] {
  return Object.keys(CLASS_TOOLS);
}
