import { describe, expect, test } from "bun:test";
import { FIRE_INTERVAL_MS, HITS_TO_SHOOT_DOWN, Sortie } from "./sortie";

/** Fires `count` shots one interval apart at `aimedAt`, starting at `from`; returns ids shot down. */
function burst(sortie: Sortie, aimedAt: number | null, from: number, count: number): number[] {
  const down: number[] = [];
  for (let i = 0; i < count; i++) {
    const result = sortie.fire(from + i * FIRE_INTERVAL_MS, aimedAt);
    if (result?.shotDown) down.push(result.hit!);
  }
  return down;
}

describe("Sortie", () => {
  test("a target is shot down by its third hit", () => {
    const sortie = new Sortie([1, 2]);
    sortie.takeoff(0);

    expect(burst(sortie, 1, 0, HITS_TO_SHOOT_DOWN - 1)).toEqual([]);
    expect(sortie.state.hits).toEqual({ 1: 2 });
    expect(burst(sortie, 1, 1000, 1)).toEqual([1]);
    expect(sortie.state.remaining).toEqual([2]);
    expect(sortie.state.hits).toEqual({});
  });

  test("a held trigger fires once per interval", () => {
    const sortie = new Sortie([1]);
    sortie.takeoff(0);

    expect(sortie.fire(0, 1)).toEqual({ hit: 1, shotDown: false });
    expect(sortie.fire(FIRE_INTERVAL_MS - 1, 1)).toBeNull();
    expect(sortie.fire(FIRE_INTERVAL_MS, 1)).toEqual({ hit: 1, shotDown: false });
    expect(sortie.state.shots).toBe(2);
  });

  test("a miss counts as a shot but damages nothing", () => {
    const sortie = new Sortie([1]);
    sortie.takeoff(0);

    expect(sortie.fire(0, null)).toEqual({ hit: null, shotDown: false });
    expect(sortie.state).toMatchObject({ shots: 1, shotsHit: 0, hits: {}, lastShot: { at: 0, hit: null } });
  });

  test("shooting down every target completes the sortie and stops the clock", () => {
    const sortie = new Sortie([1]);
    sortie.takeoff(10_000);

    burst(sortie, 1, 10_000, HITS_TO_SHOOT_DOWN);
    const elapsed = sortie.state.elapsedMs;
    sortie.update(20_000);
    expect(sortie.state.phase).toBe("complete");
    expect(sortie.state.elapsedMs).toBe(elapsed);
    expect(sortie.fire(20_000, null)).toBeNull();
  });

  test("nothing is fired before takeoff or after landing", () => {
    const sortie = new Sortie([1]);
    expect(sortie.fire(0, 1)).toBeNull();

    sortie.takeoff(3000);
    sortie.land(3100);
    expect(sortie.fire(3200, 1)).toBeNull();
    expect(sortie.state).toMatchObject({ phase: "landed", shots: 0 });
  });

  test("ids that are not live targets are misses", () => {
    const sortie = new Sortie([1]);
    sortie.takeoff(0);
    expect(sortie.fire(0, 42)).toEqual({ hit: null, shotDown: false });

    const wrecked = new Sortie([1, 2]);
    wrecked.takeoff(0);
    burst(wrecked, 1, 0, HITS_TO_SHOOT_DOWN);
    expect(wrecked.fire(5000, 1)).toEqual({ hit: null, shotDown: false });
  });

  test("takeoff while airborne preserves the sortie, including after all targets are shot down", () => {
    const sortie = new Sortie([1, 2]);
    sortie.takeoff(0);
    burst(sortie, 1, 0, HITS_TO_SHOOT_DOWN);
    const flying = sortie.state;
    sortie.takeoff(1200);
    expect(sortie.state).toEqual(flying);

    burst(sortie, 2, 2000, HITS_TO_SHOOT_DOWN);
    const complete = sortie.state;
    sortie.takeoff(2500);
    expect(sortie.state).toEqual(complete);
    expect(sortie.airborne).toBe(true);

    sortie.land(3000);
    expect(sortie.airborne).toBe(false);
    expect(sortie.state.elapsedMs).toBe(complete.elapsedMs);
    sortie.takeoff(4000);
    expect(sortie.state).toMatchObject({ remaining: [1, 2], shotDown: [], hits: {}, shots: 0, elapsedMs: 0 });
  });
});
