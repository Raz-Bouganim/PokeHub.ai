/**
 * The killer moment (VISION): a permission prompt shown as a wild-encounter
 * screen instead of grey text at the bottom of a scrollback, so a command
 * worth reading actually gets read. Mechanically this answers the SDK's
 * `canUseTool` via `usePermissionQueue`.
 *
 * Not unit-tested — React render; verified live via the stub (PROGRESS.md).
 */

import type { PermissionAskEnvelope } from "../../../shared/ipc.ts";
import type { PermissionDecision } from "../../../shared/permissions.ts";
import styles from "./EncounterDialog.module.css";

interface EncounterDialogProps {
  ask: PermissionAskEnvelope;
  /** How many more asks are queued behind this one. */
  waiting: number;
  onAnswer: (decision: PermissionDecision) => void;
}

export function EncounterDialog({ ask, waiting, onAnswer }: EncounterDialogProps): JSX.Element {
  const { tool, agentName, title, input, canRemember } = ask.ask;
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <h2>A wild {tool.toUpperCase()} appeared!</h2>
        <p>
          {agentName} — {title ?? `${tool} wants to run:`}
        </p>
        <pre>{JSON.stringify(input, null, 2)}</pre>
        <div className={styles.actions}>
          <button onClick={() => onAnswer("allow_once")}>Allow once</button>
          {canRemember && <button onClick={() => onAnswer("allow_always")}>Always</button>}
          <button onClick={() => onAnswer("refuse")}>Refuse</button>
        </div>
        {waiting > 0 && <p className={styles.moreWaiting}>{waiting} more waiting</p>}
      </div>
    </div>
  );
}
