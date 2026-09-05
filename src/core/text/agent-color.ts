/**
 * A stable colour per agent id — same agent, same colour everywhere it shows up
 * (raw-log rows, the agent list, the sprite accent ring), with no colour
 * registry to keep in sync. Pure hash of the id string.
 */

/**
 * A stable hue (0-359) for an agent id.
 *
 * @param agentId - the agent's stable id
 * @returns a hue in [0, 359], deterministic for the id
 */
export function agentHue(agentId: string): number {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/**
 * The agent's identity colour as a CSS/Pixi-parseable string. Used verbatim in
 * DOM `style` and in Pixi `stroke({ color })` — both parse `hsl()`.
 *
 * @param agentId - the agent's stable id
 * @returns an `hsl(...)` colour string
 */
export function agentColor(agentId: string): string {
  return `hsl(${agentHue(agentId)}, 65%, 65%)`;
}
