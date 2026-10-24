import { describe, expect, test } from "bun:test";
import { HOVER } from "../shared/protocol";
import { HOVER_REPEATS, HoverWatchdog, RC_WATCHDOG_MS } from "./hover-watchdog";

const STALE = RC_WATCHDOG_MS + 1;

/** Runs the watchdog at the relay's tick rate and counts the cancels it sends. */
function ticks(watchdog: HoverWatchdog, from: number, count: number): number {
  let sent = 0;
  for (let tick = 1; tick <= count; tick++) {
    if (watchdog.next(from + tick * RC_WATCHDOG_MS)) sent++;
  }
  return sent;
}

describe("HoverWatchdog", () => {
  test("says nothing before the cockpit has flown it", () => {
    const watchdog = new HoverWatchdog();
    expect(watchdog.next(STALE * 10)).toBeNull();
  });

  test("says nothing while the drone is on the ground", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    watchdog.reset();
    expect(ticks(watchdog, 0, 10)).toBe(0);
  });

  test("lets fresh stick input through untouched", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(RC_WATCHDOG_MS)).toBeNull();
  });

  test("cancels the setpoint a few times, then stays quiet so the drone's failsafe can land it", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    // Cancels at 500, 1000 and 1500 ms of silence, then nothing: more would keep the Tello's
    // 15-second no-command failsafe from firing.
    expect(ticks(watchdog, 0, 20)).toBe(HOVER_REPEATS);
  });

  test("does not spend the cancels faster than one per interval", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(STALE)).toEqual(HOVER);
    // Ten calls in the same instant must not drain the retries: they are there to survive datagram
    // loss, which a burst would share.
    expect(Array.from({ length: 10 }, () => watchdog.next(STALE))).toEqual(Array(10).fill(null));
    expect(watchdog.next(STALE + RC_WATCHDOG_MS)).toBeNull();
    expect(watchdog.next(STALE + RC_WATCHDOG_MS + 1)).toEqual(HOVER);
  });

  test("cancels again after every silence", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(ticks(watchdog, 0, 20)).toBe(HOVER_REPEATS);
    watchdog.noteInput(STALE * 4);
    expect(ticks(watchdog, STALE * 4, 20)).toBe(HOVER_REPEATS);
  });

  test("forgets the silence when the drone lands or its link goes away", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(ticks(watchdog, 0, 20)).toBe(HOVER_REPEATS);
    watchdog.reset();
    expect(ticks(watchdog, 0, 20)).toBe(0);
  });
});
