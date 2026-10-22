# REAL FLIGHT

[日本語](docs/README.ja.md)

A combat game where real drones fight in real air. The pilot wears a Quest 3, sees the drone's camera as a cockpit with a HUD, flies with the Touch controllers, and shoots down targets by holding them in the reticle. Spectators watch the cockpit feed alongside the real machine.

> Status: MVP in progress. One pilot, one Tello, ArUco-marked targets. The drone is a swappable part; Tello is only the first test machine.

## QuickStart

Requires a Mac, a Tello, a Quest 3 with developer mode, and `adb`.

```bash
mise install
bun install
```

Join the Mac to the Tello's Wi-Fi, connect the Quest over USB, run `adb reverse`, and open the cockpit in the Quest browser. Run commands are added with the first feature.
