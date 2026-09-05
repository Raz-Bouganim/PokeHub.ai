/**
 * A small solid swatch of an agent's stable identity colour, shown next to its
 * name wherever the name appears (raw log, agent list, focus header). The
 * tinted name text alone is too faint to read against the dark UI.
 *
 * Not unit-tested — trivial render; the colour is `agentColor`, covered by
 * `core/text/__tests__/agent-color.test.ts`.
 */

import { type CSSProperties } from "react";
import { agentColor } from "../../../core/text/agent-color.ts";
import styles from "./AgentDot.module.css";

interface AgentDotProps {
  agentId: string;
}

export function AgentDot({ agentId }: AgentDotProps): JSX.Element {
  return (
    <span
      className={styles.dot}
      style={{ "--agent-color": agentColor(agentId) } as CSSProperties}
      aria-hidden
    />
  );
}
