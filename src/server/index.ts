import cockpit from "../cockpit/index.html";
import markers from "../cockpit/markers.html";
import { parseCockpitMessage, RECORDINGS_PATH, Topic, WS_PATH, type CockpitMessage, type ServerMessage } from "../shared/protocol";
import type { Drone } from "./drones/drone";
import { SimDrone } from "./drones/sim";
import { Tello } from "./drones/tello";
import { HoverWatchdog, RC_WATCHDOG_MS } from "./hover-watchdog";

const PORT = Number(process.env.PORT ?? 8080);
const DRONES: Record<string, () => Drone> = { sim: () => new SimDrone(), tello: () => new Tello() };
const RECORDINGS_DIR = "recordings";

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
        await Bun.write(path, req);
        console.log(`saved ${path}`);
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
      if (ws !== pilot) return;
      drone.land();
      airborne = false;
      pilot = null;
      hover.reset();
      for (const cockpit of cockpits) sendRole(cockpit);
    },
  },
});

function sendRole(ws: Bun.ServerWebSocket<unknown>): void {
  const role = pilot === ws ? "pilot" : pilot ? "observer" : "available";
  ws.send(JSON.stringify({ type: "control", role } satisfies ServerMessage));
}

function handle(ws: Bun.ServerWebSocket<unknown>, message: CockpitMessage): void {
  if (message.type === "rc") {
    if (ws === pilot && airborne) {
      hover.noteInput(Date.now());
      drone.rc(message);
    }
    return;
  }
  const accepted = (!pilot || ws === pilot) && (message.type !== "takeoff" || !airborne);
  if (!accepted) {
    ws.send(JSON.stringify({ type: "command", command: message.type, accepted } satisfies ServerMessage));
    return;
  }
  switch (message.type) {
    case "takeoff":
      pilot = ws;
      airborne = true;
      hover.noteInput(Date.now());
      for (const cockpit of cockpits) sendRole(cockpit);
      drone.takeoff();
      break;
    case "land":
      airborne = false;
      drone.land();
      break;
    case "emergency":
      airborne = false;
      drone.emergency();
      break;
  }
  ws.send(JSON.stringify({ type: "command", command: message.type, accepted } satisfies ServerMessage));
}

/**
 * Holds the drone until the cockpit has flown it, and stops talking once the cockpit goes quiet, so the
 * drone's own failsafe lands it instead of a hover that never ends (ADR 0002).
 */
setInterval(() => {
  const input = hover.next(Date.now(), airborne);
  if (input) drone.rc(input);
}, RC_WATCHDOG_MS);

setInterval(() => {
  const status: ServerMessage = { type: "status", drone: drone.name, battery: drone.battery() };
  server.publish(Topic.Status, JSON.stringify(status));
}, 1000);

console.log(`cockpit: http://localhost:${server.port}  (drone: ${drone.name})`);

for await (const accessUnit of drone.frames()) server.publish(Topic.Video, accessUnit);
