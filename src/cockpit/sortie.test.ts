import { describe, expect, test } from "bun:test";
import { LOCK_GRACE_MS, Sortie } from "./sortie";

const LOCK_MS = 1000;
const FRAME_MS = 33;

/** Feeds frames from `from` to `to` with the given targets in the reticle; returns ids shot down. */
function hold(sortie: Sortie, ids: number[], from: number, to: number): number[] {
  const shot: number[] = [];
  for (let t = from; t <= to; t += FRAME_MS) shot.push(...sortie.update(t, ids));
  return shot;
}

describe("Sortie", () => {
  test("a target held in the reticle for the lock duration is shot down", () => {
    const sortie = new Sortie([1, 2], LOCK_MS);
    sortie.takeoff(0);

    expect(hold(sortie, [1], 0, 900)).toEqual([]);
    expect(sortie.state.lock?.id).toBe(1);
    expect(hold(sortie, [1], 933, 1100)).toEqual([1]);
    expect(sortie.state.remaining).toEqual([2]);
  });

  test("a target that leaves the reticle loses its lock", () => {
    const sortie = new Sortie([1], LOCK_MS);
    sortie.takeoff(0);

    hold(sortie, [1], 0, 800);
    hold(sortie, [], 833, 833 + LOCK_GRACE_MS + FRAME_MS);
    expect(sortie.state.lock).toBeNull();
    expect(hold(sortie, [1], 1200, 2100)).toEqual([]);
  });

  test("a detection dropout shorter than the grace keeps the lock", () => {
    const sortie = new Sortie([1], LOCK_MS);
    sortie.takeoff(0);

    hold(sortie, [1], 0, 500);
    sortie.update(500, [1]);
    sortie.update(500 + LOCK_GRACE_MS - 50, []);
    expect(hold(sortie, [1], 700, 1050)).toEqual([1]);
  });

  test("shooting down every target completes the sortie and stops the clock", () => {
    const sortie = new Sortie([1], LOCK_MS);
    sortie.takeoff(10_000);

    hold(sortie, [1], 10_000, 11_100);
    const elapsed = sortie.state.elapsedMs;
    sortie.update(20_000, []);
    expect(sortie.state.phase).toBe("complete");
    expect(sortie.state.elapsedMs).toBe(elapsed);
  });

  test("nothing is shot down before takeoff or after landing", () => {
    const sortie = new Sortie([1], LOCK_MS);
    expect(hold(sortie, [1], 0, 2000)).toEqual([]);

    sortie.takeoff(3000);
    hold(sortie, [1], 3000, 3050);
    sortie.land(3100);
    expect(sortie.state.lock).toBeNull();
    expect(hold(sortie, [1], 3100, 5000)).toEqual([]);
    expect(sortie.state.phase).toBe("landed");
  });

  test("ids that are not targets are ignored", () => {
    const sortie = new Sortie([1], LOCK_MS);
    sortie.takeoff(0);
    expect(hold(sortie, [42], 0, 2000)).toEqual([]);
    expect(sortie.state.lock).toBeNull();
  });

  test("a frame gap longer than the grace starts a new lock even if the target reappears", () => {
    const sortie = new Sortie([1], LOCK_MS);
    sortie.takeoff(0);
    hold(sortie, [1], 0, 800);

    expect(sortie.update(3000, [1])).toEqual([]);
    expect(sortie.state.lock?.progress).toBe(0);
    expect(hold(sortie, [1], 3033, 4100)).toEqual([1]);
  });

  test("takeoff while airborne preserves the sortie, including after all targets are shot down", () => {
    const sortie = new Sortie([1, 2], LOCK_MS);
    sortie.takeoff(0);
    hold(sortie, [1], 0, 1100);
    const flying = sortie.state;
    sortie.takeoff(1200);
    expect(sortie.state).toEqual(flying);

    hold(sortie, [2], 1200, 2300);
    const complete = sortie.state;
    sortie.takeoff(2500);
    expect(sortie.state).toEqual(complete);
    expect(sortie.airborne).toBe(true);

    sortie.land(3000);
    expect(sortie.airborne).toBe(false);
    expect(sortie.state.elapsedMs).toBe(complete.elapsedMs);
    sortie.takeoff(4000);
    expect(sortie.state.remaining).toEqual([1, 2]);
    expect(sortie.state.shotDown).toEqual([]);
    expect(sortie.state.elapsedMs).toBe(0);
  });
});
