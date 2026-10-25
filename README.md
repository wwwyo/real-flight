# REAL FLIGHT

[日本語](docs/README.ja.md)

A combat game where real drones fight in real air. The pilot wears a Quest 3, sees the drone's camera as a cockpit with a HUD, flies with the Touch controllers, and shoots down targets by holding them in the reticle. Spectators watch the cockpit feed alongside the real machine.

> Status: MVP in progress. One pilot, one Tello, ArUco-marked targets. The drone is a swappable part; Tello is only the first test machine.

## QuickStart

Requires a Mac. `mise install` brings Bun, ffmpeg and `adb`.

```bash
mise install
bun install
bun run dev                  # cockpit on http://localhost:8080 with the simulated drone
```

Open `http://localhost:8080` in Chrome. The simulated drone flies a camera over sky, clouds, mountains and fields with the target markers in them, so the whole cockpit works without hardware: keys `T` take off, `W/S` up-down, `A/D` yaw, arrows forward/back/left/right, `L` land, `Space` emergency. Add `?debug` to the URL to show frame rate, decoder queue and detection time on the HUD. Try WebXR on the desk with the [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator) extension.

The first tab to take off owns control until it disconnects; other tabs can watch. Losing that tab lands the drone even if another tab is watching. If decoded video stops for more than 1 second, the cockpit shows a warning, stops stick input and requests landing. A pilot tab that goes quiet without closing (the browser froze it) stops being flown by the relay: it cancels the last stick input and then goes silent, so the Tello's own 15-second no-command failsafe should bring it down ([ADR 0002](docs/adr/0002-safety-stays-on-the-drone.md)). Neither half of that is verified on hardware yet — fly the first real sorties with the land button ready and do not rely on the failsafe in an arena. Land and emergency remain available without video. After landing, wait for the 5-second recording tail before taking off again; pressing takeoff while airborne leaves the sortie unchanged.

Run `bun test` and `bun run typecheck` for the local checks. With the simulated server running, `bun run test:e2e` checks control ownership through the WebSocket API (`REAL_FLIGHT_TEST_URL` changes the URL). It refuses to send commands unless the server reports `drone: sim`.

With the real machines (a Tello, and a Quest 3 in developer mode):

```bash
DRONE=tello bun run start    # with the Mac joined to the Tello's Wi-Fi
adb reverse tcp:8080 tcp:8080
```

Then open `http://localhost:8080` in the Quest browser and press "Enter VR". Each sortie is recorded from takeoff until a few seconds after landing and saved to `recordings/` on the Mac. Print the targets from `http://localhost:8080/markers`.
