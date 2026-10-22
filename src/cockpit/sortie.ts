export type Phase = "ready" | "flying" | "complete" | "landed";

export type SortieState = {
  phase: Phase;
  elapsedMs: number;
  remaining: number[];
  shotDown: number[];
  /** The target closest to being shot down, if any is locked. */
  lock: { id: number; progress: number } | null;
};

/** Initial lock duration from the PRD; tuned by feel. */
export const DEFAULT_LOCK_MS = 1000;
/**
 * A lock survives detection dropouts this short. Not resetting on a single missed frame,
 * because ArUco misses markers on blurry frames even while the target stays in the reticle.
 */
export const LOCK_GRACE_MS = 200;

/**
 * One sortie: from takeoff until every target is shot down or the drone lands.
 * A target is shot down once it stays inside the reticle for the lock duration.
 */
export class Sortie {
  private phase: Phase = "ready";
  private startedAt = 0;
  private endedAt = 0;
  private alive: Set<number>;
  private down: number[] = [];
  private locks = new Map<number, { startedAt: number; lastSeenAt: number }>();
  private now = 0;

  constructor(
    private readonly targetIds: readonly number[],
    private readonly lockMs = DEFAULT_LOCK_MS,
  ) {
    this.alive = new Set(targetIds);
  }

  /** Starts a new sortie; any previous one is discarded. */
  takeoff(now: number): void {
    this.phase = "flying";
    this.startedAt = now;
    this.now = now;
    this.alive = new Set(this.targetIds);
    this.down = [];
    this.locks.clear();
  }

  land(now: number): void {
    if (this.phase !== "flying") return;
    this.phase = "landed";
    this.endedAt = now;
    this.locks.clear();
  }

  /** Advances time with the targets seen inside the reticle on this frame; returns ids shot down now. */
  update(now: number, inReticle: Iterable<number>): number[] {
    this.now = now;
    if (this.phase !== "flying") return [];
    for (const id of inReticle) {
      if (!this.alive.has(id)) continue;
      const lock = this.locks.get(id);
      if (lock) lock.lastSeenAt = now;
      else this.locks.set(id, { startedAt: now, lastSeenAt: now });
    }
    const shot: number[] = [];
    for (const [id, { startedAt, lastSeenAt }] of this.locks) {
      if (now - lastSeenAt > LOCK_GRACE_MS) {
        this.locks.delete(id);
      } else if (now - startedAt >= this.lockMs) {
        this.locks.delete(id);
        this.alive.delete(id);
        this.down.push(id);
        shot.push(id);
      }
    }
    if (this.alive.size === 0) {
      this.phase = "complete";
      this.endedAt = now;
    }
    return shot;
  }

  get state(): SortieState {
    let lock: SortieState["lock"] = null;
    for (const [id, { startedAt }] of this.locks) {
      const progress = Math.min(1, (this.now - startedAt) / this.lockMs);
      if (!lock || progress > lock.progress) lock = { id, progress };
    }
    const end = this.phase === "flying" ? this.now : this.endedAt;
    return {
      phase: this.phase,
      elapsedMs: this.phase === "ready" ? 0 : end - this.startedAt,
      remaining: [...this.alive],
      shotDown: [...this.down],
      lock,
    };
  }
}
