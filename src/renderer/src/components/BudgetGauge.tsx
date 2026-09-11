import type { CSSProperties } from "react";
import { rateLimitBudget, type WindowBudget } from "../../../core/selectors.ts";
import { shortDuration } from "../../../core/text/duration.ts";
import type { WorldState } from "../../../core/world.ts";
import { cx } from "../cx.ts";
import { useNow } from "../hooks/use-now.ts";
import styles from "./BudgetGauge.module.css";

/** Tick interval. The label has minute resolution, so anything finer re-renders for nothing. */
const TICK_MS = 30_000;

interface BudgetGaugeProps {
  world: WorldState;
}

interface WindowRowProps {
  label: string;
  budget: WindowBudget | null;
}

function WindowRow({ label, budget }: WindowRowProps): JSX.Element | null {
  if (!budget) return null;
  const percentLeft = Math.round(budget.fractionLeft * 100);
  return (
    <div
      className={cx(styles.row, budget.isLow && styles.low)}
      style={{ "--fill": `${percentLeft}%` } as CSSProperties}
      title={`${percentLeft}% of the ${label} window left`}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.track}>
        <span className={styles.fill} />
      </span>
      <span className={styles.figure}>{percentLeft}%</span>
      <span className={styles.reset}>resets {shortDuration(budget.resetsInMs)}</span>
    </div>
  );
}

export function BudgetGauge({ world }: BudgetGaugeProps): JSX.Element | null {
  const budget = rateLimitBudget(world, useNow(TICK_MS));
  if (!budget) return null;

  return (
    <div className={cx("panel", styles.panel)}>
      <div className={styles.header}>
        <h2>Budget</h2>
        {budget.status !== "allowed" && (
          <span className={cx(styles.flag, budget.status === "rejected" && styles.rejected)}>
            {budget.status === "rejected" ? "rate limited" : "running low"}
          </span>
        )}
      </div>
      <WindowRow label="5h" budget={budget.fiveHour} />
      <WindowRow label="7d" budget={budget.sevenDay} />
    </div>
  );
}
