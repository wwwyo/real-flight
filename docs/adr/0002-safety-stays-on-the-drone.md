# The drone lands itself; the relay only cancels stale stick input

When the cockpit that is flying the drone stops sending stick input while its WebSocket stays open — a tab the browser froze, a hung renderer — the relay cancels the last `rc` setpoint a few times and then sends nothing. It does not land the drone. Tello lands on its own after 15 s without a command, and a relay that sends `rc 0 0 0 0` every 500 ms never lets that timer run, so the drone hovers until the battery dies. Silence is the one thing a dead relay and a frozen cockpit both produce, so handing the link to the drone's own failsafe covers both, and the relay only has to stop talking. Either way the drone ends up hearing silence and applying its own policy, so the relay no longer has to know which failures the drone can see.

The cancel is repeated (three sends, about a second) because Tello takes `rc` over UDP with no retry: one lost datagram would leave the last setpoint — a stick held forward — on until the failsafe lands the drone. A whole second of hovers barely shortens the 15 s the failsafe waits.

When decoded video stops while the link stays up, nothing lands or freezes the drone: the cockpit warns the pilot, with how long the view has been frozen, and keeps flying. On Wi-Fi a lost packet freezes the view until the next key frame, so stalls are frequent and usually end; landing or dropping stick input on each one took the drone away from the pilot without warning, which surprised the pilot more than the stall did. The pilot decides, and land and emergency stay one button away.

## Considered Options

- **Land from the relay or the app when input goes stale** (asked for in review on PR #4): a second landing implementation in the part that is misbehaving in the case that matters, racing the drone's own failsafe. Rejected for the same reason ADR 0001 keeps the relay thin.
- **Keep sending hover while input is stale** (what the MVP shipped): the last setpoint is cancelled, but the command stream keeps the drone's 15 s timer from expiring, so a frozen cockpit leaves the drone hovering.
- **Stop at the first silence and let the drone decide** (chosen): a few hovers cancel the setpoint, then quiet; the drone's failsafe lands it on a dead relay and a frozen cockpit alike.

When the pilot's WebSocket closes in flight, the relay knows the cockpit is gone, so it does not wait on the drone's failsafe: it lets the watchdog cancel the stick input, waits 10 s for the pilot to reopen the cockpit and press take-off, and lands the drone if nobody does. Landing at once ended the sortie over a reload or a pulled cable; 10 s is inside Tello's 15 s failsafe, so the relay's landing comes first.

For a video stall with a live link:

- **Hover and land after a second without video** (what the MVP shipped): flying blind is avoided, but every short stall cost the sortie, and the pilot lost control without having asked to.
- **Hover during the stall, land only after a longer one**: keeps the drone still, but still takes the sticks away when the view may be back a moment later.
- **Warn and keep flying** (chosen): the pilot sees the stall and its length and chooses to wait, land or stop. The risk is a pilot who keeps a stick pushed through a long stall.

## Evidence

Tello's 15 s no-command landing is SDK documentation and has not been observed on this drone; neither has the relay's silence. The relay side is unit-tested (`src/server/hover-watchdog.test.ts`) and the control e2e test passes. Confirm both on hardware before trusting the failsafe in an arena: if the Tello turns out not to reset its timer on `rc`, nothing here changes, but if it does not land at all, the relay needs the alternative above.
