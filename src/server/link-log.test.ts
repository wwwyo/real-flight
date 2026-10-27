import { describe, expect, test } from "bun:test";
import { VideoStats } from "./link-log";

const START = [0, 0, 0, 1];
const key = new Uint8Array([...START, 0x65, 0x88, 0x84, 0x00]);
const delta = new Uint8Array([...START, 0x41, 0x9a, 0x02, 0x03]);

describe("VideoStats", () => {
  test("reports the longest gap and key frame interval of the window", () => {
    const stats = new VideoStats();
    stats.noteFrame(key, 0);
    stats.noteFrame(delta, 33);
    stats.noteFrame(delta, 433);
    stats.noteFrame(key, 1500);
    expect(stats.take(2000, 2000)).toEqual({
      fps: 2,
      kbps: 0.1,
      keyFrames: 2,
      maxGapMs: 1067,
      maxKeyIntervalMs: 1500,
      sinceKeyMs: 500,
    });
  });

  test("counts a stream that stopped as a gap still growing", () => {
    const stats = new VideoStats();
    stats.noteFrame(key, 0);
    stats.take(1000, 1000);
    expect(stats.take(1000, 3000)).toMatchObject({ fps: 0, maxGapMs: 3000, sinceKeyMs: 3000 });
  });
});
