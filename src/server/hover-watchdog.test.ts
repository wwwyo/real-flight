import { describe, expect, test } from "bun:test";
import { HOVER } from "../shared/protocol";
import { HoverWatchdog, RC_WATCHDOG_MS } from "./hover-watchdog";

const STALE = RC_WATCHDOG_MS + 1;

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

  test("cancels the last setpoint once, then stays quiet so the drone's failsafe can land it", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(STALE, true)).toEqual(HOVER);
    // Anything more would keep the Tello's 15-second no-command failsafe from firing.
    expect(watchdog.next(STALE + RC_WATCHDOG_MS, true)).toBeNull();
    expect(watchdog.next(STALE * 100, true)).toBeNull();
  });

  test("cancels again after every silence", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(STALE, true)).toEqual(HOVER);
    watchdog.noteInput(STALE * 2);
    expect(watchdog.next(STALE * 2 + RC_WATCHDOG_MS, true)).toBeNull();
    expect(watchdog.next(STALE * 3, true)).toEqual(HOVER);
  });

  test("forgets the silence when the link that was flying the drone goes away", () => {
    const watchdog = new HoverWatchdog();
    watchdog.noteInput(0);
    expect(watchdog.next(STALE, true)).toEqual(HOVER);
    watchdog.reset();
    expect(watchdog.next(STALE * 2, true)).toBeNull();
  });
});
