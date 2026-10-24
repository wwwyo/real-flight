import { describe, expect, test } from "bun:test";
import { HOVER } from "../shared/protocol";
import { HOVER_REPEATS, HoverWatchdog, RC_WATCHDOG_MS } from "./hover-watchdog";

const STALE = RC_WATCHDOG_MS + 1;

/** The cancels a silence produces, one per tick. */
function silence(watchdog: HoverWatchdog, from: number, airborne = true): number {
  let sent = 0;
  for (let tick = 0; tick < 10; tick++) {
    if (watchdog.next(from + tick * RC_WATCHDOG_MS, airborne)) sent++;
  }
  return sent;
}

describe("HoverWatchdog", () => {
  test("says nothing before the cockpit has flown it", () => {
    const watchdog = new HoverWatchdog();
    expect(watchdog.next(STALE * 10, true)).toBeNull();
  });

  test("says nothing while the drone is on the ground", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(STALE, false)).toBeNull();
    expect(watchdog.next(STALE * 2, false)).toBeNull();
  });

  test("lets fresh stick input through untouched", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(RC_WATCHDOG_MS, true)).toBeNull();
  });

  test("cancels the setpoint a few times, then stays quiet so the drone's failsafe can land it", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(STALE, true)).toEqual(HOVER);
    expect(silence(watchdog, STALE)).toBe(HOVER_REPEATS - 1);
    // Anything more would keep the Tello's 15-second no-command failsafe from firing.
    expect(silence(watchdog, STALE * 100)).toBe(0);
  });

  test("cancels again after every silence", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(STALE, true)).toEqual(HOVER);
    watchdog.noteInput(STALE * 2);
    expect(watchdog.next(STALE * 2 + RC_WATCHDOG_MS, true)).toBeNull();
    expect(silence(watchdog, STALE * 3)).toBe(HOVER_REPEATS);
  });

  test("forgets the silence when the link that was flying the drone goes away", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(silence(watchdog, STALE)).toBe(HOVER_REPEATS);
    watchdog.reset();
    expect(watchdog.next(STALE * 100, true)).toBeNull();
  });
});
