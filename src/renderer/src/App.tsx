// The app shell: owns the selected-agent id and lays out the four regions —
// composer, map + agent list, focus + raw log, and the encounter modal. Every
// panel is its own component; composer/permission/zoom logic lives in hooks.
// Not unit-tested — verified live via the stub (PROGRESS.md).

import { useState } from "react";
import { agentList } from "../../core/selectors.ts";
import styles from "./App.module.css";
import { AgentFocus } from "./components/AgentFocus.tsx";
import { AgentList } from "./components/AgentList.tsx";
import { BudgetGauge } from "./components/BudgetGauge.tsx";
import { Composer } from "./components/Composer.tsx";
import { EncounterDialog } from "./components/EncounterDialog.tsx";
import { MapPanel } from "./components/MapPanel.tsx";
import { RawLog } from "./components/RawLog.tsx";
import { useComposer } from "./hooks/use-composer.ts";
import { usePermissionQueue } from "./hooks/use-permission-queue.ts";
import { useWorld } from "./hooks/use-world.ts";

export function App(): JSX.Element {
  const { world, log } = useWorld();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const composer = useComposer(world, selectedId, setSelectedId);
  const permissions = usePermissionQueue();

  const selected = selectedId ? world.agents[selectedId] : undefined;

  return (
    <div className={styles.app}>
      <Composer composer={composer} showNewButton={selectedId !== null} />

      <div className={styles.left}>
        <BudgetGauge world={world} />
        <MapPanel world={world} selectedId={selectedId} onSelect={setSelectedId} />
        <AgentList
          agents={agentList(world)}
          maxSeqSeen={world.maxSeqSeen}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <div className={styles.right}>
        {selected && <AgentFocus agent={selected} onClose={() => setSelectedId(null)} />}
        <RawLog
          log={log}
          agents={world.agents}
          selectedId={selectedId}
          selectedName={selected?.name}
        />
      </div>

      {permissions.current && (
        <EncounterDialog
          ask={permissions.current}
          waiting={permissions.waiting}
          onAnswer={permissions.answer}
        />
      )}
    </div>
  );
}
