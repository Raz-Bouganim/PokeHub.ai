// Draws the static room blocks and their labels (VISION "The world" → Rooms).
// Verified live via the stub.

import { Container, Graphics, Text } from "pixi.js";
import type { Location } from "../../../../core/events.ts";
import { ROOMS } from "./geometry.ts";

export function drawRooms(stage: Container): void {
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
  stage.addChild(rooms);
}
