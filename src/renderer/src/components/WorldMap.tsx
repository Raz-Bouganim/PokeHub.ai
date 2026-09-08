// The "building" zoom level: a PixiJS canvas drawing one project's agents in
// their rooms, a projection of `world` that never writes back. `focusedProject`
// filters to one `cwd` (null = whole world). Verified live via the stub.

import { useEffect, useRef, useState } from "react";
// Strict CSP (no `unsafe-eval`) — swap in Pixi's eval-free shader polyfills
// before `Application.init()`.
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics } from "pixi.js";
import type { WorldState } from "../../../core/world.ts";
import { W, H } from "./world-map/geometry.ts";
import { renderAgents } from "./world-map/render-agents.ts";
import { drawRooms } from "./world-map/rooms.ts";
import type { Sprite } from "./world-map/sprite.ts";
import styles from "./WorldMap.module.css";

interface WorldMapProps {
  world: WorldState;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  focusedProject?: string | null;
}

interface Scene {
  layer: Container;
  tethers: Graphics;
}

export function WorldMap({
  world,
  selectedId = null,
  onSelect,
  focusedProject = null,
}: WorldMapProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const spritesRef = useRef<Map<string, Sprite>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // The async init() draws whatever this holds when it resolves — events stream
  // in during init, so the mount-time props are already stale. Synced in an
  // effect (not the body) so `react-hooks/refs` stays happy and it flushes
  // before the redraw effect below.
  const propsRef = useRef({ world, selectedId, focusedProject, onSelect });
  useEffect(() => {
    propsRef.current = { world, selectedId, focusedProject, onSelect };
  });

  const draw = (): void => {
    const scene = sceneRef.current;
    if (!scene) return;
    const p = propsRef.current;
    renderAgents(p.world, {
      layer: scene.layer,
      tethers: scene.tethers,
      sprites: spritesRef.current,
      selectedId: p.selectedId,
      // A sprite's click handler is bound once and outlives this call, so read
      // the prop live rather than closing over the current one.
      onSelect: (id) => propsRef.current.onSelect?.(id),
      focusedProject: p.focusedProject,
    });
  };

  // Create the Pixi app once. init() is async; a fast unmount (StrictMode, HMR)
  // can fire cleanup first, and destroy() throws before init resolves — gate on
  // `initialised`.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initialised = false;
    const app = new Application();

    void app
      .init({
        width: W,
        height: H,
        background: 0x0f1020,
        antialias: true,
        preference: "webgl",
        resolution: 1,
        autoDensity: true,
      })
      .then(() => {
        initialised = true;
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        const canvas = app.canvas;
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        host.appendChild(canvas);

        drawRooms(app.stage);
        const layer = new Container();
        app.stage.addChild(layer);
        // Tethers first so they paint beneath every sprite.
        const tethers = new Graphics();
        layer.addChild(tethers);
        sceneRef.current = { layer, tethers };
        draw();
      })
      .catch((err: unknown) => {
        console.error("[WorldMap] Pixi init failed", err);
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      disposed = true;
      sceneRef.current = null;
      spritesRef.current = new Map();
      if (initialised) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    draw();
  }, [world, selectedId, focusedProject]);

  return (
    <div className={styles.host} ref={hostRef}>
      {error && <div className={styles.error}>map renderer failed: {error}</div>}
    </div>
  );
}
