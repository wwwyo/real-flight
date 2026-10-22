# REAL FLIGHT

## Story

A pilot flies a real machine into a fight in real air, and the people around watch it happen.

Core actions:
- Fly a sortie and shoot down a target — per play session
- Watch or share a sortie video — per sortie

## Directory structure

```
real-flight/
├── src/
│   ├── server/        Bun on the Mac: serves the cockpit, relays drone UDP ⇄ WebSocket
│   │   └── drones/    one adapter per drone model (Tello first); the rest of the code is drone-agnostic
│   └── cockpit/       Quest 3 browser app: WebXR view, WebCodecs decode, HUD, lock-on, Touch controller input, recording
└── docs/
    ├── prd/           per-feature requirements and design (structure in prd/README.md)
    └── adr/           hard-to-reverse decisions (structure in adr/README.md)
```

## Setup

Tools are managed with mise.

```bash
mise install   # install tools pinned in mise.toml
bun install
```

The Quest 3 reaches the Mac over USB: `adb reverse tcp:<port> tcp:<port>`, then open `http://localhost:<port>` in the Quest browser. The Mac joins the Tello's Wi-Fi; the Quest stays off it.

## Tech stack

- Bun + TypeScript for everything (why: [ADR 0001](docs/adr/0001-typescript-only-thin-relay.md))
- Quest browser: WebXR, Gamepad API, WebCodecs (H.264), MediaRecorder
- Drone: Tello SDK over UDP (commands on 8889, video on 11111)

## Skills

- Read `docs/adr/` before changing where decoding, lock-on or recording runs
- Measured latency and Quest browser quirks go into `.agents/skills/<topic>/` once found
