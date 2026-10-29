---
status: ready
---

# Enemy waves

[日本語](prd.ja.md)

Builds on [Sortie MVP](../sortie-mvp/prd.md).

## Problem

In the Sortie MVP the pilot shoots down printed targets that stand still and never shoot back. Aiming at them works, but nothing threatens the drone, so a sortie feels like target practice rather than a fight. The targets also only work within about 1.3 m in good light, which leaves little to fly around.

## Derivation

The Story is a pilot flying a real machine into a fight in real air. The MVP showed that the pilot can fly and shoot. This adds the other side of a fight: enemies that come in numbers, attack the drone, and have to be avoided by flying it. The reference is the vertical-scrolling shooter genre, where waves of aircraft come at the player's plane, shoot at it, and are shot down for score.

## Overview

The pilot takes off and hovers in the room. Waves of virtual enemy aircraft fly in around the drone in formation and fire at it. The enemies keep their place in the air when the drone turns or climbs, so the pilot aims by flying the real drone and dodges by moving it out of the line of fire. In a tight spot the pilot makes the drone do a real flip, which no shot can hit. The sortie ends with the printed target as the last enemy; shooting it down wins, and losing all armor first loses. The cockpit shows the result; the drone stays in the pilot's hands until they land it. Sound in the cockpit and in the recording carries the fight.

### Goals

- Find out whether enemies that attack make a sortie feel like a fight, compared with the MVP.
- Find out whether aiming and dodging by flying the real drone is the fun part, i.e. whether the real machine matters to the game.
- Get a sortie video that shows a fight, not target practice, for the TCIC IP INNOVATION AWARDS 2026 application (deadline extended to 2026-11-04).

### Non-Goals

- Flying forward along a real course in place of scrolling. Rooms are small and the drone is slowed to 40% for indoor flight; this comes back once there is a place to fly it.
- Multiple drones or pilots, head-to-head fights
- Physical enemies that move
- Outdoor flight
- Recreating a specific existing game. The genre is the reference; aircraft, stages, names and HUD are original.

## Glossary

- **Wave**: a group of enemy aircraft that come in together, attack and either are shot down or leave.
- **Enemy aircraft**: a virtual aircraft in a wave. It exists only in the cockpit view and the sortie video. Unlike a [target](../../../AGENTS.md#glossary), nothing is placed in the room for it.
- **Armor**: how many enemy hits the drone can take before the sortie is lost.
- **Evasive flip**: a real flip of the drone that the pilot calls in; enemy fire cannot hit the drone during it.

Wave and enemy aircraft move to the [AGENTS.md Glossary](../../../AGENTS.md#glossary) once this is ready, since the sortie and the sortie video use them too.

## Domain Model

- A sortie is a sequence of waves followed by the targets placed in the room. It is won when the last target is shot down, and lost when armor runs out. Either way the cockpit shows the result, and the pilot keeps flying until they land.
- Enemy aircraft and targets are both shot by the same trigger and reticle. Enemy aircraft fly and fire; targets stand still and do not fire.
- Enemy fire is aimed at where the drone is when it is fired. It hits when it reaches the drone and the drone has not moved out of its way.
- Shooting down a whole wave earns a power-up that makes the drone's fire stronger for a while.
- Score counts enemy aircraft and targets shot down, and is shown at the end of the sortie with the elapsed time.

## Acceptance Criteria

1. The pilot sees waves of enemy aircraft come in and fly in formation in the cockpit view, and they stay put in the air when the pilot turns, climbs or descends the drone.
2. The pilot shoots down enemy aircraft by flying the drone to put the reticle on them and firing.
3. Enemy aircraft fire at the drone. The pilot sees fire coming, can avoid it by moving the drone, and sees when the drone is hit and how much armor is left.
4. The pilot can call an evasive flip with one button. The drone does a real flip, enemy fire does not hit it during the flip, and the cockpit refuses the flip when the drone cannot do it safely.
5. After the waves, the printed target appears as the last enemy. Shooting it down wins the sortie; running out of armor loses it. In both cases the pilot sees the result and score, and the drone keeps flying until the pilot lands it.
6. The pilot hears the fight in the cockpit (firing, hits, shoot-downs, warnings), and the sortie recording includes that sound.
7. The developer can play a whole sortie with the simulated drone on the Mac, without the Tello.

## Non-Functional Requirements

- Safety: everything in the [Sortie MVP](../sortie-mvp/prd.md#non-functional-requirements) still holds. The game never moves the drone on its own, not even when a sortie is lost; the only game move sent to the drone is the flip the pilot asks for.
- The MVP's target-only sortie stays available until this is proven on the drone, so a sortie video can still be shot with it.

## Success Metrics

Judged by the developer, who is also the pilot.

- Fight feel: after several sorties the pilot writes down whether it felt like a fight compared with the MVP, and why.
- Flying matters: the pilot writes down whether aiming and dodging by flying the drone was the fun part.
- Content: a sortie video with waves is shot and judged usable for the application.
