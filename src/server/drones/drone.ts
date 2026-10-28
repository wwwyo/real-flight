import type { RcInput } from "../../shared/protocol";

/**
 * The boundary that hides one drone model. The relay and the cockpit only talk to this,
 * so adding a drone means adding one implementation under `drones/`.
 */
export interface Drone {
  readonly name: string;
  connect(): Promise<void>;
  rc(input: RcInput): void;
  takeoff(): void;
  land(): void;
  emergency(): void;
  /** The camera as H.264 access units (Annex B), one per frame. */
  frames(): AsyncIterable<Uint8Array>;
  /** Battery in percent, or null until the drone reports it. */
  battery(): number | null;
  /** Whether the drone is answering; false while it is off or out of the Mac's reach, when no input arrives. */
  linked(): boolean;
}
