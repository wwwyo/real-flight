import cockpit from "../cockpit/index.html";
import markers from "../cockpit/markers.html";
import { parseCockpitMessage, RECORDINGS_PATH, Topic, WS_PATH, type CockpitMessage, type ServerMessage } from "../shared/protocol";
import type { Drone } from "./drones/drone";
import { SimDrone } from "./drones/sim";
import { Tello } from "./drones/tello";
import { HoverWatchdog, RC_WATCHDOG_MS } from "./hover-watchdog";
import { LinkLog, VideoStats } from "./link-log";

const PORT = Number(process.env.PORT ?? 8080);
const DRONES: Record<string, () => Drone> = {
  sim: () => new SimDrone(),
  tello: () =>
    new Tello(
      (event, data) => log.event("drone", event, data),
      (event, data) => log.stats("drone", event, data),
    ),
};
const RECORDINGS_DIR = "recordings";
const STATS_WINDOW_MS = 1000;
/**
 * How long a drone whose pilot's cockpit dropped waits for the pilot to come back (reopen the cockpit
 * and press take-off) before the relay lands it. Shorter than Tello's 15 s no-command failsafe, so the
 * relay's landing comes first.
 */
const RECLAIM_MS = 10_000;

const log = new LinkLog();

const droneName = process.env.DRONE ?? "sim";
const createDrone = DRONES[droneName];
if (!createDrone) throw new Error(`Unknown DRONE "${droneName}". Use one of: ${Object.keys(DRONES).join(", ")}`);
const drone = createDrone();
await drone.connect();

const hover = new HoverWatchdog();
const cockpits = new Set<Bun.ServerWebSocket<unknown>>();
let pilot: Bun.ServerWebSocket<unknown> | null = null;
// Commanded state only; Tello acknowledgements still need validation on hardware.
let airborne = false;
/** Pending landing of a drone left airborne without a pilot. */
let reclaimTimer: ReturnType<typeof setTimeout> | undefined;

/** Names the cockpit is opened with, on the Mac or through `adb reverse` on the Quest. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Only the cockpit page itself may drive the drone or write recordings. Browsers let any page open
 * a WebSocket or POST to localhost, so a request from another origin is refused. Matching Origin
 * with Host alone is not enough: a page on a DNS-rebound name sends its own name in both.
 */
function fromCockpit(req: Request): boolean {
  const host = req.headers.get("host");
  if (!host || !LOOPBACK_HOSTS.has(new URL(`http://${host}`).hostname)) return false;
  const origin = req.headers.get("origin");
  return origin === null || origin === `http://${host}`;
}

const server = Bun.serve({
  port: PORT,
  // The Quest reaches the Mac through `adb reverse`, which arrives on loopback; nothing else needs it.
  hostname: "127.0.0.1",
  // A whole sortie recording arrives in one request; Bun's 128 MB default is about 10 minutes of video.
  maxRequestBodySize: 1024 * 1024 * 1024,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": cockpit,
    "/markers": markers,
    [RECORDINGS_PATH]: {
      POST: async (req) => {
        if (!fromCockpit(req)) return new Response("Forbidden", { status: 403 });
        const ext = req.headers.get("content-type")?.includes("mp4") ? "mp4" : "webm";
        const path = `${RECORDINGS_DIR}/sortie-${new Date().toISOString().replaceAll(":", "-")}.${ext}`;
        const bytes = await Bun.write(path, req);
        log.event("relay", "recording-saved", { path, bytes });
        return Response.json({ path });
      },
    },
  },
  fetch(req, server) {
    if (new URL(req.url).pathname === WS_PATH) {
      if (!fromCockpit(req)) return new Response("Forbidden", { status: 403 });
      if (server.upgrade(req)) return;
    }
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      cockpits.add(ws);
      log.event("relay", "cockpit-open", { cockpits: cockpits.size });
      ws.subscribe(Topic.Video);
      ws.subscribe(Topic.Status);
      sendRole(ws);
    },
    message(ws, message) {
      if (typeof message !== "string") return;
      const parsed = parseCockpitMessage(message);
      if (parsed) handle(ws, parsed);
    },
    close(ws) {
      cockpits.delete(ws);
      log.event("relay", "cockpit-close", { pilot: ws === pilot, airborne, cockpits: cockpits.size });
      if (ws !== pilot) return;
      pilot = null;
      for (const cockpit of cockpits) sendRole(cockpit);
      if (!airborne) {
        hover.reset();
        return;
      }
      // The watchdog cancels the last stick input as it would for a silent pilot, so the drone hovers
      // while the pilot reopens the cockpit; landing at once would end the sortie over a dropped cable.
      log.event("relay", "pilot-lost", { landInMs: RECLAIM_MS });
      clearTimeout(reclaimTimer);
      // Re-checks the state when it fires, so a landing never reaches a drone someone took back.
      reclaimTimer = setTimeout(() => {
        if (pilot || !airborne) return;
        log.event("relay", "pilot-not-back", { afterMs: RECLAIM_MS });
        airborne = false;
        drone.land();
        hover.reset();
      }, RECLAIM_MS);
    },
  },
});

