import type { Command, RcInput } from "../shared/protocol";

export type ControlFrame = { rc: RcInput; commands: Command[] };

const DEADZONE = 0.12;
/** When several buttons are down, only the safest newly pressed command is sent. */
const COMMAND_PRIORITY: readonly Command[] = ["emergency", "land", "takeoff"];
// Touch controller: buttons[4] is A on the right hand and X on the left, buttons[5] is B / Y.
const TOUCH_A_X = 4;
const TOUCH_B_Y = 5;
// Standard-mapping gamepads (e.g. Xbox) for desk testing.
const PAD_A = 0;
const PAD_B = 1;
const PAD_X = 2;

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
  }

  /** Samples input once per frame; a command fires on the press, not while held. */
  read(xrSources?: Iterable<XRInputSource>): ControlFrame {
    const sticks = { lx: 0, ly: 0, rx: 0, ry: 0 };
    const buttons = new Set<Command>();

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
      }
    }

    const key = (code: string) => (this.keys.has(code) ? 1 : 0);
    sticks.lx += key("KeyD") - key("KeyA");
    sticks.ly += key("KeyS") - key("KeyW");
    sticks.rx += key("ArrowRight") - key("ArrowLeft");
    sticks.ry += key("ArrowDown") - key("ArrowUp");
    if (this.keys.has("KeyT")) buttons.add("takeoff");
    if (this.keys.has("KeyL")) buttons.add("land");
    if (this.keys.has("Space")) buttons.add("emergency");

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
    };
  }
}

function toRc(axis: number): number {
  const clamped = Math.max(-1, Math.min(1, axis));
  if (Math.abs(clamped) < DEADZONE) return 0;
  return Math.round(clamped * 100);
}
