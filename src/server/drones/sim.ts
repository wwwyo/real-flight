import { AR } from "js-aruco2";
import { AccessUnitSplitter } from "../../shared/h264";
import type { RcInput } from "../../shared/protocol";
import { MARKER_DICTIONARY, TARGET_IDS } from "../../shared/targets";
import { HOVER, type Drone } from "./drone";

const VIEW_W = 960;
const VIEW_H = 720;
const WORLD_W = 4000;
const WORLD_H = 1800;
const FPS = 30;
const MARKER_PX = 150;
/** World pixels per frame at full stick. */
const MAX_SPEED = 24;

const DICTIONARY = new AR.Dictionary(MARKER_DICTIONARY);

type Pose = { x: number; y: number; zoom: number };

/**
 * A stand-in drone for developing without a Tello: it flies a camera over a flat world with the
 * target markers on it and encodes the view to H.264 with ffmpeg, like a real camera stream.
 */
export class SimDrone implements Drone {
  readonly name = "sim";
  private world = renderWorld();
  private movingMarker = markerBitmap(TARGET_IDS.at(-1)!);
  private pose: Pose = { x: WORLD_W / 2, y: WORLD_H / 2 + 300, zoom: 1 };
  private velocity: RcInput = { ...HOVER };
  private input: RcInput = { ...HOVER };
  private flying = false;
  private batteryPercent = 100;
  private flownFrames = 0;
  private encoder?: Bun.Subprocess<"pipe", "pipe", "inherit">;

