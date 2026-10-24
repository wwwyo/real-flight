# The drone lands itself; the relay only cancels stale stick input

When the cockpit that is flying the drone stops sending stick input while its WebSocket stays open — a tab the browser froze, a hung renderer — the relay cancels the last `rc` setpoint once and then sends nothing. It does not land the drone. Tello lands on its own after 15 s without a command, and a relay that sends `rc 0 0 0 0` every 500 ms never lets that timer run, so the drone hovers until the battery dies. Silence is the one thing a dead relay and a frozen cockpit both produce, so handing the link to the drone's own failsafe covers both, and the relay only has to stop talking. Either way the drone ends up hearing silence and applying its own policy, so the relay no longer has to know which failures the drone can see.

The cockpit keeps its own landing when decoded video stops for more than a second: the relay would still be flying the drone, so the drone cannot notice, and a pilot without the view cannot fly.

## Considered Options

- **Land from the relay or the app when input goes stale** (asked for in review on PR #4): a second landing implementation in the part that is misbehaving in the case that matters, racing the drone's own failsafe. Rejected for the same reason ADR 0001 keeps the relay thin.
- **Keep sending hover while input is stale** (what the MVP shipped): the last setpoint is cancelled, but the command stream keeps the drone's 15 s timer from expiring, so a frozen cockpit leaves the drone hovering.
- **Stop at the first silence and let the drone decide** (chosen): one hover cancels the setpoint, then quiet; the drone's failsafe lands it on a dead relay and a frozen cockpit alike.

## Evidence

Tello's 15 s no-command landing is SDK documentation and has not been observed on this drone; neither has the relay's silence. The relay side is unit-tested (`src/server/hover-watchdog.test.ts`) and the control e2e test passes. Confirm both on hardware before trusting the failsafe in an arena: if the Tello turns out not to reset its timer on `rc`, nothing here changes, but if it does not land at all, the relay needs the alternative above.
