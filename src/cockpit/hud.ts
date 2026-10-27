import type { DetectedMarker } from "./detector";
import { targetBounds, type Box } from "./target-layer";
import type { SortieState } from "./sortie";

export type Reticle = { x: number; y: number; radius: number };

export type HudInfo = {
  sortie: SortieState;
  markers: DetectedMarker[];
  reticle: Reticle;
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

function font(px: number, unit: number, weight = 600): string {
  return `${weight} ${px * unit}px ui-monospace, Menlo, "Hiragino Sans", monospace`;
}

export function isInReticle(point: { x: number; y: number }, reticle: Reticle): boolean {
  return Math.hypot(point.x - reticle.x, point.y - reticle.y) <= reticle.radius;
}

/** Draws the instruments over the video already on the canvas. */
export function drawHud(ctx: CanvasRenderingContext2D, hud: HudInfo): void {
  const { width, height } = ctx.canvas;
  const { sortie, reticle } = hud;
  const unit = height / 720;
  ctx.save();
  ctx.lineWidth = 3 * unit;
  ctx.font = font(22, unit);
  ctx.textBaseline = "top";

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const marker of hud.markers) {
    const down = sortie.shotDown.includes(marker.id);
    const box = targetBounds(marker);
    ctx.strokeStyle = ctx.fillStyle = down ? RED : AMBER;
    drawBrackets(ctx, box, 18 * unit);
    text(ctx, down ? "DOWN" : `TGT ${marker.id}`, (box.left + box.right) / 2, box.top - 6 * unit);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.strokeStyle = sortie.lock ? AMBER : GREEN;
  ctx.beginPath();
  ctx.arc(reticle.x, reticle.y, reticle.radius, 0, Math.PI * 2);
  ctx.moveTo(reticle.x - 12 * unit, reticle.y);
  ctx.lineTo(reticle.x + 12 * unit, reticle.y);
  ctx.moveTo(reticle.x, reticle.y - 12 * unit);
  ctx.lineTo(reticle.x, reticle.y + 12 * unit);
  ctx.stroke();
  if (sortie.lock) {
    ctx.lineWidth = 8 * unit;
    ctx.strokeStyle = sortie.lock.progress >= 1 ? RED : AMBER;
    ctx.beginPath();
    const start = -Math.PI / 2;
    ctx.arc(reticle.x, reticle.y, reticle.radius + 12 * unit, start, start + sortie.lock.progress * Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3 * unit;
  }

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

function bannerFor(sortie: SortieState): string | null {
  switch (sortie.phase) {
    case "ready":
      return "A ボタン / T キーで離陸";
    case "complete":
      return `全機撃墜  ${formatTime(sortie.elapsedMs)}`;
    case "landed":
      return `着陸  撃墜 ${sortie.shotDown.length}  ${formatTime(sortie.elapsedMs)}`;
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
