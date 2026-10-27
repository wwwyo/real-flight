import type { DetectedMarker } from "./detector";
import { targetBounds, type Box } from "./target-layer";
import { HITS_TO_SHOOT_DOWN, type SortieState } from "./sortie";

export type Reticle = { x: number; y: number; radius: number };

export type HudInfo = {
  sortie: SortieState;
  markers: DetectedMarker[];
  reticle: Reticle;
  /** Whether the reticle's centre is on a live target, i.e. a shot now would hit. */
  aimed: boolean;
  battery: number | null;
  recording: boolean;
  linkUp: boolean;
  warning: string | null;
  /** What the cockpit sent to the drone, bottom right, so the pilot can tell input from drone behavior. */
  sent: string[];
  /** Decode and detection numbers for tuning; null hides them. */
  stats: { fps: number; decodeQueue: number; detectMs: number } | null;
};

const GREEN = "#7dff9a";
const AMBER = "#ffc857";
const RED = "#ff5a5a";
/** How long the muzzle flash and the hit marker stay on screen after a shot. */
const SHOT_FX_MS = 120;
const HIT_MARKER_MS = 250;

function font(px: number, unit: number, weight = 600): string {
  return `${weight} ${px * unit}px ui-monospace, Menlo, "Hiragino Sans", monospace`;
}

/**
 * Draws what belongs to the view itself over the video already on the canvas: target brackets, the
 * reticle and shot effects. In XR these sit at the video's depth, so the eyes converge on the target
 * and the reticle together, as a collimated gunsight would.
 */
export function drawSight(ctx: CanvasRenderingContext2D, hud: HudInfo, now: number): void {
  const { sortie, reticle } = hud;
  const unit = ctx.canvas.height / 720;
  ctx.save();
  ctx.lineWidth = 3 * unit;
  ctx.font = font(22, unit);
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const marker of hud.markers) {
    const down = sortie.shotDown.includes(marker.id);
    const box = targetBounds(marker);
    ctx.strokeStyle = ctx.fillStyle = down ? RED : AMBER;
    drawBrackets(ctx, box, 18 * unit);
    const left = HITS_TO_SHOOT_DOWN - (sortie.hits[marker.id] ?? 0);
    const label = down ? "DOWN" : `TGT ${marker.id} ${"■".repeat(left)}${"□".repeat(HITS_TO_SHOOT_DOWN - left)}`;
    text(ctx, label, (box.left + box.right) / 2, box.top - 6 * unit);
  }

  ctx.strokeStyle = hud.aimed ? RED : GREEN;
  ctx.beginPath();
  ctx.arc(reticle.x, reticle.y, reticle.radius, 0, Math.PI * 2);
  ctx.moveTo(reticle.x - 12 * unit, reticle.y);
  ctx.lineTo(reticle.x + 12 * unit, reticle.y);
  ctx.moveTo(reticle.x, reticle.y - 12 * unit);
  ctx.lineTo(reticle.x, reticle.y + 12 * unit);
  ctx.stroke();
  drawShot(ctx, sortie.lastShot, reticle, unit, now);
  ctx.restore();
}

/**
 * Draws the readouts around the edge on a transparent canvas. In XR they float nearer than the
 * video, which is what gives the flat camera picture depth.
 */
