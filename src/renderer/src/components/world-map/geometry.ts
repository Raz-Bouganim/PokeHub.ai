// Pure layout for the map canvas: room rectangles and the maths that tiles a
// room into non-overlapping cells and trims labels to fit. No Pixi.

import type { Location } from "../../../../core/events.ts";

export const W = 600;
export const H = 440;

/** A roster agent's body radius; a subagent's is smaller (one-off, not roster). */
export const BODY_R = 9;
export const SUB_BODY_R = 6;

const CANVAS_MARGIN = 4;
/** Below this width agents pack tighter instead of adding a row. */
const SLOT_MIN_W = 66;
/** Rows never compress past this — columns narrow instead, so stacked rows
 *  can't overprint each other's labels. */
const SLOT_ROW_H = 50;

interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: number;
}

/** Room layout, mirroring `core/rooms.ts` — adding a room is a row here + there. */
export const ROOMS: Record<Location, RoomRect> = {
  library: { x: 16, y: 16, w: 280, h: 168, label: "LIBRARY", color: 0x2b3a67 },
  forge: { x: 304, y: 16, w: 280, h: 168, label: "FORGE", color: 0x6b3a1e },
  gym: { x: 16, y: 192, w: 280, h: 168, label: "GYM", color: 0x27492f },
  center: { x: 304, y: 192, w: 280, h: 168, label: "CENTER", color: 0x5c2a44 },
  route: { x: 16, y: 368, w: 568, h: 56, label: "ROUTE", color: 0x33354a },
};

interface Tiling {
  cols: number;
  cellW: number;
  cellH: number;
}

/** Tile a room's interior into one non-overlapping cell per agent. */
export function tileRoom(n: number, innerW: number, innerH: number): Tiling {
  const maxRows = Math.max(1, Math.floor(innerH / SLOT_ROW_H));
  let cols = Math.max(1, Math.min(n, Math.floor(innerW / SLOT_MIN_W)));
  let rows = Math.max(1, Math.ceil(n / cols));
  if (rows > maxRows) {
    rows = maxRows;
    cols = Math.ceil(n / rows);
  }
  return { cols, cellW: innerW / cols, cellH: rows > 1 ? innerH / rows : innerH };
}

/** Monospace glyphs are ~0.6em wide; trim `text` with an ellipsis to fit `maxPx`. */
export function fitMono(text: string, maxPx: number, fontSize: number): string {
  const maxChars = Math.floor(maxPx / (fontSize * 0.6));
  if (text.length <= maxChars) return text;
  if (maxChars < 2) return "";
  return `${text.slice(0, maxChars - 1)}…`;
}

/** Keep a sprite-centred label on-canvas: a long string near an edge would
 *  otherwise centre itself straight off the stage. */
export function clampCenteredX(containerX: number, textWidth: number): number {
  const centered = -textWidth / 2;
  const minX = CANVAS_MARGIN - containerX;
  const maxX = W - CANVAS_MARGIN - containerX - textWidth;
  return Math.min(Math.max(centered, minX), maxX);
}
