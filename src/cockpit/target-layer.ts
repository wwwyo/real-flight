import type { DetectedMarker } from "./detector";
import type { SortieState } from "./sortie";

export type Box = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };
type Affine = { a: Point; b: Point; origin: Point };

const EXPLOSION_MS = 700;
/** How long a hit target flashes. */
const HIT_FLASH_MS = 150;
/**
 * A robot stays drawn this long after its marker was last found, so one blurry frame does not flash
 * the bare pattern through; it can still be shot meanwhile, since the pilot sees it.
 */
export const TRACK_GRACE_MS = 200;

/**
 * A target is shown as an enemy robot, in sprite units where the detected marker spans (100,130)–(200,230).
 * The torso covers the marker with its white quiet zone plus a margin, so no black-and-white
 * pattern shows around the robot even when the corners jitter.
 */
const SPRITE = { x: 34, y: 0, width: 232, height: 340 };
const MARKER_ORIGIN = { x: 100, y: 130 };
const MARKER_SPAN = 100;
/** Rasterized at twice the sprite size so close-up robots stay sharp. */
const BAKE_SCALE = 2;
/** A wreck hangs tilted around its chest; small enough that the torso still hides the marker. */
const WRECK_PIVOT = { x: 150, y: 180 };
const WRECK_TILT = 0.1;

const ROBOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SPRITE.x} ${SPRITE.y} ${SPRITE.width} ${SPRITE.height}">
  <defs>
    <radialGradient id="flame" cx="0.5" cy="0.2" r="0.8">
      <stop offset="0" stop-color="#fff6c8"/><stop offset="0.45" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#ff4d4d"/><stop offset="1" stop-color="#7a0010"/>
    </radialGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5d687c"/><stop offset="1" stop-color="#2a303c"/>
    </linearGradient>
  </defs>
  <g stroke="#0d0f14" stroke-width="4" stroke-linejoin="round">
    <ellipse cx="117" cy="314" rx="15" ry="24" fill="url(#flame)" stroke="none"/>
    <ellipse cx="183" cy="314" rx="15" ry="24" fill="url(#flame)" stroke="none"/>
    <path d="M98 240 h40 l-4 56 h-32 z M162 240 h40 l-4 56 h-32 z" fill="#3a4250"/>
    <path d="M42 150 h34 v80 l-7 24 h-20 l-7 -24 z M224 150 h34 v80 l-7 24 h-20 l-7 -24 z" fill="#3a4250"/>
    <path d="M52 248 h14 v20 h-14 z M234 248 h14 v20 h-14 z" fill="#1b1f27"/>
    <path d="M70 100 H230 L244 170 L222 264 H78 L56 170 Z" fill="url(#steel)"/>
    <path d="M38 130 Q40 94 76 92 L96 104 L92 158 L44 162 Z M262 130 Q260 94 224 92 L204 104 L208 158 L256 162 Z" fill="#a8323a"/>
    <path d="M84 118 H216 M88 238 H212 M150 118 V150 M150 210 V238" fill="none" stroke="#1b1f27" stroke-width="3"/>
    <circle cx="150" cy="180" r="26" fill="url(#glow)"/>
    <path d="M100 196 h18 M100 208 h18 M182 196 h18 M182 208 h18" stroke="#ffb347" stroke-width="4"/>
    <rect x="134" y="92" width="32" height="14" fill="#1b1f27"/>
    <path d="M114 46 Q150 30 186 46 L190 96 H110 Z" fill="url(#steel)"/>
    <path d="M150 38 L142 8 L150 2 L158 8 Z" fill="#a8323a"/>
    <rect x="118" y="62" width="64" height="16" rx="6" fill="#120408"/>
    <circle cx="150" cy="70" r="8" fill="url(#glow)" stroke="none"/>
  </g>
