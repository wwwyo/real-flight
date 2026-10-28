# REAL FLIGHT

## Story

A pilot flies a real machine into a fight in real air.

Core actions:
- Fly a sortie and shoot down a target — per play session
- Watch or share a sortie video — per sortie

## Glossary

**Pilot**:
The person in the Quest 3 who flies the drone.
_Avoid_: player, operator

**Drone**:
The real machine a pilot flies. A swappable part; Tello is only the first model.
_Avoid_: aircraft, UAV

**Sortie**:
One play session of a pilot and a drone, from takeoff to landing, in which the pilot shoots down targets.
_Avoid_: match, round, flight

**Target**:
A physical enemy placed where the drone flies, either alive or shot down. Being shot down is virtual; nothing happens to the target itself.
_Avoid_: enemy, marker

**Cockpit**:
The pilot's view: the drone's camera shown as if from inside the machine, with a HUD and a reticle marking where the drone points.
_Avoid_: viewer, FPV screen

**Sortie video**:
A video of one sortie for people who were not in the cockpit: the cockpit view together with an outside view of the drone.
_Avoid_: spectator video, replay

## Directory structure

```
real-flight/
├── src/
│   ├── server/        Bun on the Mac: serves the cockpit, relays drone UDP ⇄ WebSocket
│   │   └── drones/    one adapter per drone model (Tello first); the rest of the code is drone-agnostic
│   ├── cockpit/       Quest 3 browser app: WebXR view, WebCodecs decode, HUD, shooting, Touch controller input, recording
│   └── shared/        code both sides use: the WebSocket protocol, H.264 framing, target ids
└── docs/
    ├── prd/           per-feature requirements and design (structure in prd/README.md)
    └── adr/           hard-to-reverse decisions (structure in adr/README.md)
```

## Setup

Tools are managed with mise.

```bash
mise install   # install tools pinned in mise.toml
bun install
bun run dev    # cockpit with the simulated drone (DRONE=tello for the real one)
bun test       # unit tests
bun run typecheck
```

The Quest 3 reaches the Mac over USB: `adb reverse tcp:<port> tcp:<port>`, then open `http://localhost:<port>` in the Quest browser. The Mac joins the Tello's Wi-Fi; the Quest stays off it.

## Tech stack

- Bun + TypeScript for everything (why: [ADR 0001](docs/adr/0001-typescript-only-thin-relay.md))
- Quest browser: WebXR, Gamepad API, WebCodecs (H.264), MediaRecorder
- Drone: Tello SDK over UDP (commands on 8889, video on 11111)

## Skills

- Read `docs/adr/` before changing where decoding, hit judgement or recording runs, or what the relay sends when cockpit input stops
- For Tello video latency and hardware observations, read [tello-video](.agents/skills/tello-video/SKILL.md); add Quest browser evidence there once measured.

## Review

Pullfrog reviews each PR once automatically; later commits are re-reviewed too. Ask again with `@pullfrog`. Repo-level settings live in [`.github/pullfrog.config.sh`](.github/pullfrog.config.sh).
