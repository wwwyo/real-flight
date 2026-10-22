# TypeScript only, with the Mac as a thin relay

The Mac runs a Bun process that only relays Tello UDP (SDK commands and the raw H.264 stream) to the Quest 3 browser over WebSocket via `adb reverse`. Video decoding (WebCodecs), the HUD, ArUco lock-on and recording all run in the Quest browser. We chose this over a Python side (djitellopy + OpenCV) because decoding on the Mac means compositing the HUD there and re-encoding for the Quest, which adds latency and a second language, while the Quest side has to be JS anyway for WebXR.

## Considered Options

- **Python on the Mac (djitellopy, OpenCV, PyAV)**: easiest for ArUco and decoding, but forces a decode → composite → re-encode → decode chain. Return to it only if WebCodecs H.264 decoding does not work in the Quest browser.
- **Lock-on detection on the Mac**: fallback if ArUco is too slow on the Quest. The Mac would decode a copy of the stream and send only detection results, not video.
