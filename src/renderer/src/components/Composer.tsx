/**
 * The docked composer bar (VISION decision #3): name / class / cwd / prompt, a
 * send button that spawns or resumes, and a "+ new" escape from follow-up mode.
 * Pure render of the `useComposer` view model.
 *
 * Not unit-tested — React render; verified live via the stub (PROGRESS.md).
 */

import type { Composer as ComposerModel } from "../hooks/use-composer.ts";
import styles from "./Composer.module.css";

interface ComposerProps {
  composer: ComposerModel;
  /** Show the "+ new" button (an agent is selected). */
  showNewButton: boolean;
}

export function Composer({ composer, showNewButton }: ComposerProps): JSX.Element {
  const c = composer;
  return (
    <>
      <div className={styles.bar}>
        <input
          value={c.name}
          onChange={(e) => c.setName(e.target.value)}
          placeholder="name"
          disabled={c.followMode}
        />
        <select
          value={c.agentClass}
          onChange={(e) => c.setAgentClass(e.target.value)}
          disabled={c.followMode}
        >
          {c.classes.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>
        <input
          value={c.cwd}
          onChange={(e) => c.setCwd(e.target.value)}
          placeholder="/absolute/repo/path"
          className={styles.cwdInput}
          disabled={c.followMode}
        />
        <textarea
          value={c.prompt}
          onChange={(e) => c.setPrompt(e.target.value)}
          placeholder={c.followMode ? `follow-up turn for ${c.targetName}…` : "task for the agent"}
        />
        <button onClick={() => void c.send()} disabled={c.busy}>
          {c.sendLabel}
        </button>
        {showNewButton && (
          <button onClick={c.clearSelection} title="compose a new agent">
            + new
          </button>
        )}
      </div>

      {c.notice && (
        <div className={styles.notice}>
          <span className={styles.noticeText}>{c.notice}</span>
        </div>
      )}
    </>
  );
}
