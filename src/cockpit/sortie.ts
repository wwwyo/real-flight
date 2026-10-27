export type Phase = "ready" | "flying" | "complete" | "landed";

export type SortieState = {
  phase: Phase;
  elapsedMs: number;
  remaining: number[];
  shotDown: number[];
  /** Hits taken by each target still alive; a target missing here has not been hit. */
  hits: Record<number, number>;
  shots: number;
  /** Shots that hit a target, for the hit rate after landing. */
  shotsHit: number;
  /** The latest shot, for the muzzle flash and hit marker; null before the first one. */
  lastShot: { at: number; hit: number | null } | null;
};

/** Hits a target takes before it is shot down. */
export const HITS_TO_SHOOT_DOWN = 3;
/** Holding fire shoots once per interval; unlimited ammunition. */
export const FIRE_INTERVAL_MS = 300;

export type ShotResult = { hit: number | null; shotDown: boolean } | null;

/**
 * One sortie: from takeoff until every target is shot down or the drone lands. The pilot fires at
 * whatever is under the reticle's centre in the view they see, so video latency does not make a hit
 * unfair: the shot is judged on the same frame the pilot aimed at.
 */
export class Sortie {
  private phase: Phase = "ready";
  private startedAt = 0;
  private endedAt = 0;
  private alive: Set<number>;
  private down: number[] = [];
  private hits = new Map<number, number>();
  private shots = 0;
  private shotsHit = 0;
  private lastShot: SortieState["lastShot"] = null;
  private now = 0;

  constructor(private readonly targetIds: readonly number[]) {
    this.alive = new Set(targetIds);
  }

  /** Includes a completed sortie whose drone still needs to land. */
  get airborne(): boolean {
    return this.phase === "flying" || this.phase === "complete";
  }

  /** Starts a new sortie only after the previous drone has been told to land. */
  takeoff(now: number): void {
    if (this.airborne) return;
    this.phase = "flying";
    this.startedAt = now;
    this.now = now;
    this.alive = new Set(this.targetIds);
    this.down = [];
    this.hits.clear();
    this.shots = this.shotsHit = 0;
    this.lastShot = null;
  }

  land(now: number): void {
    if (!this.airborne) return;
    if (this.phase === "flying") this.endedAt = now;
    this.phase = "landed";
  }

  /** Advances the clock. */
  update(now: number): void {
    this.now = now;
  }

  /** Whether a held trigger would fire now; false while flying is over or the gun is cycling. */
  canFire(now: number): boolean {
    return this.phase === "flying" && (!this.lastShot || now - this.lastShot.at >= FIRE_INTERVAL_MS);
  }

  /**
   * Fires at the target under the reticle's centre (null for none). Returns null when no shot was
   * fired, otherwise what it hit and whether that shot it down.
   */
  fire(now: number, aimedAt: number | null): ShotResult {
    this.now = now;
    if (!this.canFire(now)) return null;
    this.shots++;
    const hit = aimedAt !== null && this.alive.has(aimedAt) ? aimedAt : null;
    this.lastShot = { at: now, hit };
    if (hit === null) return { hit: null, shotDown: false };
    this.shotsHit++;
    const taken = (this.hits.get(hit) ?? 0) + 1;
    if (taken < HITS_TO_SHOOT_DOWN) {
      this.hits.set(hit, taken);
      return { hit, shotDown: false };
    }
    this.hits.delete(hit);
    this.alive.delete(hit);
    this.down.push(hit);
    if (this.alive.size === 0) {
      this.phase = "complete";
      this.endedAt = now;
    }
    return { hit, shotDown: true };
  }

  get state(): SortieState {
    const end = this.phase === "flying" ? this.now : this.endedAt;
    return {
      phase: this.phase,
      elapsedMs: this.phase === "ready" ? 0 : end - this.startedAt,
      remaining: [...this.alive],
      shotDown: [...this.down],
      hits: Object.fromEntries(this.hits),
      shots: this.shots,
      shotsHit: this.shotsHit,
      lastShot: this.lastShot,
    };
  }
}
