---
status: in-progress
---

# Sortie MVP

[日本語](prd.ja.md)

Design: [dd.md](dd.md) — target size and detection range, and what the pilot sees when a marker is missed.

## Problem

REAL FLIGHT is pitched as an IP where real machines fight in real air, but nothing yet shows that a pilot in a Quest 3 can aim a real drone, that virtual shooting feels like a fight, or that the result is worth watching. The TCIC IP INNOVATION AWARDS 2026 application (deadline 10/29 17:00) needs that evidence as a sortie video by 10/26.

## Derivation

This is the smallest slice of the Story that contains both core actions: one pilot flies one sortie and shoots down targets, and the sortie becomes a video someone else can watch.

## Overview

The pilot wears a Quest 3 and opens the cockpit in its browser. The cockpit shows the Tello's camera as the view from the cockpit, with a HUD on top. The pilot flies with the Touch controllers and shoots down cardboard targets marked with ArUco markers by aiming the reticle at them and firing. The Quest records the cockpit view. A phone films the drone from outside, and the two are edited together into the sortie video for the application.

### Goals

- Find out whether a pilot can turn the whole drone with the Touch controllers to put the reticle on a target, and whether flying it is fun. Measure latency first.
- Find out whether aiming and firing at a target to shoot it down feels like a fight.
- Produce a sortie video (cockpit + HUD, with an outside view) to attach to the application, and judge whether it works as content.

### Non-Goals

- Multiple drones or pilots, or head-to-head battles
- A native Quest app
- Body or hand-tracking control
- Drone shells or exterior design, or an arena
- Live streaming, or compositing the outside camera live (it is combined in editing)
- First-time pilots or outside viewers testing it before the application; this round is judged by the developer alone
- Drones other than Tello. The adapter boundary exists, but there is no second adapter

## Domain Model

Terms follow the [Glossary](../../../AGENTS.md#glossary).

- A sortie has one pilot, one drone and a set of targets placed in a room. It ends when every target is shot down or the drone lands.
- Firing: while the pilot holds the trigger, the drone fires about every 0.3 s with unlimited ammunition. A shot hits when the reticle's centre is on a target's torso in the view the pilot sees, so video latency does not make a hit unfair. A target is shot down by its third hit. (Playtesting replaced the first idea, holding a target in the reticle for 1 s, which felt like waiting rather than fighting.)

## Acceptance Criteria

1. Before control or shooting work starts, the developer knows whether the Quest browser can decode the Tello's H.264 with WebCodecs, and has measured and recorded the latency from the drone's camera to the cockpit view. If it cannot, the video path changes to the fallback in [ADR 0001](../../adr/0001-typescript-only-thin-relay.md), and that change is recorded as an ADR.
2. The pilot opens the cockpit in the Quest 3 browser over USB and sees the Tello's camera live in WebXR, with the HUD.
3. The pilot can take off, fly on four axes, land and stop the drone in an emergency using only the Touch controllers.
4. The pilot shoots down a target by aiming at it and firing, and sees on the HUD whether the reticle is on a target, each hit, the hits each target has left, and the count of targets remaining.
5. The pilot completes a sortie that shoots down every placed target, and sees its elapsed time.
6. The developer gets the sortie's cockpit view (with the HUD) as a video file on the Mac, and edits it with outside camera footage into a sortie video that can be attached to the application.

## Non-Functional Requirements

- Safety: the pilot can stop the drone at any moment with one controller button, and the drone does not keep flying once the cockpit or relay link drops: it stops moving, waits briefly for the pilot to reconnect, and lands if the link does not come back.
- Swappability: Tello-specific code stays behind the drone adapter.
- Privacy: the repo is public. Recordings and raw video stay out of it.

## Success Metrics

Judged by the developer, who is also the pilot, so the results lean optimistic. Outside reactions come after the application.

- Aiming: the measured latency is recorded, and the pilot can put the reticle on a static target. The pilot writes down whether flying was fun, and why.
- Fight feel: the pilot completes a sortie and writes down whether shooting felt like fighting.
- Content: a sortie video of a full sortie is attached to the application by 10/29.
