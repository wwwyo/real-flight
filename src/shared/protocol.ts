/**
 * Messages on the cockpit ⇄ server WebSocket. Text frames carry these as JSON;
 * binary frames from the server carry one H.264 access unit (Annex B) each.
 */

/** Stick input, each axis in -100..100 (Tello SDK `rc` ranges). */
export type RcInput = {
  leftRight: number;
  forwardBack: number;
  upDown: number;
  yaw: number;
};

export type CockpitMessage =
  | ({ type: "rc" } & RcInput)
  | { type: "takeoff" }
  | { type: "land" }
  | { type: "emergency" };

/** One-shot commands, i.e. every cockpit message except stick input. */
export type Command = Exclude<CockpitMessage["type"], "rc">;

export type ServerMessage = {
  type: "status";
  drone: string;
  /** Percent, or null until the drone reports it. */
  battery: number | null;
};

export const WS_PATH = "/ws";
export const RECORDINGS_PATH = "/recordings";
/** Server pub/sub topics every cockpit subscribes to. */
export const Topic = { Video: "video", Status: "status" } as const;
