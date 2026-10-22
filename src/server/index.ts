import cockpit from "../cockpit/index.html";
import markers from "../cockpit/markers.html";
import { parseCockpitMessage, RECORDINGS_PATH, Topic, WS_PATH, type CockpitMessage, type ServerMessage } from "../shared/protocol";
import { HOVER, type Drone } from "./drones/drone";
import { SimDrone } from "./drones/sim";
import { Tello } from "./drones/tello";

const PORT = Number(process.env.PORT ?? 8080);
const DRONES: Record<string, () => Drone> = { sim: () => new SimDrone(), tello: () => new Tello() };
/** Without fresh stick input for this long, the drone is told to hover. */
const RC_WATCHDOG_MS = 500;
const RECORDINGS_DIR = "recordings";

const droneName = process.env.DRONE ?? "sim";
const createDrone = DRONES[droneName];
if (!createDrone) throw new Error(`Unknown DRONE "${droneName}". Use one of: ${Object.keys(DRONES).join(", ")}`);
const drone = createDrone();
await drone.connect();

let lastRcAt = 0;
let pilots = 0;

/**
 * Only the cockpit page itself may drive the drone or write recordings. Browsers let any page open
 * a WebSocket or POST to localhost, so a request from another origin is refused.
 */
function fromCockpit(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin === null || origin === `http://${req.headers.get("host")}`;
}

const server = Bun.serve({
  port: PORT,
  // The Quest reaches the Mac through `adb reverse`, which arrives on loopback; nothing else needs it.
  hostname: "127.0.0.1",
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
      pilots++;
      ws.subscribe(Topic.Video);
      ws.subscribe(Topic.Status);
    },
    message(_ws, message) {
      if (typeof message !== "string") return;
      const parsed = parseCockpitMessage(message);
      if (parsed) handle(parsed);
    },
    close() {
      pilots--;
      // Losing the cockpit must not leave the drone flying (PRD: safety).
      if (pilots === 0) drone.land();
    },
  },
});

function handle(message: CockpitMessage): void {
  switch (message.type) {
    case "rc": {
      const { leftRight, forwardBack, upDown, yaw } = message;
      lastRcAt = Date.now();
      drone.rc({ leftRight, forwardBack, upDown, yaw });
      return;
    }
    case "takeoff":
      drone.takeoff();
      return;
    case "land":
      drone.land();
      return;
    case "emergency":
      drone.emergency();
      return;
  }
}

setInterval(() => {
  if (Date.now() - lastRcAt > RC_WATCHDOG_MS) drone.rc(HOVER);
}, RC_WATCHDOG_MS);

setInterval(() => {
  const status: ServerMessage = { type: "status", drone: drone.name, battery: drone.battery() };
  server.publish(Topic.Status, JSON.stringify(status));
}, 1000);

console.log(`cockpit: http://localhost:${server.port}  (drone: ${drone.name})`);

for await (const accessUnit of drone.frames()) server.publish(Topic.Video, accessUnit);
