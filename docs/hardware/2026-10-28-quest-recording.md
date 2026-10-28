# Quest recording observations, 2026-10-28

These are session-reported observations, not a new hardware measurement. Original recordings and frame extracts were not re-inspected for this consolidation. Browser version, encoder backend and per-file metadata were not preserved in the evaluated records.

## What worked on Quest

Source: session `19d84d32-5a91-4a29-b731-171bcb4610fa`, turns 5–10. The Mac reached the internet over wired LAN (`en5`) while Wi-Fi (`en0`) reached the Tello; Quest used USB. The pilot flew the real drone from Quest, and a 49-second, 960×720 cockpit recording reached the Mac. This establishes that the browser recording/upload path worked in that run; it does not measure decode latency or establish reliable operation across sorties.

The pilot reported an unplanned landing. The session reported battery readings falling from 38% to 17% over 44 seconds. Low charge was suspected, but the landing's cause was not isolated. Dark, noisy frames and occasional block corruption were reported from extracted images. Lighting, transport corruption and re-encoding were not tested separately, so none is established as the sole cause of poor image quality.

## Recording measurements have different scopes

Source: session `5b4b01af-22a2-419a-acdf-c08f7ac3e4c3`, turn 2. Four recordings, including real Tello footage from Mac Chrome on October 27 and simulated footage, were reported as 960×720, about 1–1.5 Mbps and 21–23 effective fps. The session explicitly could not find the October 28 Quest recordings in either checkout. Do not label these four files as a Quest encoder benchmark.

The recorder now requests 6 Mbps and captures the cockpit canvas at 30 fps. Those settings are not measured output. The lower frame rate in the older files does not identify whether frames were lost before decoding, while drawing, during capture or during encoding. The evaluated record does not establish the output bitrate of a Quest recording made with the 6 Mbps setting.

## Which improvements affect the sortie video

The recorder captures the composed 2D cockpit canvas, while XR displays the sight and instrument canvases separately. This was checked in `src/cockpit/main.ts`, `recorder.ts` and `xr.ts`. Improving the XR display path cannot restore detail already lost in the recorded canvas. The quad-layer work in [PR #16](https://github.com/wwwyo/real-flight/pull/16) changes that display path; its evaluated worker record (`b288e323-2434-411a-9355-44013a34c467`) reports desktop checks, with Quest validation still pending.

Saving raw H.264 at the relay was proposed as a comparison source without HUD or re-encoding. It was not implemented or adopted in the evaluated record, so it is not an exception to ADR 0001. A useful next measurement is a Quest recording with the requested 6 Mbps setting, retaining file metadata and the matching link-log window; a separate raw-stream comparison would need its own design decision. No recording-quality or latency fix is established by these observations.
