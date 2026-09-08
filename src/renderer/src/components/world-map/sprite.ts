// One agent on the map: the Pixi objects for it and how they're drawn from
// `AgentState`. Verified live via the stub.

import { Container, Graphics, Text } from "pixi.js";
import { agentColor } from "../../../../core/text/agent-color.ts";
import type { AgentState, AgentStatus } from "../../../../core/world.ts";
import { BODY_R, clampCenteredX, fitMono, SUB_BODY_R } from "./geometry.ts";

/** Fill by glance-level status (VISION "Reading state at a glance"). Matched to
 *  the DOM `.status-<status>` utility so a status reads the same everywhere. */
const STATUS_TINT: Record<AgentStatus, number> = {
  spawning: 0x8a8db5,
  thinking: 0x9aa0d8,
  working: 0x7fd7a5,
  blocked: 0xffcf5c,
  erroring: 0xff7a7a,
  idle: 0x6f77b0,
  exited: 0x55566f,
};

export interface Sprite {
  container: Container;
  body: Graphics;
  name: Text;
  thought: Text;
}

export function makeSprite(onSelect: () => void): Sprite {
  const container = new Container();
  container.eventMode = "static";
  container.cursor = "pointer";
  container.on("pointertap", onSelect);

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

/** One line of ambient status when the agent has no explicit thought. Plain
 *  ASCII only — Pixi's canvas monospace has no glyph for pause/emoji marks. */
function bubbleText(a: AgentState): string {
  if (a.thought) return a.thought;
  if (a.pendingPermissions[0]) return `wait: ${a.pendingPermissions[0].tool}`;
  if (a.activeTools[0]) return a.activeTools[0].tool;
  if (a.exitReason) return a.exitReason;
  if (a.status === "idle") return "· idle ·";
  return "";
}

/** Place a sprite at `(x, y)` and redraw it. No tween — position always follows
 *  truth (VISION decided item #2). `cellW` bounds the label width. */
export function drawSprite(
  s: Sprite,
  a: AgentState,
  x: number,
  y: number,
  cellW: number,
  selected: boolean,
): void {
  s.container.x = x;
  s.container.y = y;
  s.container.alpha = a.status === "exited" ? 0.4 : a.status === "idle" ? 0.7 : 1;

  const tint = STATUS_TINT[a.status];
  const r = a.parentAgentId !== null ? SUB_BODY_R : BODY_R;
  s.body.clear();
  s.body.circle(0, 0, r).fill(tint);
  // Identity ring — the agent's stable colour, independent of status.
  s.body.circle(0, 0, r + 2).stroke({ width: 1.5, color: agentColor(a.id), alpha: 0.9 });
  if (a.status === "blocked" || a.status === "erroring") {
    s.body.circle(0, 0, r + 4).stroke({ width: 2, color: tint });
  }
  if (selected) {
    s.body.circle(0, 0, r + 7).stroke({ width: 1.5, color: 0x9aa0d8, alpha: 0.9 });
  }

  s.name.text = fitMono(a.name, cellW - 6, 10);
  s.name.x = clampCenteredX(s.container.x, s.name.width);

  const bubble = fitMono(bubbleText(a), cellW - 6, 9);
  s.thought.text = bubble;
  s.thought.visible = bubble.length > 0;
  s.thought.x = clampCenteredX(s.container.x, s.thought.width);
}
