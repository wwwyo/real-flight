# The relay binds its command socket to a fixed port

When the relay starts, it binds its UDP socket for Tello commands and replies to a fixed port (8889, the same port Tello's SDK uses) instead of an ephemeral one. A Tello remembers the source port of the first `command` it answers and keeps replying there until it is switched off; a relay that restarted on a different ephemeral port kept sending commands the drone obeyed while its replies went to the old port, so the link showed DRONE LOST and the state stream went silent even though the drone still flew. Binding the reply socket to 8889 makes every relay restart pick up the replies on the same port.

## Considered Options

- **Ephemeral source port per relay start** (what the MVP shipped): the handshake and `rc` commands reached the drone, but after a restart the replies and state came back to the dead port, so the relay never saw `tello-linked` again and the HUD reported DRONE LOST while control still worked. Rejected.
- **Re-send `command` from the new port and hope the Tello updates** (untested): the SDK does not document switching the reply destination mid-session, and a wrong guess leaves the drone answering a port nobody listens on. Rejected.
- **Fixed source port on 8889** (chosen): matches the port the Tello already associates with the relay, so a restarted relay recovers replies and state without re-pairing. Costs one reserved port on the Mac and means the relay and any other Tello client on the same machine cannot share that port.

## Evidence

Session `5b4b01af-22a2-419a-acdf-c08f7ac3e4c3` reported a real sortie where, after a relay restart, the HUD stayed on DRONE LOST for the whole flight while the drone still obeyed sticks, and the state log showed no `tello-linked` recovery. The fix shipped as PR #18 (`fix/tello-fixed-command-port`, merged 2026-10-28) and is implemented in `src/server/drones/tello.ts` (`REPLY_PORT = 8889`, with the socket bound on that port in `connect()`). The unit tests in `src/server/drones/tello.test.ts` cover `parseState`; the port binding itself is not unit-tested, so confirm recovery after a relay restart on hardware before trusting it in an arena.
