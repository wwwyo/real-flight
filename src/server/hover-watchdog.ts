import { HOVER, type RcInput } from "../shared/protocol";

/** Without fresh cockpit input for this long, the last stick setpoint is cancelled. */
export const RC_WATCHDOG_MS = 500;
/**
 * How many times the cancel is sent, one {@link RC_WATCHDOG_MS} apart. The Tello takes stick input
 * over UDP with no retry, so a lost datagram would leave the last setpoint (a stick held forward) on
 * until the drone's failsafe lands it. Three sends cost about a second of that 15 s timer and ask for
 * the same thing.
 */
export const HOVER_REPEATS = 3;

/**
 * The relay's only safety action when the cockpit goes quiet: cancel the last stick setpoint, and then
 * stop talking.
 *
 * Tello holds the last `rc` setpoint until another arrives, so a cockpit that stops sending would
 * leave the drone flying with it. But sending hover every tick keeps the command link busy and the
 * drone's own failsafe never fires: Tello lands on its own after 15 s without a command. So the relay
 * cancels the setpoint and then says nothing, and the drone lands itself
 * ([ADR 0002](../../docs/adr/0002-safety-stays-on-the-drone.md)).
 *
 * Only flying states use it: `noteInput` when the cockpit flies the drone, `reset` when it is on the
 * ground or its link is gone.
 */
export class HoverWatchdog {
  /** When the cockpit last sent stick input, or null while nothing should be sent. */
  private lastInputAt: number | null = null;
  /** Cancels already sent for this silence. */
  private sent = 0;
  private lastSentAt = 0;

  /** The cockpit is alive and flying the drone. */
  noteInput(now: number): void {
    this.lastInputAt = now;
    this.sent = 0;
  }

  /** Nothing should be sent: the drone is on the ground, or the link that was flying it is gone. */
  reset(): void {
    this.lastInputAt = null;
    this.sent = 0;
  }

  /** The stick input to send on this tick, or null to send nothing. */
  next(now: number): RcInput | null {
    if (this.lastInputAt === null || this.sent >= HOVER_REPEATS) return null;
    // The first cancel waits for silence; the rest are spaced, so a burst of calls cannot spend them.
    const waited = this.sent === 0 ? now - this.lastInputAt : now - this.lastSentAt;
    if (waited <= RC_WATCHDOG_MS) return null;
    this.sent++;
    this.lastSentAt = now;
    return HOVER;
  }
}
