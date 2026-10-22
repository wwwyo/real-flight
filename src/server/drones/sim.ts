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
const MARKER_PX = 90;
/** World pixels per frame at full stick. */
const MAX_SPEED = 24;
const HORIZON = 1300;

const DICTIONARY = new AR.Dictionary(MARKER_DICTIONARY);

type Pose = { x: number; y: number; zoom: number };

/**
 * A stand-in drone for developing without a Tello: it flies a camera over a flat landscape with
 * the target markers in it and encodes the view to H.264 with ffmpeg, like a real camera stream.
 * Pixels are RGBA packed in a Uint32 (little-endian, so R is the low byte), one write per pixel.
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
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${VIEW_W}x${VIEW_H}`, "-r", String(FPS), "-i", "pipe:0",
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
    this.encoder?.stdin.write(new Uint8Array(this.renderView().buffer));
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

  private renderView(): Uint32Array {
    const out = new Uint32Array(VIEW_W * VIEW_H);
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
  private drawMovingTarget(out: Uint32Array): void {
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

/**
 * Sky, clouds, two mountain ridges and fields. A plain backdrop gave no sense of moving, so the
 * scenery has detail at every height the camera can pan to.
 */
function renderWorld(): Uint32Array {
  const world = new Uint32Array(WORLD_W * WORLD_H);
  const random = seededRandom(7);
  const farRidge = ridge(HORIZON - 260, 140, random);
  const nearRidge = ridge(HORIZON - 120, 90, random);
  for (let y = 0; y < WORLD_H; y++) {
    const t = y / HORIZON;
    const sky = rgb(40 + 120 * t, 90 + 110 * t, 170 + 70 * t);
    for (let x = 0; x < WORLD_W; x++) {
      let color = sky;
      if (y >= HORIZON) {
        const patch = hash(Math.floor(x / 220), Math.floor((y - HORIZON) / 60));
        const shade = 0.75 + 0.25 * patch + 0.15 * ((y - HORIZON) / (WORLD_H - HORIZON));
        color = rgb(70 * shade, (patch > 0.8 ? 120 : 140) * shade, 60 * shade);
      } else if (y >= nearRidge[x]!) {
        const shade = 0.8 + 0.2 * hash(Math.floor(x / 40), Math.floor(y / 40));
        color = rgb(50 * shade, 95 * shade, 70 * shade);
      } else if (y >= farRidge[x]!) {
        color = rgb(110, 130, 165);
      }
      world[y * WORLD_W + x] = color;
    }
  }
  for (let i = 0; i < 40; i++) {
    const cx = random() * WORLD_W;
    const cy = 80 + random() * (HORIZON - 500);
    for (let puff = 0; puff < 6; puff++) {
      cloudPuff(world, cx + (random() - 0.5) * 260, cy + (random() - 0.5) * 50, 70 + random() * 90, 30 + random() * 30);
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

/** The marker with a one-cell white quiet zone, as a MARKER_PX square bitmap. */
function markerBitmap(id: number): Uint32Array {
  const code = DICTIONARY.codeList[id]!;
  const bits = DICTIONARY.markSize - 2;
  const cells = bits + 4;
  const bitmap = new Uint32Array(MARKER_PX * MARKER_PX);
  for (let r = 0; r < MARKER_PX; r++) {
    const cy = Math.floor((r / MARKER_PX) * cells);
    for (let c = 0; c < MARKER_PX; c++) {
      const cx = Math.floor((c / MARKER_PX) * cells);
      const quietZone = cy === 0 || cx === 0 || cy === cells - 1 || cx === cells - 1;
      const border = cy === 1 || cx === 1 || cy === cells - 2 || cx === cells - 2;
      const white = quietZone || (!border && code[(cy - 2) * bits + (cx - 2)] === "1");
      bitmap[r * MARKER_PX + c] = white ? rgb(255, 255, 255) : rgb(0, 0, 0);
    }
  }
  return bitmap;
}

/** Halves every channel; the mask keeps each channel's top bit from spilling into the next. */
function dim(frame: Uint32Array): void {
  for (let i = 0; i < frame.length; i++) frame[i] = ((frame[i]! >>> 1) & 0x7f7f7f7f) | 0xff000000;
}

function rgb(r: number, g: number, b: number): number {
  return ((0xff << 24) | (clamp(Math.round(b), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(r), 0, 255)) >>> 0;
}

/** Heights of a mountain ridge along the world, from a few overlapping sine waves. */
function ridge(base: number, amplitude: number, random: () => number): Float32Array {
  const waves = Array.from({ length: 4 }, (_, i) => ({
    length: 1600 / (i + 1) ** 1.6,
    phase: random() * Math.PI * 2,
    weight: 1 / (i + 1),
  }));
  const heights = new Float32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    heights[x] = base - amplitude * waves.reduce((sum, w) => sum + w.weight * Math.sin((x / w.length) * Math.PI * 2 + w.phase), 0);
  }
  return heights;
}

/** Blends a soft white ellipse into the sky. */
function cloudPuff(world: Uint32Array, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(WORLD_H, cy + ry); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(WORLD_W, cx + rx); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      const alpha = 0.85 * (1 - d * d);
      const i = y * WORLD_W + x;
      const p = world[i]!;
      world[i] = rgb(
        (p & 0xff) + (255 - (p & 0xff)) * alpha,
        ((p >>> 8) & 0xff) + (255 - ((p >>> 8) & 0xff)) * alpha,
        ((p >>> 16) & 0xff) + (255 - ((p >>> 16) & 0xff)) * alpha,
      );
    }
  }
}

/** A fixed pseudo-random sequence, so the scenery is the same on every run. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable value in [0, 1) for a grid cell, for patchy textures. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
