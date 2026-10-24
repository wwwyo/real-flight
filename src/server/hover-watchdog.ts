import { HOVER, type RcInput } from "../shared/protocol";

/** Without fresh cockpit input for this long, the last stick setpoint is cancelled. */
export const RC_WATCHDOG_MS = 500;

/**
 * The relay's only safety action when the cockpit goes quiet: cancel the last stick setpoint, once.
 *
 * Tello holds the last `rc` setpoint until another arrives, so a cockpit that stops sending would
 * leave the drone flying with it. But sending hover every tick keeps the command link busy and the
 * drone's own failsafe never fires: Tello lands on its own after 15 s without a command. So the
 * relay cancels the setpoint and then says nothing, and the drone lands itself
 * ([ADR 0002](../../docs/adr/0002-safety-stays-on-the-drone.md)).
 */
export class HoverWatchdog {
  /** When the cockpit last sent stick input, or null if it never has since the last reset. */
  private lastInputAt: number | null = null;
  /** The setpoint has already been cancelled for this silence. */
  private cancelled = false;

  /** The cockpit is alive and flying the drone. */
  noteInput(now: number): void {
    this.lastInputAt = now;
    this.cancelled = false;
  }

  /** The link that was flying the drone is gone; say nothing until the cockpit speaks again. */
  reset(): void {
    this.lastInputAt = null;
    this.cancelled = false;
  }

  /** The stick input to send on this tick, or null to send nothing. */
  next(now: number, airborne: boolean): RcInput | null {
    if (!airborne || this.cancelled || this.lastInputAt === null) return null;
    if (now - this.lastInputAt <= RC_WATCHDOG_MS) return null;
    this.cancelled = true;
    return HOVER;
  }
}
