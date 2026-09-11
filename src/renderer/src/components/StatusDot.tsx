// A small round dot in an agent's status colour. Colour comes from the shared
// global `.status-<status>` utility, so it matches the map and the agent list.

import type { MouseEvent } from "react";
import type { AgentStatus } from "../../../core/world.ts";
import { cx } from "../cx.ts";
import styles from "./StatusDot.module.css";

interface StatusDotProps {
  status: AgentStatus;
  title?: string;
  selected?: boolean;
  onSelect?: () => void;
}

export function StatusDot({ status, title, selected, onSelect }: StatusDotProps): JSX.Element {
  return (
    <span
      className={cx(
        styles.dot,
        `status-${status}`,
        selected && styles.selected,
        onSelect && styles.clickable,
      )}
      title={title}
      onClick={
        onSelect
          ? (e: MouseEvent) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
    />
  );
}
