import { HOVER, type RcInput } from "../shared/protocol";

/** Without fresh cockpit input for this long, the last stick setpoint is cancelled. */
export const RC_WATCHDOG_MS = 500;
/**
 * How many times the cancel is sent. The Tello takes stick input over UDP with no retry, so one lost
 * datagram would leave the last setpoint (a stick held forward) on until the drone's failsafe lands it.
 * Three sends cost about a second of that 15 s timer and ask for the same thing.
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
 */
export class HoverWatchdog {
  /** When the cockpit last sent stick input, or null if it never has since the last reset. */
  private lastInputAt: number | null = null;
  /** Cancels already sent for this silence. */
  private sent = 0;

  /** The cockpit is alive and flying the drone. */
  noteInput(now: number): void {
    this.lastInputAt = now;
    this.sent = 0;
  }

  /** The link that was flying the drone is gone; say nothing until the cockpit speaks again. */
  reset(): void {
    this.lastInputAt = null;
    this.sent = 0;
  }

  /** The stick input to send on this tick, or null to send nothing. */
  next(now: number, airborne: boolean): RcInput | null {
    if (!airborne || this.lastInputAt === null || this.sent >= HOVER_REPEATS) return null;
    if (this.sent === 0 && now - this.lastInputAt <= RC_WATCHDOG_MS) return null;
    this.sent++;
    return HOVER;
  }
}
