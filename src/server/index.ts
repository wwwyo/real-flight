import { mkdir } from "node:fs/promises";
import cockpit from "../cockpit/index.html";
import markers from "../cockpit/markers.html";
import { RECORDINGS_PATH, WS_PATH, type CockpitMessage, type ServerMessage } from "../shared/protocol";
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

const server = Bun.serve({
  port: PORT,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": cockpit,
    "/markers": markers,
    [RECORDINGS_PATH]: {
      POST: async (req) => {
        await mkdir(RECORDINGS_DIR, { recursive: true });
        const ext = req.headers.get("content-type")?.includes("mp4") ? "mp4" : "webm";
        const path = `${RECORDINGS_DIR}/sortie-${new Date().toISOString().replaceAll(":", "-")}.${ext}`;
        await Bun.write(path, req);
        console.log(`saved ${path}`);
        return Response.json({ path });
      },
    },
  },
  fetch(req, server) {
    if (new URL(req.url).pathname === WS_PATH && server.upgrade(req)) return;
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      pilots++;
      ws.subscribe("video");
      ws.subscribe("status");
    },
    message(_ws, message) {
      if (typeof message !== "string") return;
      handle(JSON.parse(message) as CockpitMessage);
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
    case "rc":
      lastRcAt = Date.now();
      drone.rc(message);
      return;
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
  server.publish("status", JSON.stringify(status));
}, 1000);

console.log(`cockpit: http://localhost:${server.port}  (drone: ${drone.name})`);

for await (const accessUnit of drone.frames()) server.publish("video", accessUnit);