</svg>`;

/** The robot's torso in sprite units, the part a shot has to land on. */
const TORSO: readonly Point[] = [
  { x: 70, y: 100 },
  { x: 230, y: 100 },
  { x: 244, y: 170 },
  { x: 222, y: 264 },
  { x: 78, y: 264 },
  { x: 56, y: 170 },
];

/** Maps sprite units onto the marker's plane, so the robot follows its tilt and distance. */
function spriteAffine(marker: DetectedMarker): Affine {
  const [c0, c1, , c3] = marker.corners as [Point, Point, Point, Point];
  const a = { x: (c1.x - c0.x) / MARKER_SPAN, y: (c1.y - c0.y) / MARKER_SPAN };
  const b = { x: (c3.x - c0.x) / MARKER_SPAN, y: (c3.y - c0.y) / MARKER_SPAN };
  return {
    a,
    b,
    origin: {
      x: c0.x - MARKER_ORIGIN.x * a.x - MARKER_ORIGIN.y * b.x,
      y: c0.y - MARKER_ORIGIN.x * a.y - MARKER_ORIGIN.y * b.y,
    },
  };
}

function toScreen({ a, b, origin }: Affine, u: number, v: number): Point {
  return { x: origin.x + u * a.x + v * b.x, y: origin.y + u * a.y + v * b.y };
}

/** Whether a screen point lies on the torso of the robot drawn over the marker. */
export function onTorso(marker: DetectedMarker, point: Point): boolean {
  const { a, b, origin } = spriteAffine(marker);
  const det = a.x * b.y - a.y * b.x;
  if (Math.abs(det) < 1e-9) return false;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const u = (dx * b.y - dy * b.x) / det;
  const v = (a.x * dy - a.y * dx) / det;
  let inside = false;
  for (let i = 0, j = TORSO.length - 1; i < TORSO.length; j = i++) {
    const p = TORSO[i]!;
    const q = TORSO[j]!;
    if (p.y > v !== q.y > v && u < ((q.x - p.x) * (v - p.y)) / (q.y - p.y) + p.x) inside = !inside;
  }
  return inside;
}

/** The screen box around the robot drawn on a marker, for placing its HUD label. */
export function targetBounds(marker: DetectedMarker): Box {
  const affine = spriteAffine(marker);
  const right = SPRITE.x + SPRITE.width;
  const bottom = SPRITE.y + SPRITE.height;
  const corners = [
    toScreen(affine, SPRITE.x, SPRITE.y),
    toScreen(affine, right, SPRITE.y),
    toScreen(affine, SPRITE.x, bottom),
    toScreen(affine, right, bottom),
  ];
  return {
    left: Math.min(...corners.map((p) => p.x)),
    top: Math.min(...corners.map((p) => p.y)),
    right: Math.max(...corners.map((p) => p.x)),
    bottom: Math.max(...corners.map((p) => p.y)),
  };
}

/**
 * Draws each target in the view as an enemy robot over its marker. A robot stays where its marker was
 * last seen for a short while, because ArUco misses markers on blurry frames and the bare
 * pattern would flash through.
 */
export class TargetLayer {
  /** Rasterized once: drawing the SVG or a canvas filter every frame is costly on the Quest. */
  private sprites: { alive: OffscreenCanvas; wreck: OffscreenCanvas } | null = null;
  private lastSeen = new Map<number, { marker: DetectedMarker; at: number }>();
  private explosions = new Map<number, { at: number; center: Point; size: number }>();

  constructor() {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ROBOT_SVG)}`;
    void image.decode().then(() => {
      this.sprites = { alive: bake(image, "none"), wreck: bake(image, "grayscale(1) brightness(0.45)") };
    });
  }

  /** Returns the markers to draw this frame: the ones detected now and the ones just missed. */
  track(markers: DetectedMarker[], now: number): DetectedMarker[] {
    for (const marker of markers) this.lastSeen.set(marker.id, { marker, at: now });
    for (const [id, seen] of this.lastSeen) {
      if (now - seen.at > TRACK_GRACE_MS) this.lastSeen.delete(id);
    }
    return [...this.lastSeen.values()].map((seen) => seen.marker);
  }

  explode(id: number, now: number): void {
    const marker = this.lastSeen.get(id)?.marker;
    if (!marker) return;
    const { left, top, right, bottom } = targetBounds(marker);
    this.explosions.set(id, {
      at: now,
      center: { x: (left + right) / 2, y: (top + bottom) / 2 },
      size: Math.max(right - left, bottom - top),
    });
  }

  draw(ctx: CanvasRenderingContext2D, markers: DetectedMarker[], sortie: SortieState, now: number): void {
    if (!this.sprites) return;
    for (const marker of markers) {
      const down = sortie.shotDown.includes(marker.id);
      const { a, b, origin } = spriteAffine(marker);
      ctx.save();
      ctx.setTransform(a.x, a.y, b.x, b.y, origin.x, origin.y);
      if (down) {
        ctx.translate(WRECK_PIVOT.x, WRECK_PIVOT.y);
        ctx.rotate(WRECK_TILT);
        ctx.translate(-WRECK_PIVOT.x, -WRECK_PIVOT.y);
      }
      ctx.drawImage(down ? this.sprites.wreck : this.sprites.alive, SPRITE.x, SPRITE.y, SPRITE.width, SPRITE.height);
      const shot = sortie.lastShot;
      if (!down && shot?.hit === marker.id && now - shot.at < HIT_FLASH_MS) {
        ctx.globalAlpha = 0.6 * (1 - (now - shot.at) / HIT_FLASH_MS);
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(this.sprites.alive, SPRITE.x, SPRITE.y, SPRITE.width, SPRITE.height);
      }
      ctx.restore();
    }
    for (const [id, explosion] of this.explosions) {
      const t = (now - explosion.at) / EXPLOSION_MS;
      if (t >= 1) {
        this.explosions.delete(id);
        continue;
      }
      drawExplosion(ctx, explosion.center, explosion.size, t);
    }
  }
}

function bake(image: HTMLImageElement, filter: string): OffscreenCanvas {
  const canvas = new OffscreenCanvas(SPRITE.width * BAKE_SCALE, SPRITE.height * BAKE_SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.filter = filter;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A fireball that swells and fades, with a shock ring running ahead of it; `t` runs 0→1. */
function drawExplosion(ctx: CanvasRenderingContext2D, center: Point, size: number, t: number): void {
  ctx.save();
  const radius = size * (0.25 + 0.55 * Math.sqrt(t));
  const fireball = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
  fireball.addColorStop(0, `rgba(255, 250, 220, ${1 - t})`);
  fireball.addColorStop(0.35, `rgba(255, 180, 70, ${0.95 * (1 - t)})`);
  fireball.addColorStop(0.75, `rgba(230, 70, 30, ${0.7 * (1 - t)})`);
  fireball.addColorStop(1, "rgba(60, 20, 10, 0)");
  ctx.fillStyle = fireball;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 230, 180, ${0.45 * (1 - t) ** 2})`;
  ctx.lineWidth = Math.max(1, size * 0.015 * (1 - t));
  ctx.beginPath();
  ctx.arc(center.x, center.y, size * (0.3 + 0.9 * t), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
