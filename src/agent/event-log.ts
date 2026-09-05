/**
 * The append-only event log writer. THIS is the file on disk the whole
 * architecture hangs off (VISION: "a FILE on disk, written by the agent side").
 * Attach-mode later is just tailing a log this process wrote.
 *
 * Responsibilities kept here and nowhere else:
 *  - assign the monotonic `seq`
 *  - stamp `ts` (this is the one place wall-clock is read)
 *  - append one JSON object per line, never rewritten
 *
 * Durability is best-effort for Phase 0: writes go through a Node write stream
 * (buffered), and `close()` waits for it to drain. A hard crash can still lose
 * the last few lines — `parseLog` tolerates a truncated final line for exactly
 * that reason. Real fsync-on-append is a Phase 2 / attach-mode concern.
 */

import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_VERSION, type PokeHubEvent } from "../core/events.ts";
import { serializeEvent } from "../core/log.ts";
import type { EventDraft } from "./translate.ts";

export class EventLog {
  private readonly path: string;
  private readonly stream: WriteStream;
  private seq = 0;

  /**
   * @param path    absolute path to the `.ndjson` log for this session
   * @param onError invoked if the underlying write stream emits `'error'`
   *                (EPIPE, ENOSPC, …). Without a handler an `'error'` event
   *                crashes the process, so this is not optional in practice —
   *                it just defaults to a console warning.
   */
  constructor(path: string, onError?: (err: Error) => void) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.stream = createWriteStream(path, { flags: "a" });
    this.stream.on("error", (err) => {
      if (onError) onError(err);
      else console.error(`EventLog(${path}) write error:`, err);
    });
  }

  /** Append one event. Returns the finished event (with seq/ts) for callers
   *  that want to feed it straight into a live reducer. */
  append(draft: EventDraft): PokeHubEvent {
    const event = {
      ...draft,
      v: SCHEMA_VERSION,
      seq: ++this.seq,
      ts: new Date().toISOString(),
    } as PokeHubEvent;
    // If the stream has already errored/closed, keep numbering and hand the
    // event back for the live feed, but don't throw trying to persist it.
    if (this.stream.writable) this.stream.write(serializeEvent(event));
    return event;
  }

  /** Flush and close. Resolves once the stream has drained to disk. */
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
  }

  get filePath(): string {
    return this.path;
  }
}