  async connect(): Promise<void> {
    this.encoder = Bun.spawn(
      // prettier-ignore
      [
        "ffmpeg", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${VIEW_W}x${VIEW_H}`, "-r", String(FPS), "-i", "pipe:0",
        "-vf", "format=yuv420p",
        "-c:v", "h264_videotoolbox", "-realtime", "1", "-profile:v", "baseline", "-bf", "0", "-g", String(FPS), "-b:v", "3M",
        "-f", "h264", "pipe:1",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "inherit" },
    );
    setInterval(() => this.tick(), 1000 / FPS);
  }

  rc(input: RcInput): void {
    this.input = input;
  }

  takeoff(): void {
    this.flying = true;
  }

  land(): void {
    this.flying = false;
  }

  emergency(): void {
    this.flying = false;
    this.velocity = { ...HOVER };
  }

  async *frames(): AsyncIterable<Uint8Array> {
    if (!this.encoder) throw new Error("connect() first");
    const splitter = new AccessUnitSplitter();
    for await (const chunk of this.encoder.stdout) yield* splitter.push(chunk);
  }

  battery(): number | null {
    return this.batteryPercent;
  }

  private tick(): void {
    this.move();
    this.encoder?.stdin.write(this.renderView());
    this.encoder?.stdin.flush();
  }

  private move(): void {
    const target = this.flying ? this.input : HOVER;
    // First-order lag so the view drifts like an airframe instead of snapping to the sticks.
    for (const axis of ["leftRight", "forwardBack", "upDown", "yaw"] as const) {
      this.velocity[axis] += (target[axis] - this.velocity[axis]) * 0.12;
    }
    const v = this.velocity;
    this.pose.zoom = clamp(this.pose.zoom * (1 + (v.forwardBack / 100) * 0.02), 0.5, 2.5);
    const halfW = VIEW_W / 2 / this.pose.zoom;
    const halfH = VIEW_H / 2 / this.pose.zoom;
    this.pose.x = clamp(this.pose.x + ((v.yaw + v.leftRight * 0.5) / 100) * MAX_SPEED, halfW, WORLD_W - halfW);
    this.pose.y = clamp(this.pose.y - (v.upDown / 100) * MAX_SPEED, halfH, WORLD_H - halfH);
    if (this.flying && ++this.flownFrames % (FPS * 20) === 0) {
      this.batteryPercent = Math.max(0, this.batteryPercent - 1);
    }
  }

  private renderView(): Uint8Array {
    const out = new Uint8Array(VIEW_W * VIEW_H);
    const { x, y, zoom } = this.pose;
    const columns = new Int32Array(VIEW_W);
    for (let c = 0; c < VIEW_W; c++) {
      columns[c] = clamp(Math.round(x + (c - VIEW_W / 2) / zoom), 0, WORLD_W - 1);
    }
    for (let r = 0; r < VIEW_H; r++) {
      const wy = clamp(Math.round(y + (r - VIEW_H / 2) / zoom), 0, WORLD_H - 1) * WORLD_W;
      const row = r * VIEW_W;
      for (let c = 0; c < VIEW_W; c++) out[row + c] = this.world[wy + columns[c]!]!;
    }
    this.drawMovingTarget(out);
    if (!this.flying) dim(out);
    return out;
  }

  /** The last target sweeps side to side, like one carried by a robot vacuum. */
  private drawMovingTarget(out: Uint8Array): void {
    const t = Date.now() / 1000;
    const wx = WORLD_W / 2 + Math.sin(t * 0.5) * 900;
    const wy = WORLD_H / 2 - 450;
    const { x, y, zoom } = this.pose;
    const size = Math.round(MARKER_PX * zoom);
    const left = Math.round((wx - x) * zoom + VIEW_W / 2 - size / 2);
    const top = Math.round((wy - y) * zoom + VIEW_H / 2 - size / 2);
    for (let r = Math.max(0, top); r < Math.min(VIEW_H, top + size); r++) {
      const mr = Math.floor(((r - top) / size) * MARKER_PX);
      for (let c = Math.max(0, left); c < Math.min(VIEW_W, left + size); c++) {
        const mc = Math.floor(((c - left) / size) * MARKER_PX);
        out[r * VIEW_W + c] = this.movingMarker[mr * MARKER_PX + mc]!;
      }
    }
  }
}

function renderWorld(): Uint8Array {
  const world = new Uint8Array(WORLD_W * WORLD_H);
  for (let y = 0; y < WORLD_H; y++) {
    const sky = 150 + Math.round((y / WORLD_H) * 60);
    for (let x = 0; x < WORLD_W; x++) {
      const grid = x % 200 < 3 || y % 200 < 3;
      world[y * WORLD_W + x] = grid ? 110 : sky;
    }
  }
  const placed = TARGET_IDS.slice(0, -1);
  placed.forEach((id, i) => {
    const bitmap = markerBitmap(id);
    const left = Math.round(((i + 1) / (placed.length + 1)) * WORLD_W - MARKER_PX / 2);
    const top = Math.round(WORLD_H / 2 + (i % 2 === 0 ? 150 : -50));
    for (let r = 0; r < MARKER_PX; r++) {
      world.set(bitmap.subarray(r * MARKER_PX, (r + 1) * MARKER_PX), (top + r) * WORLD_W + left);
    }
  });
  return world;
}

/** The marker with a one-cell white quiet zone, as a MARKER_PX square grayscale bitmap. */
function markerBitmap(id: number): Uint8Array {
  const code = DICTIONARY.codeList[id]!;
  const bits = DICTIONARY.markSize - 2;
  const cells = bits + 4;
  const bitmap = new Uint8Array(MARKER_PX * MARKER_PX);
  for (let r = 0; r < MARKER_PX; r++) {
    const cy = Math.floor((r / MARKER_PX) * cells);
    for (let c = 0; c < MARKER_PX; c++) {
      const cx = Math.floor((c / MARKER_PX) * cells);
      const quietZone = cy === 0 || cx === 0 || cy === cells - 1 || cx === cells - 1;
      const border = cy === 1 || cx === 1 || cy === cells - 2 || cx === cells - 2;
      const white = quietZone || (!border && code[(cy - 2) * bits + (cx - 2)] === "1");
      bitmap[r * MARKER_PX + c] = white ? 255 : 0;
    }
  }
  return bitmap;
}

function dim(frame: Uint8Array): void {
  for (let i = 0; i < frame.length; i++) frame[i] = frame[i]! >> 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
