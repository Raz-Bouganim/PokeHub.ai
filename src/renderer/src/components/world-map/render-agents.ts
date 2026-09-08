// Lays out every visible agent into its room's cells, draws the tethers, and
// disposes sprites for agents that have left. Verified live via the stub.

import { Container, Graphics } from "pixi.js";
import type { Location } from "../../../../core/events.ts";
import { agentColor } from "../../../../core/text/agent-color.ts";
import type { AgentState, WorldState } from "../../../../core/world.ts";
import { agentList } from "../../../../core/selectors.ts";
import { ROOMS, tileRoom } from "./geometry.ts";
import { drawSprite, makeSprite, type Sprite } from "./sprite.ts";

export interface RenderContext {
  layer: Container;
  tethers: Graphics;
  sprites: Map<string, Sprite>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The project (`cwd`) to show; `null` = the whole world (single project). */
  focusedProject: string | null;
}

export function renderAgents(world: WorldState, ctx: RenderContext): void {
  const visible = agentList(world).filter(
    (a) => ctx.focusedProject === null || a.cwd === ctx.focusedProject,
  );

  const byRoom = new Map<Location, AgentState[]>();
  for (const a of visible) {
    const arr = byRoom.get(a.location) ?? [];
    arr.push(a);
    byRoom.set(a.location, arr);
  }

  const seen = new Set<string>();
  for (const [loc, agents] of byRoom) {
    const room = ROOMS[loc] ?? ROOMS.route;
    const innerW = room.w - 24;
    const innerTop = room.y + 26;
    const { cols, cellW, cellH } = tileRoom(agents.length, innerW, room.h - 34);

    agents.forEach((a, i) => {
      seen.add(a.id);
      const sprite = getSprite(ctx, a.id);
      const x = room.x + 12 + cellW * ((i % cols) + 0.5);
      const y = innerTop + cellH * (Math.floor(i / cols) + 0.5);
      drawSprite(sprite, a, x, y, cellW, a.id === ctx.selectedId);
    });
  }

  drawTethers(world, ctx, seen);
  disposeMissing(ctx.sprites, seen);
}

function getSprite(ctx: RenderContext, id: string): Sprite {
  let sprite = ctx.sprites.get(id);
  if (!sprite) {
    sprite = makeSprite(() => ctx.onSelect(id));
    ctx.layer.addChild(sprite.container);
    ctx.sprites.set(id, sprite);
  }
  return sprite;
}

/** A thin line from each subagent to its parent, in the child's identity
 *  colour. Drawn into `ctx.tethers`, which sits at the back of the layer so it
 *  paints beneath every sprite. */
function drawTethers(world: WorldState, ctx: RenderContext, seen: Set<string>): void {
  ctx.tethers.clear();
  for (const a of agentList(world)) {
    if (a.parentAgentId === null || !seen.has(a.id)) continue;
    const child = ctx.sprites.get(a.id);
    const parent = ctx.sprites.get(a.parentAgentId);
    if (!child || !parent) continue;

    const faded = a.status === "exited" || parent.container.alpha < 1;
    const color = agentColor(a.id);
    ctx.tethers
      .moveTo(child.container.x, child.container.y)
      .lineTo(parent.container.x, parent.container.y)
      .stroke({ width: 1.5, color, alpha: faded ? 0.15 : 0.4 });
    ctx.tethers
      .circle(parent.container.x, parent.container.y, 2)
      .fill({ color, alpha: faded ? 0.2 : 0.6 });
  }
}

function disposeMissing(sprites: Map<string, Sprite>, seen: Set<string>): void {
  for (const [id, sprite] of sprites) {
    if (seen.has(id)) continue;
    sprite.container.destroy({ children: true });
    sprites.delete(id);
  }
}
