---
name: cockpit-qa
description: How far one observation of the cockpit goes — what a hidden browser tab, the simulated drone and the real Quest each can and cannot prove. Read before running the cockpit and reporting that something is broken, laggy, or not detected.
---

# Checking the cockpit

Decode, marker detection, lock-on and recording all run inside the cockpit page, so what an
observation proves depends on where it was made.

## A tab you cannot see is not evidence

Browsers pause `requestAnimationFrame` and slow timers to about once a second for tabs they consider
hidden. The cockpit samples the pilot's input and drives the sortie from timers, so in a background
tab "the keys do nothing" and "control feels laggy" are true of the tab, not of the code. The
converse rule keeps the code honest: drive input from a timer, never from `requestAnimationFrame`,
because that is a button that silently stops working while the video keeps playing.

Bring the tab to the foreground before sending keys and before taking a screenshot, and read `?debug`
in a foreground tab. Never report a conclusion about feel, input, or timing from a hidden window.

## The simulated drone proves the plumbing, not the drone

`DRONE=sim` renders a world and encodes H.264 in the shape of the camera stream, which exercises the
relay, the H.264 splitter, the decoder and the HUD without hardware. It cannot show the Tello's
framing, the Quest's decoding, or the latency — the measurement the PRD asks for before control or
lock-on work starts ([sortie-mvp](../../../docs/prd/sortie-mvp/prd.md)). Do not report a latency,
image-quality, or "detection is too slow" conclusion measured on the sim as a fact about the sortie.

## Coverage

Nothing has been measured on the Tello + Quest path yet. Measured latency and Quest browser quirks
belong here as their own sections once they exist.