function sendRole(ws: Bun.ServerWebSocket<unknown>): void {
  const role = pilot === ws ? "pilot" : pilot ? "observer" : "available";
  ws.send(JSON.stringify({ type: "control", role } satisfies ServerMessage));
}

function handle(ws: Bun.ServerWebSocket<unknown>, message: CockpitMessage): void {
  if (message.type === "log") {
    const source = ws === pilot ? "pilot" : "cockpit";
    if (message.event === "stats") log.stats(source, message.event, message.data);
    else log.event(source, message.event, message.data);
    return;
  }
  if (message.type === "rc") {
    if (ws === pilot && airborne) {
      hover.noteInput(Date.now());
      drone.rc(message);
    }
    return;
  }
  // Take-off while airborne without a pilot is a cockpit taking the drone back, not a second take-off.
  const reclaim = message.type === "takeoff" && airborne && !pilot;
  // A flip only makes sense in the air, and only from the cockpit flying the drone.
  const accepted =
    (!pilot || ws === pilot) && (message.type !== "takeoff" || !airborne || reclaim) && (message.type !== "flip" || (ws === pilot && airborne));
  log.event("relay", "command", { command: message.type, accepted, otherPilot: pilot !== null && ws !== pilot, airborne });
  if (!accepted) {
    ws.send(JSON.stringify({ type: "command", command: message.type, accepted } satisfies ServerMessage));
    return;
  }
  clearTimeout(reclaimTimer);
  switch (message.type) {
    case "takeoff":
      pilot = ws;
      hover.noteInput(Date.now());
      for (const cockpit of cockpits) sendRole(cockpit);
      if (reclaim) {
        log.event("relay", "pilot-back");
        break;
      }
      airborne = true;
      drone.takeoff();
      break;
    case "land":
      airborne = false;
      drone.land();
      hover.reset();
      break;
    case "emergency":
      airborne = false;
      drone.emergency();
      hover.reset();
      break;
    case "flip":
      hover.noteInput(Date.now());
      drone.flip(message.direction);
      break;
  }
  ws.send(JSON.stringify({ type: "command", command: message.type, accepted } satisfies ServerMessage));
}

/**
 * Holds the drone until the cockpit has flown it, and stops talking once the cockpit goes quiet, so the
 * drone's own failsafe lands it instead of a hover that never ends (ADR 0002).
 */
setInterval(() => {
  const input = hover.next(Date.now());
  if (!input) return;
  log.event("relay", "watchdog-hover", { silentMs: RC_WATCHDOG_MS });
  drone.rc(input);
}, RC_WATCHDOG_MS);

setInterval(() => {
  const status: ServerMessage = { type: "status", drone: drone.name, battery: drone.battery(), linked: drone.linked() };
  server.publish(Topic.Status, JSON.stringify(status));
}, 1000);

console.log(`cockpit: http://localhost:${server.port}  (drone: ${drone.name})`);
console.log(`link log: ${log.path}`);

const video = new VideoStats();
let windowStart = performance.now();
setInterval(() => {
  const now = performance.now();
  log.stats("relay", "video", { ...video.take(now - windowStart, now), cockpits: cockpits.size, airborne, battery: drone.battery() });
  windowStart = now;
}, STATS_WINDOW_MS);

for await (const accessUnit of drone.frames()) {
  video.noteFrame(accessUnit, performance.now());
  server.publish(Topic.Video, accessUnit);
}
