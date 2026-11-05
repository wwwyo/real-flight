---
name: tello-video
description: Read when investigating Tello video latency or comparing Mac and Quest cockpit behavior in real-flight.
---

# Tello video evidence

| Task | Read |
| --- | --- |
| Compare a latency hypothesis with the hardware baseline | [Mac Chrome measurement, 2026-10-27](../../../docs/hardware/2026-10-27-tello-video.md) |
| Assess Quest recording evidence or an XR image-quality proposal | [Quest recording observations, 2026-10-28](../../../docs/hardware/2026-10-28-quest-recording.md) |
| Check whether Tello state supports movement, heading or flip assumptions | [Tello state observations, 2026-10-29](../../../docs/hardware/2026-10-29-tello-state.md) |

Read the repo's ADRs before changing where video decoding runs.

## Measured values (quick reference)

Session-reported figures; raw logs and originals are not retained, so treat as evidence pointers, not benchmarks. See the linked hardware docs for scope and caveats.

- Recording: cockpit recorder requests 6 Mbps / 30 fps, but a 2026-10-28 Quest sortie recorded about 2.9 Mbps and 24 fps; older Mac Chrome / simulated files were about 1–1.5 Mbps and 21–23 fps. The browser-side cap hypothesis was not isolated. (`docs/hardware/2026-10-28-quest-recording.md`)
- Tello state: `vgx` and `vgy` read 0 throughout flight even during forward movement, so velocity integration is unusable for evasion; use stick deflection instead. (`docs/hardware/2026-10-29-tello-state.md`)
- Yaw: did not start at 0 (14–15° in one run); a 90° command produced 111° in one run and 91°→±2° over ~45 s in another. Capture an initial heading before interpreting yaw relative to sortie start. (`docs/hardware/2026-10-29-tello-state.md`)
- Pitch: 0 to −1° with the 40% input limit in one run; does not establish level flight at other speeds. (`docs/hardware/2026-10-29-tello-state.md`)
- `flip b`: returned `error` at 59% battery, above the cockpit's 50% refusal threshold; battery alone does not predict flip acceptance, and the cause is unknown. (`docs/hardware/2026-10-29-tello-state.md`)
- Relay receive (Mac Chrome, 2026-10-27): median 30 fps receive, max key-frame interval 1,253 ms, max receive gap 498 ms, median decode residence 458.5 ms, median target detection 10.7 ms. (`docs/hardware/2026-10-27-tello-video.md`)
