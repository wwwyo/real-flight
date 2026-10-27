# Tello video baseline on Mac Chrome, 2026-10-27

The pilot reported lag and difficult control on Mac Chrome with a real Tello. Quest was not connected for this measurement. The earlier explanation that Quest marker detection was too slow therefore did not explain this run.

## Observations

Source: session `04a7e79e-754a-4f9e-aca1-2e386bce8db6`, turns 14–15 and 34–35, checked against local `logs/link-2026-10-27T08-07-56.699Z.jsonl`. The video sample runs from 09:17:59.127 to 09:21:51.268 UTC. Raw logs are ignored by Git; these aggregates preserve the baseline. Browser version and decoder backend were not recorded.

| Measurement | Result | Sample definition |
| --- | --- | --- |
| Relay receive rate | Median 30 fps | 233 `video` windows with `fps > 0` |
| Key frame interval | Maximum 1,253 ms | Same receive windows |
| Receive frame gap | Maximum 498 ms; no windows above 500 ms | Same receive windows |
| Decode residence | Median 458.5 ms | 212 `stats` windows with positive `maxDecodeMs` |
| Target detection | Median 10.7 ms | `detectMs` in those same 212 windows |

`maxDecodeMs` is the maximum elapsed time in each logging window from the timestamp assigned just before `VideoDecoder.decode()` to the output callback. Its median is a median of window maxima, not a median over all frames, CPU decoding time, or camera-to-cockpit latency. `detectMs` is the last detection duration reported in each window. All 212 selected windows have `xr: false`.

The log through the session cutoff (09:31:30.145 UTC) also contains 73 decoder errors, 26 resumed video stalls, and two saved recordings. It contains one `tello-linked` followed by one `tello-lost`; it does not establish recovery after that loss.

## What remains unknown

The receive gaps do not measure UDP packet loss: damaged video can arrive without a long gap between access units. They cannot rule out Wi-Fi corruption. The output timing makes decoder buffering a candidate, but does not identify the backend or prove why frames waited. Hardware versus software decoding and H.264 SPS changes were proposed, not tested. No latency fix or Quest WebCodecs compatibility is established by this run. Compare candidates on hardware and measure camera-to-cockpit latency before changing the video path under ADR 0001.

## Connection constraint observed during the run

Joining the Tello's Wi-Fi removed the Mac's internet connection, interrupting the agent conversation. Continued online assistance needs a separate internet interface while Wi-Fi carries the Tello traffic; Quest uses the USB path already described in AGENTS.md. iPhone USB tethering with higher service priority was proposed but not confirmed in this session. Without another interface, the local link log remains available for analysis after returning to the normal network.
