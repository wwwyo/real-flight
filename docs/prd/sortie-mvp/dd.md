# Sortie MVP design

Design for [prd.md](prd.md), which holds the requirements. Numbers taken from a measurement say where they came from.

## How far away a target is found

Detection runs on the 960×720 view scaled to 0.75, and js-aruco2 needs a marker to span about 60 px in that copy — 80 px of the full view ([detector.ts](../../../src/cockpit/detector.ts)). `/markers` prints each marker 150 mm square ([markers.html](../../../src/cockpit/markers.html)).

On a rectilinear camera a marker of size `s` at distance `d` covers `f·s/d` pixels, with `f = 480 / tan(hfov/2)`. The Tello's 82.6° diagonal on a 4:3 frame gives a 70° horizontal field of view and `f ≈ 683 px`, so the 80 px threshold is met at `d ≈ 683·s/80` — about **1.3 m for the 150 mm print** that fits A4, and 2.6 m for a 300 mm one (which no longer fits A3 once `/markers` adds its padding, so it needs larger stock). Targets sit within about a metre of where the drone is flown unless they are printed larger, so the print size has to be decided before the targets are placed.

Both numbers are estimates from spec sheets. After the first real stream, measure the pixels a known marker size spans at a known distance and correct `f` and the threshold.

Detection also fails at the edge of the view, at steep angles and on motion blur. A marker with corners cut off by the frame edge is not a detection bug: it is the view, and the answer is where the target is placed and how the drone is pointed.

## What the pilot sees when a marker is not found

The enemy exists only as an overlay on the marker, so a missed detection shows the bare ArUco pattern instead of an enemy. The overlay holds the robot for 200 ms after a miss ([sortie.ts](../../../src/cockpit/sortie.ts)) so one blurry frame does not flash the pattern through, but longer losses — too far away, cut off by the frame edge — do.

So the printed target carries the enemy itself: a robot drawn on the cardboard with the marker as its chest, keeping the marker's white quiet zone. Losing the overlay then costs the pilot the hit feedback, not the enemy, and a detection failure stops reading as the game breaking. The overlay's torso already covers the quiet zone ([target-layer.ts](../../../src/cockpit/target-layer.ts)), so the printed robot and the drawn one have to line up.
