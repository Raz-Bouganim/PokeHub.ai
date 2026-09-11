// The only clock read in the renderer.

import { useEffect, useState } from "react";

/**
 * The current time, re-read on an interval so a countdown keeps moving while the
 * world is idle.
 *
 * @returns epoch ms
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
