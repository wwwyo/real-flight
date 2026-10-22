import type { DetectedMarker } from "./detector";
import type { SortieState } from "./sortie";

export type Reticle = { x: number; y: number; radius: number };

export type HudInfo = {
  sortie: SortieState;
  markers: DetectedMarker[];
  reticle: Reticle;
  totalTargets: number;
  battery: number | null;
  recording: boolean;
  link: string;
  stats: string;
};

const GREEN = "#7dff9a";
const AMBER = "#ffc857";
const RED = "#ff5a5a";

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
  ctx.font = `600 ${22 * unit}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline = "top";

  for (const marker of hud.markers) {
    const down = sortie.shotDown.includes(marker.id);
    if (!down && !sortie.remaining.includes(marker.id)) continue;
    ctx.strokeStyle = down ? RED : AMBER;
    ctx.beginPath();
    marker.corners.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    const top = Math.min(...marker.corners.map((c) => c.y));
    ctx.fillText(down ? "DOWN" : `TGT ${marker.id}`, marker.center.x - 30 * unit, top - 28 * unit);
  }

  const locking = sortie.lock !== null;
  ctx.strokeStyle = locking ? AMBER : GREEN;
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
  const remaining = `TGT ${sortie.remaining.length}/${hud.totalTargets}`;
  ctx.fillText(remaining, pad, pad);
  ctx.fillText(`T+${formatTime(sortie.elapsedMs)}`, pad, pad + line);
  ctx.fillStyle = hud.battery !== null && hud.battery < 20 ? RED : GREEN;
  ctx.fillText(`BAT ${hud.battery ?? "--"}%`, pad, pad + line * 2);

  ctx.textAlign = "right";
  ctx.fillStyle = GREEN;
  ctx.fillText(hud.link, width - pad, pad);
  ctx.font = `${16 * unit}px ui-monospace, Menlo, monospace`;
  ctx.fillText(hud.stats, width - pad, pad + line);
  if (hud.recording) {
    ctx.fillStyle = RED;
    ctx.font = `600 ${22 * unit}px ui-monospace, Menlo, monospace`;
    ctx.fillText("● REC", width - pad, pad + line * 2);
  }

  ctx.textAlign = "center";
  ctx.font = `600 ${28 * unit}px ui-monospace, Menlo, monospace`;
  const banner = bannerFor(sortie);
  if (banner) {
    ctx.fillStyle = sortie.phase === "complete" ? AMBER : GREEN;
    ctx.fillText(banner, width / 2, height - 80 * unit);
  }
  ctx.restore();
}

function bannerFor(sortie: SortieState): string | null {
  switch (sortie.phase) {
    case "ready":
      return "READY — TAKE OFF (A / T)";
    case "complete":
      return `SORTIE COMPLETE  ${formatTime(sortie.elapsedMs)}`;
    case "landed":
      return `LANDED  ${sortie.shotDown.length} DOWN  ${formatTime(sortie.elapsedMs)}`;
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
