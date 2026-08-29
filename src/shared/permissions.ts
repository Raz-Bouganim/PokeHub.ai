/**
 * The permission-encounter contract. Lives in `shared/` because both the agent
 * layer (which raises the ask) and the renderer (which answers it) depend on it,
 * and neither should have to import the other. SDK-free on purpose.
 */

export type PermissionDecision = "allow_once" | "allow_always" | "refuse";

export interface PermissionAsk {
  agentId: string;
  agentName: string;
  toolCallId: string;
  tool: string;
  input: Record<string, unknown>;
  /** Prompt sentence rendered by the SDK bridge, when present. */
  title?: string;
  /** True when the SDK offered rule suggestions, i.e. "Always" can actually
   *  persist this decision. When false the renderer should hide that option. */
  canRemember: boolean;
}
