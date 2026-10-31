# Tello state observations, 2026-10-29

Source: session `5b4b01af-22a2-419a-acdf-c08f7ac3e4c3`, turns 41 and 44–45. These are summaries of two real-drone runs reported after inspecting state logs, not new measurements. Raw logs, firmware version and independent pose measurements were not preserved in the evaluated transcript. The state-logging work was still uncommitted there.

## State cannot yet establish movement or absolute heading

Both runs reported `vgx` and `vgy` as zero throughout flight; the second included forward movement, confirmed by the pilot in turn 45. Zero therefore cannot establish that this drone was stationary under these conditions. The session proposed using stick input for evasion instead. That measures the pilot's request, not actual displacement. Quantization was suggested as the reason for zero velocity but was not verified.

Yaw did not always start at zero. The second run started at 14–15°, reached 105–106° after an intended quarter turn, and stayed within 105–107° for about 45 seconds. The first run instead reported a 111° change for an intended 90° turn. Without an independent heading reference, these runs establish short-term stability in the reported value, not calibrated angular accuracy or a world heading. An initial heading must be captured before interpreting yaw relative to sortie start.

Pitch was reported as 0 to −1° during the second run with the 40% input limit. This does not establish that the drone remains level during translation, or that pitch compensation is unnecessary at other speeds.

## Battery alone did not predict flip acceptance

In the second run, `flip b` received `error` about 62 seconds after takeoff, with battery reported at 59%. This exceeds the cockpit's 50% refusal threshold, so that threshold cannot promise that a flip will execute. The cause remains unknown. A stricter battery requirement and concurrent `rc` input were hypotheses, not demonstrated causes; this evidence does not justify changing the threshold or suppressing input. A controlled hardware comparison is still needed before selecting a fix.
