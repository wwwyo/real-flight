import { WS_PATH, type CockpitMessage, type Command, type ServerMessage } from "../shared/protocol";
import { TARGET_IDS } from "../shared/targets";
import { Controls } from "./controls";
import { MarkerDetector, type DetectedMarker } from "./detector";
import { drawHud, isInReticle } from "./hud";
import { SortieRecorder } from "./recorder";
import { Sortie } from "./sortie";
import { VideoReceiver } from "./video";
import { XrCockpit } from "./xr";

const RC_INTERVAL_MS = 50;
const DESK_INPUT_INTERVAL_MS = 16;
/** `?debug` shows decode/detection stats; off by default so they stay out of the sortie video. */
const DEBUG = new URLSearchParams(location.search).has("debug");
/** Keeps recording after landing so the sortie video shows the touchdown. */
const RECORD_AFTER_LANDING_MS = 3000;

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const errorBox = document.querySelector<HTMLElement>("#error")!;
const ctx = canvas.getContext("2d")!;
const reticle = { x: canvas.width / 2, y: canvas.height / 2, radius: canvas.height * 0.11 };

const sortie = new Sortie(TARGET_IDS);
const detector = new MarkerDetector(canvas.width, canvas.height);
const controls = new Controls();
const recorder = new SortieRecorder(canvas, (path) => console.info(`recording saved to ${path}`), showError);
const xr = new XrCockpit(canvas, controlTick, () => runCommand("land"));
document.body.append(xr.button());

let markers: DetectedMarker[] = [];
let battery: number | null = null;
let linkUp = false;
let framesThisSecond = 0;
let fps = 0;
setInterval(() => ([fps, framesThisSecond] = [framesThisSecond, 0]), 1000);

const video = new VideoReceiver((frame) => {
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  markers = detector.detect(frame);
  frame.close();
  const now = performance.now();
  sortie.update(now, markers.filter((m) => isInReticle(m.center, reticle)).map((m) => m.id));
  drawHud(ctx, {
    sortie: sortie.state,
    markers,
    reticle,
    battery,
    recording: recorder.recording,
    linkUp,
    stats: DEBUG ? { fps, decodeQueue: video.queueSize, detectMs: detector.lastMs } : null,
  });
  xr.invalidate();
  framesThisSecond++;
}, showError);

let socket: WebSocket | undefined;
function connect(): void {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${WS_PATH}`);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => (linkUp = true);
  ws.onmessage = ({ data }) => {
    if (data instanceof ArrayBuffer) {
      video.push(new Uint8Array(data));
      return;
    }
    const message = JSON.parse(data as string) as ServerMessage;
    if (message.type === "status") battery = message.battery;
  };
  ws.onclose = () => {
    linkUp = false;
    setTimeout(connect, 1000);
  };
  socket = ws;
}
connect();

function send(message: CockpitMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

let lastRcAt = 0;
let stopRecordingTimer: ReturnType<typeof setTimeout> | undefined;

function controlTick(xrSources?: XRInputSourceArray): void {
  const { rc, commands } = controls.read(xrSources);
  for (const command of commands) runCommand(command);
  const now = performance.now();
  if (now - lastRcAt >= RC_INTERVAL_MS) {
    send({ type: "rc", ...rc });
    lastRcAt = now;
  }
}

function runCommand(command: Command): void {
  send({ type: command });
  const now = performance.now();
  if (command === "takeoff") {
    clearTimeout(stopRecordingTimer);
    sortie.takeoff(now);
    recorder.start();
  } else {
    sortie.land(now);
    stopRecordingTimer = setTimeout(() => recorder.stop(), RECORD_AFTER_LANDING_MS);
  }
}

// A timer rather than requestAnimationFrame: the browser pauses rAF for pages it considers hidden,
// which silently stopped stick input while video kept playing. In WebXR the XR frame loop reads input.
setInterval(() => {
  if (!xr.presenting) controlTick();
}, DESK_INPUT_INTERVAL_MS);

function showError(error: Error): void {
  console.error(error);
  errorBox.textContent = error.message;
}
