/**
 * Headless Phase 0 spike: run ONE real `claude` session, write its event log,
 * and print the world state after every event. No Electron, no Pixi — just
 * proof that the pipe (SDK -> translate -> log -> reducer -> world) is real.
 *
 *   npm run spike -- --cwd /path/to/repo --prompt "find the auth entrypoint"
 *   npm run spike -- --cwd /path/to/repo --class Runner --prompt "run the tests"
 *
 * Permissions auto-allow here (the encounter screen is the app's job); every
 * ask still lands in the log as permission.requested / permission.resolved.
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { reduce } from "../src/core/reducer.ts";
import { initialWorld } from "../src/core/world.ts";
import { agentList } from "../src/core/selectors.ts";
import { spawnAgent } from "../src/agent/session.ts";

const { values } = parseArgs({
  options: {
    cwd: { type: "string", default: process.cwd() },
    prompt: { type: "string" },
    name: { type: "string", default: "Spike" },
    class: { type: "string", default: "Builder" },
  },
});

if (!values.prompt) {
  console.error('missing --prompt "…"');
  process.exit(1);
}

const agentId = `spike-${Date.now()}`;
const logPath = join(process.cwd(), ".pokehub", "sessions", `${agentId}.ndjson`);

let world = initialWorld();

const handle = spawnAgent({
  agentId,
  name: values.name!,
  agentClass: values.class!,
  cwd: values.cwd!,
  prompt: values.prompt,
  logPath,
  onEvent: (event) => {
    world = reduce(world, event);
    const a = agentList(world)[0];
    console.log(
      `#${String(event.seq).padStart(3, "0")} ${event.kind.padEnd(22)} ` +
        (a ? `${a.location.padEnd(8)} ${a.status}` : ""),
    );
    // One-shot: the spike proves the pipe for a single turn. The agent now goes
    // `idle` (session resumable) rather than exiting, so end it explicitly.
    if (event.kind === "agent.turn_finished") handle.stop();
  },
});

process.on("SIGINT", () => {
  console.log("\ninterrupting…");
  handle.stop();
});

await handle.done;

console.log(`\nlog: ${logPath}`);
console.log(`seq high-water: ${world.maxSeqSeen}`);
console.log("final world:", JSON.stringify(world, null, 2));
