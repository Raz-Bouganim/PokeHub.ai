/**
 * The map. A PixiJS canvas that owns its own <canvas> (not the page) and draws
 * the Phase 0 world: four rooms + the Route as coloured blocks, one sprite per
 * agent snapped to the room `world` places it in.
 *
 * This is a *projection* — it reads `world` (built by the pure reducer from the
 * event log) and never writes back. Position snaps to `world` on every render
 * (decided item #2); smooth walking is best-effort polish, deferred.
 */

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import type { Location } from "../../core/events.ts";
import type { AgentStatus, WorldState } from "../../core/world.ts";
import { agentList } from "../../core/selectors.ts";

const W = 600;
const H = 440;

interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: number;
}

/** Layout is data, mirroring the rooms lookup table — adding a room is a row. */
const ROOMS: Record<Location, RoomRect> = {
  library: { x: 16, y: 16, w: 280, h: 168, label: "LIBRARY", color: 0x2b3a67 },
  forge: { x: 304, y: 16, w: 280, h: 168, label: "FORGE", color: 0x6b3a1e },
  gym: { x: 16, y: 192, w: 280, h: 168, label: "GYM", color: 0x27492f },
  center: { x: 304, y: 192, w: 280, h: 168, label: "CENTER", color: 0x5c2a44 },
  route: { x: 16, y: 368, w: 568, h: 56, label: "ROUTE", color: 0x33354a },
};

/** Sprite fill by glance-level status (VISION "Reading state at a glance"). */
const STATUS_TINT: Record<AgentStatus, number> = {
  spawning: 0x8a8db5,
  thinking: 0x9aa0d8,
  working: 0x7fd7a5,
  blocked: 0xffcf5c,
  erroring: 0xff7a7a,
  exited: 0x55566f,
};

interface Sprite {
  container: Container;
  body: Graphics;
  name: Text;
  thought: Text;
}

function makeSprite(): Sprite {
  const container = new Container();
  const body = new Graphics();
  const name = new Text({
    text: "",
    style: { fill: 0xd7d9e8, fontSize: 10, fontFamily: "monospace" },
  });
  name.y = 12;
  const thought = new Text({
    text: "",
    style: { fill: 0xbfc2e8, fontSize: 9, fontFamily: "monospace" },
  });
  thought.y = -26;
  container.addChild(body, name, thought);
  return { container, body, name, thought };
}

/** One line of ambient status when there is no explicit thought. */
function bubbleText(a: ReturnType<typeof agentList>[number]): string {
  if (a.thought) return a.thought;
  if (a.pendingPermissions[0]) return `⏸ ${a.pendingPermissions[0].tool}`;
  if (a.activeTools[0]) return a.activeTools[0].tool;
  if (a.exitReason) return a.exitReason;
  return "";
}

function renderAgents(
  layer: Container,
  sprites: Map<string, Sprite>,
  world: WorldState,
): void {
  const byLoc = new Map<Location, ReturnType<typeof agentList>>();
  for (const a of agentList(world)) {
    const arr = byLoc.get(a.location) ?? [];
    arr.push(a);
    byLoc.set(a.location, arr);
  }

  const seen = new Set<string>();
  for (const [loc, arr] of byLoc) {
    const room = ROOMS[loc] ?? ROOMS.route;
    const perRow = Math.max(1, Math.floor((room.w - 30) / 74));
    arr.forEach((a, i) => {
      seen.add(a.id);
      const col = i % perRow;
      const rowN = Math.floor(i / perRow);
      let s = sprites.get(a.id);
      if (!s) {
        s = makeSprite();
        layer.addChild(s.container);
        sprites.set(a.id, s);
      }
      // Snap to truth. No tween — see file header.
      s.container.x = room.x + 34 + col * 74;
      s.container.y = room.y + 52 + rowN * 48;
      s.container.alpha = a.status === "exited" ? 0.4 : 1;

      const tint = STATUS_TINT[a.status];
      s.body.clear();
      s.body.circle(0, 0, 9).fill(tint);
      if (a.status === "blocked" || a.status === "erroring") {
        s.body.circle(0, 0, 13).stroke({ width: 2, color: tint });
      }

      s.name.text = a.name;
      s.name.x = -s.name.width / 2;

      const bubble = bubbleText(a);
      s.thought.text = bubble.length > 36 ? `${bubble.slice(0, 35)}…` : bubble;
      s.thought.visible = bubble.length > 0;
      s.thought.x = -s.thought.width / 2;
    });
  }

  for (const [id, s] of sprites) {
    if (seen.has(id)) continue;
    s.container.destroy({ children: true });
    sprites.delete(id);
  }
}

export function WorldMap({ world }: { world: WorldState }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const layerRef = useRef<Container | null>(null);
  const spritesRef = useRef<Map<string, Sprite>>(new Map());
  // Kept current by the render effect so the async init below draws the latest
  // world, not the one captured at mount — events can stream in during init().
  const worldRef = useRef(world);
  worldRef.current = world;

  // Create the Pixi app once. init() is async, so a fast unmount (React
  // StrictMode double-invoke, HMR) can fire cleanup before it resolves —
  // destroy() on a non-initialised Application throws, so gate on `initialised`.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initialised = false;
    const app = new Application();

    void app
      .init({ width: W, height: H, background: 0x0f1020, antialias: true })
      .then(() => {
        initialised = true;
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        appRef.current = app;
        app.canvas.style.width = "100%";
        app.canvas.style.maxWidth = `${W}px`;
        app.canvas.style.height = "auto";
        host.appendChild(app.canvas);

        const rooms = new Container();
        for (const key of Object.keys(ROOMS) as Location[]) {
          const r = ROOMS[key];
          rooms.addChild(
            new Graphics()
              .roundRect(r.x, r.y, r.w, r.h, 6)
              .fill(r.color)
              .stroke({ width: 1, color: 0x000000, alpha: 0.3 }),
          );
          const label = new Text({
            text: r.label,
            style: {
              fill: 0xffffff,
              fontSize: 11,
              fontFamily: "monospace",
              fontWeight: "bold",
              letterSpacing: 1,
            },
          });
          label.alpha = 0.65;
          label.x = r.x + 10;
          label.y = r.y + 8;
          rooms.addChild(label);
        }
        app.stage.addChild(rooms);

        const layer = new Container();
        app.stage.addChild(layer);
        layerRef.current = layer;

        renderAgents(layer, spritesRef.current, worldRef.current);
      });

    return () => {
      disposed = true;
      appRef.current = null;
      layerRef.current = null;
      spritesRef.current = new Map();
      if (initialised) app.destroy(true, { children: true });
    };
    // world is intentionally not a dep — the render effect below handles updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw sprites whenever the world changes.
  useEffect(() => {
    if (layerRef.current) {
      renderAgents(layerRef.current, spritesRef.current, world);
    }
  }, [world]);

  return <div className="map-host" ref={hostRef} />;
}
