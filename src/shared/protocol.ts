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

const COMMANDS: readonly string[] = ["takeoff", "land", "emergency"] satisfies Command[];
const RC_AXES = ["leftRight", "forwardBack", "upDown", "yaw"] as const;

/**
 * Reads a cockpit message from untrusted WebSocket text. Returns null for anything malformed;
 * stick values are clamped to whole numbers in -100..100 before they can reach a drone.
 */
export function parseCockpitMessage(text: string): CockpitMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || !("type" in value)) return null;
  const { type } = value;
  if (typeof type === "string" && COMMANDS.includes(type)) return { type: type as Command };
  if (type !== "rc") return null;
  const rc = value as Record<string, unknown>;
  if (!RC_AXES.every((axis) => typeof rc[axis] === "number" && Number.isFinite(rc[axis]))) return null;
  const axis = (name: (typeof RC_AXES)[number]) => Math.max(-100, Math.min(100, Math.round(rc[name] as number)));
  return { type: "rc", leftRight: axis("leftRight"), forwardBack: axis("forwardBack"), upDown: axis("upDown"), yaw: axis("yaw") };
}

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
