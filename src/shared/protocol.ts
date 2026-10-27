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

export const HOVER: RcInput = { leftRight: 0, forwardBack: 0, upDown: 0, yaw: 0 };

/** Flat values a cockpit log entry may carry. */
export type LogData = Record<string, string | number | boolean | null>;

export type CockpitMessage =
  | ({ type: "rc" } & RcInput)
  | { type: "takeoff" }
  | { type: "land" }
  | { type: "emergency" }
  /** What the cockpit saw, written to the Mac's link log so a session can be read back afterwards. */
  | { type: "log"; event: string; data: LogData };

/** One-shot drone commands: every cockpit message except stick input and logs. */
export type Command = Exclude<CockpitMessage["type"], "rc" | "log">;

const COMMANDS: readonly string[] = ["takeoff", "land", "emergency"] satisfies Command[];
const RC_AXES = ["leftRight", "forwardBack", "upDown", "yaw"] as const;
/** Keeps a page that floods the socket from filling the Mac's disk through the log. */
export const MAX_LOG_TEXT = 2048;
const LOG_EVENT = /^[a-z][a-z0-9-]{0,47}$/;

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
  if (type === "log") return text.length <= MAX_LOG_TEXT ? parseLog(value) : null;
  if (type !== "rc") return null;
  const rc = value as Record<string, unknown>;
  if (!RC_AXES.every((axis) => typeof rc[axis] === "number" && Number.isFinite(rc[axis]))) return null;
  const axis = (name: (typeof RC_AXES)[number]) => Math.max(-100, Math.min(100, Math.round(rc[name] as number)));
  return { type: "rc", leftRight: axis("leftRight"), forwardBack: axis("forwardBack"), upDown: axis("upDown"), yaw: axis("yaw") };
}

function parseLog(value: object): CockpitMessage | null {
  const { event, data } = value as Record<string, unknown>;
  if (typeof event !== "string" || !LOG_EVENT.test(event)) return null;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const flat = Object.values(data).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v));
  return flat ? { type: "log", event, data: data as LogData } : null;
}

export type ControlRole = "available" | "pilot" | "observer";

export type ServerMessage = {
  type: "status";
  drone: string;
  /** Percent, or null until the drone reports it. */
  battery: number | null;
} | { type: "control"; role: ControlRole }
  | { type: "command"; command: Command; accepted: boolean };

/** No decoded frame for this long means the pilot can no longer fly from the view. */
export const VIDEO_TIMEOUT_MS = 1000;

export const WS_PATH = "/ws";
export const RECORDINGS_PATH = "/recordings";
/** Server pub/sub topics every cockpit subscribes to. */
export const Topic = { Video: "video", Status: "status" } as const;