export function drawInstruments(ctx: CanvasRenderingContext2D, hud: HudInfo): void {
  const { width, height } = ctx.canvas;
  const { sortie } = hud;
  const unit = height / 720;
  ctx.save();
  ctx.lineWidth = 3 * unit;
  ctx.font = font(22, unit);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillStyle = GREEN;
  const pad = 24 * unit;
  const line = 30 * unit;
  const total = sortie.remaining.length + sortie.shotDown.length;
  text(ctx, `TGT ${sortie.remaining.length}/${total}`, pad, pad);
  text(ctx, `T+${formatTime(sortie.elapsedMs)}`, pad, pad + line);
  ctx.fillStyle = hud.battery !== null && hud.battery < 20 ? RED : GREEN;
  text(ctx, `BAT ${hud.battery ?? "--"}%`, pad, pad + line * 2);

  ctx.textAlign = "right";
  ctx.fillStyle = GREEN;
  text(ctx, hud.linkUp ? "LINK OK" : "LINK LOST", width - pad, pad);
  if (hud.stats) {
    const { fps, decodeQueue, detectMs } = hud.stats;
    ctx.font = font(16, unit, 400);
    text(ctx, `${fps}fps q${decodeQueue} det ${detectMs.toFixed(0)}ms`, width - pad, pad + line);
  }
  if (hud.recording) {
    ctx.fillStyle = RED;
    ctx.font = font(22, unit);
    text(ctx, "● REC", width - pad, pad + line * 2);
  }

  ctx.fillStyle = GREEN;
  ctx.font = font(18, unit, 500);
  ctx.textBaseline = "bottom";
  const sentLine = 24 * unit;
  hud.sent.forEach((sent, i) => text(ctx, sent, width - pad, height - pad - (hud.sent.length - 1 - i) * sentLine));
  ctx.textBaseline = "top";

  ctx.textAlign = "center";
  if (hud.warning) {
    ctx.fillStyle = RED;
    ctx.font = font(30, unit);
    text(ctx, hud.warning, width / 2, height - 130 * unit);
  }
  ctx.font = font(28, unit);
  const banner = bannerFor(sortie);
  if (banner) {
    ctx.fillStyle = sortie.phase === "complete" ? AMBER : GREEN;
    text(ctx, banner, width / 2, height - 80 * unit);
  }
  ctx.restore();
}

/** Fills text over a dark outline, so it stays readable over clouds and bright sky. */
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.lineWidth = ctx.lineWidth * 1.5;
  ctx.lineJoin = "round";
  ctx.strokeText(value, x, y);
  ctx.restore();
  ctx.fillText(value, x, y);
}

/** Corner brackets around a target, so the robot itself stays unobstructed. */
function drawBrackets(
  ctx: CanvasRenderingContext2D,
  { left, top, right, bottom }: Box,
  arm: number,
): void {
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [left, top, 1, 1],
    [right, top, -1, 1],
    [left, bottom, 1, -1],
    [right, bottom, -1, -1],
  ] as const) {
    ctx.moveTo(x + dx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * arm);
  }
  ctx.stroke();
}

/** A muzzle flash from the bottom corners towards the reticle, and an X on the reticle when it hit. */
function drawShot(ctx: CanvasRenderingContext2D, shot: SortieState["lastShot"], reticle: Reticle, unit: number, now: number): void {
  if (!shot) return;
  const age = now - shot.at;
  const { width, height } = ctx.canvas;
  if (age < SHOT_FX_MS) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 220, 140, ${1 - age / SHOT_FX_MS})`;
    ctx.lineWidth = 4 * unit;
    ctx.beginPath();
    for (const fromX of [width * 0.3, width * 0.7]) {
      ctx.moveTo(fromX, height);
      ctx.lineTo(reticle.x + (fromX - reticle.x) * 0.15, reticle.y + (height - reticle.y) * 0.15);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (shot.hit !== null && age < HIT_MARKER_MS) {
    const inner = 10 * unit;
    const outer = 26 * unit;
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 4 * unit;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      ctx.moveTo(reticle.x + dx * inner, reticle.y + dy * inner);
      ctx.lineTo(reticle.x + dx * outer, reticle.y + dy * outer);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function bannerFor(sortie: SortieState): string | null {
  switch (sortie.phase) {
    case "ready":
      return "A ボタン / T キーで離陸";
    case "complete":
      return `全機撃墜  ${formatTime(sortie.elapsedMs)}`;
    case "landed": {
      const rate = sortie.shots > 0 ? Math.round((sortie.shotsHit / sortie.shots) * 100) : 0;
      return `着陸  撃墜 ${sortie.shotDown.length}  命中 ${rate}%  ${formatTime(sortie.elapsedMs)}`;
    }
    case "flying":
      return null;
  }
}

function formatTime(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${totalTenths % 10}`;
}
