/**
 * Subscribes to `canUseTool` asks from main and queues them, so a second
 * agent's encounter can't clobber the first one that is still on screen. The
 * encounter dialog renders `current`; answering it advances the queue.
 */

import { useEffect, useState } from "react";
import type { PermissionAskEnvelope } from "../../../shared/ipc.ts";
import type { PermissionDecision } from "../../../shared/permissions.ts";

export interface PermissionQueue {
  /** The ask to show now, if any. */
  current: PermissionAskEnvelope | undefined;
  /** How many more are waiting behind `current`. */
  waiting: number;
  /** Answer `current` and advance to the next. No-op when the queue is empty. */
  answer: (decision: PermissionDecision) => void;
}

/**
 * @returns the current ask, the backlog count, and an `answer` callback
 */
export function usePermissionQueue(): PermissionQueue {
  const [queue, setQueue] = useState<PermissionAskEnvelope[]>([]);

  useEffect(() => {
    if (!window.pokehub) return;
    return window.pokehub.onPermissionAsk((envelope) => {
      setQueue((q) => [...q, envelope]);
    });
  }, []);

  const current = queue[0];

  const answer = (decision: PermissionDecision): void => {
    if (!current) return;
    window.pokehub.answerPermission({ id: current.id, decision });
    setQueue((q) => q.slice(1));
  };

  return { current, waiting: Math.max(0, queue.length - 1), answer };
}
