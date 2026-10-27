import { mkdirSync } from "node:fs";
import { isKeyAccessUnit } from "../shared/h264";
import type { LogData } from "../shared/protocol";

const LOGS_DIR = "logs";

/**
 * Writes what happened on the drone ⇄ relay ⇄ cockpit link to `logs/link-<time>.jsonl`, one JSON
 * object per line, so a session can be read back after the pilot takes the headset off.
 * Periodic stats go only to the file; events are also printed so the terminal shows them live.
 */
export class LinkLog {
  readonly path = `${LOGS_DIR}/link-${new Date().toISOString().replaceAll(":", "-")}.jsonl`;
  private writer: ReturnType<ReturnType<typeof Bun.file>["writer"]>;

  constructor() {
    // The file writer opens the path as it is; unlike Bun.write it does not create the directory.
    mkdirSync(LOGS_DIR, { recursive: true });
    this.writer = Bun.file(this.path).writer();
  }

  event(source: string, event: string, data: LogData = {}): void {
    this.write(source, event, data);
    console.log(`[${source}] ${event}`, Object.keys(data).length > 0 ? JSON.stringify(data) : "");
  }

  stats(source: string, event: string, data: LogData): void {
    this.write(source, event, data);
  }

  private write(source: string, event: string, data: LogData): void {
    this.writer.write(`${JSON.stringify({ at: new Date().toISOString(), source, event, ...data })}\n`);
    this.writer.flush();
  }
}

/**
 * Counts the video the relay receives from the drone, per window. Long gaps and sparse key frames are
 * what freeze the cockpit: after a lost frame the decoder can only restart at the next key frame.
 */
export class VideoStats {
  private frames = 0;
  private keys = 0;
  private bytes = 0;
  private maxGapMs = 0;
  private maxKeyIntervalMs = 0;
  private lastFrameAt: number | null = null;
  private lastKeyAt: number | null = null;

  noteFrame(accessUnit: Uint8Array, now: number): void {
    this.frames++;
    this.bytes += accessUnit.length;
    if (this.lastFrameAt !== null) this.maxGapMs = Math.max(this.maxGapMs, now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (!isKeyAccessUnit(accessUnit)) return;
    this.keys++;
    if (this.lastKeyAt !== null) this.maxKeyIntervalMs = Math.max(this.maxKeyIntervalMs, now - this.lastKeyAt);
    this.lastKeyAt = now;
  }

  /** The window's numbers; the counters start over, the times of the last frames carry on. */
  take(windowMs: number, now: number): LogData {
    const seconds = windowMs / 1000;
    const sinceFrame = this.lastFrameAt === null ? null : now - this.lastFrameAt;
    const stats = {
      fps: round(this.frames / seconds),
      kbps: round((this.bytes * 8) / 1000 / seconds),
      keyFrames: this.keys,
      maxGapMs: Math.round(Math.max(this.maxGapMs, sinceFrame ?? 0)),
      maxKeyIntervalMs: Math.round(this.maxKeyIntervalMs),
      sinceKeyMs: this.lastKeyAt === null ? null : Math.round(now - this.lastKeyAt),
    };
    this.frames = this.keys = this.bytes = this.maxGapMs = this.maxKeyIntervalMs = 0;
    return stats;
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
