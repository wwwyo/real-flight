import { describe, expect, test } from "bun:test";
import type { DetectedMarker } from "./detector";
import { onTorso } from "./target-layer";

/** A marker seen face-on, `size` px wide with its top-left corner at (x, y). */
function marker(x: number, y: number, size: number): DetectedMarker {
  const corners = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
  return { id: 1, corners, center: { x: x + size / 2, y: y + size / 2 } };
}

describe("onTorso", () => {
  test("the marker itself, as the robot's chest, is on the torso", () => {
    const m = marker(400, 300, 100);
    expect(onTorso(m, { x: 450, y: 350 })).toBe(true);
    expect(onTorso(m, { x: 401, y: 301 })).toBe(true);
  });

  test("the head, the arms and the sky around are not", () => {
    // Sprite units equal pixels for a 100 px marker whose top-left sits at sprite (100, 130).
    const m = marker(100, 130, 100);
    expect(onTorso(m, { x: 150, y: 60 })).toBe(false);
    expect(onTorso(m, { x: 50, y: 200 })).toBe(false);
    expect(onTorso(m, { x: 150, y: 290 })).toBe(false);
    expect(onTorso(m, { x: 150, y: 110 })).toBe(true);
  });

  test("follows the marker's distance and tilt", () => {
    const far = marker(400, 300, 20);
    expect(onTorso(far, { x: 410, y: 310 })).toBe(true);
    expect(onTorso(far, { x: 450, y: 310 })).toBe(false);

    // Rotated a quarter turn: the torso extends sideways from the marker.
    const tilted: DetectedMarker = {
      id: 1,
      corners: [
        { x: 500, y: 300 },
        { x: 500, y: 400 },
        { x: 400, y: 400 },
        { x: 400, y: 300 },
      ],
      center: { x: 450, y: 350 },
    };
    expect(onTorso(tilted, { x: 450, y: 350 })).toBe(true);
    expect(onTorso(tilted, { x: 450, y: 250 })).toBe(false);
  });
});
