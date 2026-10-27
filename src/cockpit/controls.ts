import type { Command, RcInput } from "../shared/protocol";

/** `fire` is true while the trigger is held; the sortie limits how often that shoots. */
export type ControlFrame = { rc: RcInput; commands: Command[]; fire: boolean };

const DEADZONE = 0.12;
/**
 * A key is all or nothing, and full yaw spins the whole view past the target before the delayed video
 * shows it; sticks keep their full range.
 */
const KEY_YAW = 0.4;
/** When several buttons are down, only the safest newly pressed command is sent. */
const COMMAND_PRIORITY: readonly Command[] = ["emergency", "land", "takeoff"];
// Touch controller (xr-standard mapping): buttons[0] is the index trigger, buttons[4] is A on the right
// hand and X on the left, buttons[5] is B / Y.
const TOUCH_TRIGGER = 0;
const TOUCH_A_X = 4;
const TOUCH_B_Y = 5;
// Standard-mapping gamepads (e.g. Xbox) for desk testing.
const PAD_A = 0;
const PAD_B = 1;
const PAD_X = 2;
const PAD_RT = 7;

/**
 * Reads the pilot's input (Mode 2: left stick = throttle + yaw, right stick = pitch + roll)
 * from Touch controllers in WebXR, a standard gamepad, or the keyboard.
 */
export class Controls {
  private keys = new Set<string>();
  private pressed = new Set<Command>();

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (!event.repeat) this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => this.keys.clear());
    // The Quest is flown with Touch controllers, and a focused field could bring up its keyboard.
    if (!navigator.userAgent.includes("OculusBrowser")) keepKeysFromExtensions();
  }

  /** Samples input once per frame; a command fires on the press, not while held. */
  read(xrSources?: Iterable<XRInputSource>): ControlFrame {
    const sticks = { lx: 0, ly: 0, rx: 0, ry: 0 };
    const buttons = new Set<Command>();
    let fire = false;

    if (xrSources) {
      for (const source of xrSources) {
        const pad = source.gamepad;
        if (!pad) continue;
        const [x = 0, y = 0] = [pad.axes[2], pad.axes[3]];
        if (source.handedness === "left") {
          [sticks.lx, sticks.ly] = [x, y];
          if (pad.buttons[TOUCH_A_X]?.pressed) buttons.add("emergency");
        } else if (source.handedness === "right") {
          [sticks.rx, sticks.ry] = [x, y];
          if (pad.buttons[TOUCH_TRIGGER]?.pressed) fire = true;
          if (pad.buttons[TOUCH_A_X]?.pressed) buttons.add("takeoff");
          if (pad.buttons[TOUCH_B_Y]?.pressed) buttons.add("land");
        }
      }
    } else {
      for (const pad of navigator.getGamepads()) {
        if (!pad || pad.mapping !== "standard") continue;
        [sticks.lx, sticks.ly, sticks.rx, sticks.ry] = pad.axes as [number, number, number, number];
        if (pad.buttons[PAD_A]?.pressed) buttons.add("takeoff");
        if (pad.buttons[PAD_B]?.pressed) buttons.add("land");
        if (pad.buttons[PAD_X]?.pressed) buttons.add("emergency");
        if (pad.buttons[PAD_RT]?.pressed) fire = true;
      }
    }

    const key = (code: string) => (this.keys.has(code) ? 1 : 0);
    sticks.lx += (key("KeyD") - key("KeyA")) * KEY_YAW;
    sticks.ly += key("KeyS") - key("KeyW");
    sticks.rx += key("ArrowRight") - key("ArrowLeft");
    sticks.ry += key("ArrowDown") - key("ArrowUp");
    if (this.keys.has("KeyT")) buttons.add("takeoff");
    if (this.keys.has("KeyL")) buttons.add("land");
    if (this.keys.has("Space")) buttons.add("emergency");
    if (this.keys.has("KeyF")) fire = true;

    const fresh = COMMAND_PRIORITY.find((command) => buttons.has(command) && !this.pressed.has(command));
    // Holding emergency or land must never be undone by a take-off pressed at the same time.
    const blocked = fresh === "takeoff" && (buttons.has("emergency") || buttons.has("land"));
    const commands = fresh && !blocked ? [fresh] : [];
    this.pressed = buttons;

    return {
      rc: {
        leftRight: toRc(sticks.rx),
        forwardBack: toRc(-sticks.ry),
        upDown: toRc(-sticks.ly),
        yaw: toRc(sticks.lx),
      },
      commands,
      fire,
    };
  }
}

/**
 * Keyboard extensions such as Vimium take letter keys (T opens a tab) before the page sees them, but
 * leave keys alone while an editable element has focus. A hidden textarea holds focus so the keys reach
 * the cockpit. Keys are read by `event.code`, so text the IME composes there does not matter; it is
 * cleared as it arrives.
 */
function keepKeysFromExtensions(): void {
  const sink = document.createElement("textarea");
  sink.setAttribute("aria-hidden", "true");
  sink.tabIndex = -1;
  sink.inputMode = "none";
  sink.autocomplete = "off";
  sink.spellcheck = false;
  Object.assign(sink.style, { position: "fixed", left: "0", top: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.append(sink);
  const clear = () => (sink.value = "");
  sink.addEventListener("input", clear);
  sink.addEventListener("compositionend", clear);
  // Clicking a button (Enter VR) moves focus away; take it back once the click has happened.
  const refocus = () => setTimeout(() => sink.focus({ preventScroll: true }), 0);
  sink.addEventListener("blur", refocus);
  window.addEventListener("focus", refocus);
  sink.focus({ preventScroll: true });
}

export const COMMAND_LABELS: Record<Command, string> = { takeoff: "離陸", land: "着陸", emergency: "緊急停止" };

/** Stick input in the pilot's words, e.g. "右旋回 40% / 前進 60%"; values are percent of the drone's top speed. */
export function describeRc({ leftRight, forwardBack, upDown, yaw }: RcInput): string {
  const parts = [
    [yaw, "右旋回", "左旋回"],
    [forwardBack, "前進", "後退"],
    [leftRight, "右移動", "左移動"],
    [upDown, "上昇", "下降"],
  ] as const;
  const moving = parts.filter(([value]) => value !== 0);
  if (moving.length === 0) return "ホバリング";
  return moving.map(([value, plus, minus]) => `${value > 0 ? plus : minus} ${Math.abs(value)}%`).join(" / ");
}

function toRc(axis: number): number {
  const clamped = Math.max(-1, Math.min(1, axis));
  if (Math.abs(clamped) < DEADZONE) return 0;
  return Math.round(clamped * 100);
}
