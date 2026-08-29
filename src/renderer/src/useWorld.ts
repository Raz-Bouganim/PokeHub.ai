/**
 * Subscribes to the main-process event feed and folds it through the SAME pure
 * reducer the tests use. The renderer holds no state the log can't rebuild — on
 * mount it replays the on-disk snapshot first, so a reload (dev HMR, crash)
 * does not lose the world or the `agent.spawned` metadata that already streamed
 * past.
 */

import { useEffect, useRef, useState } from "react";
import type { PokeHubEvent } from "../../core/events.ts";
import { reduce } from "../../core/reducer.ts";
import { initialWorld, type WorldState } from "../../core/world.ts";

export function useWorld(): { world: WorldState; log: PokeHubEvent[] } {
  const [world, setWorld] = useState<WorldState>(initialWorld);
  const [log, setLog] = useState<PokeHubEvent[]>([]);
  const worldRef = useRef(world);

  useEffect(() => {
    let ready = false;
    let buffer: PokeHubEvent[] = [];

    const feed = (event: PokeHubEvent) => {
      const next = reduce(worldRef.current, event);
      if (next === worldRef.current) return; // de-duped by the reducer
      worldRef.current = next;
      setWorld(next);
      setLog((prev) => [...prev, event].slice(-500));
    };

    // Subscribe first; hold live events until the snapshot is in.
    const unsub = window.pokehub.onAgentEvent((event) => {
      if (ready) feed(event);
      else buffer.push(event);
    });

    void window.pokehub.worldSnapshot().then((events) => {
      for (const event of events) feed(event);
      for (const event of buffer) feed(event);
      buffer = [];
      ready = true;
    });

    return unsub;
  }, []);

  return { world, log };
}
