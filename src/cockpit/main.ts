import { HOVER, VIDEO_TIMEOUT_MS, WS_PATH, type CockpitMessage, type Command, type ControlRole, type ServerMessage } from "../shared/protocol";
import { TARGET_IDS } from "../shared/targets";
import { Controls } from "./controls";
import { MarkerDetector } from "./detector";
import { TargetLayer } from "./target-layer";
import { drawHud, isInReticle } from "./hud";
import { SortieRecorder } from "./recorder";
import { Sortie } from "./sortie";
import { VideoReceiver } from "./video";
import { XrCockpit } from "./xr";

const RC_INTERVAL_MS = 50;
const SAFETY_INTERVAL_MS = 100;
const DESK_INPUT_INTERVAL_MS = 16;
/** `?debug` shows decode/detection stats; off by default so they stay out of the sortie video. */
const DEBUG = new URLSearchParams(location.search).has("debug");
/** Keeps recording after landing so the sortie video shows the touchdown; a Tello takes a few seconds to come down. */
const RECORD_AFTER_LANDING_MS = 5000;

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const errorBox = document.querySelector<HTMLElement>("#error")!;
const ctx = canvas.getContext("2d")!;
// Keep the last raw view so warnings can be redrawn in XR and recordings without new video.
const rawView = new OffscreenCanvas(canvas.width, canvas.height);
const rawCtx = rawView.getContext("2d")!;
const reticle = { x: canvas.width / 2, y: canvas.height / 2, radius: canvas.height * 0.11 };

const targetIds = new Set<number>(TARGET_IDS);
const sortie = new Sortie(TARGET_IDS);
const detector = new MarkerDetector(canvas.width, canvas.height);
const targets = new TargetLayer();
const controls = new Controls();
const recorder = new SortieRecorder(canvas, (path) => console.info(`recording saved to ${path}`), showError);
/** Set while the error box shows a video error, which the next decoded frame clears. */
let videoErrorShown = false;
const xr = new XrCockpit(canvas, controlTick, () => runCommand("land"));
document.body.append(xr.button());

let battery: number | null = null;
let linkUp = false;
let role: ControlRole = "available";
let lastFrameAt: number | null = null;
let takeoffPending = false;
let safetyLandingSent = false;
let framesThisSecond = 0;
let fps = 0;
setInterval(() => ([fps, framesThisSecond] = [framesThisSecond, 0]), 1000);

function videoFresh(now = performance.now()): boolean {
  return lastFrameAt !== null && now - lastFrameAt <= VIDEO_TIMEOUT_MS;
}

function warningFor(now: number): string | null {
  if (!linkUp) return "接続が切れました — 操縦できません";
  if (!videoFresh(now)) return lastFrameAt === null ? "映像を待っています" : "映像が途切れました — 操縦できません";
  if (role === "observer") return "別のタブが操縦中です — 閲覧のみ";
  return null;
}

function render(shown = targets.track([], performance.now())): void {
  const now = performance.now();
  ctx.drawImage(rawView, 0, 0);
  targets.draw(ctx, shown, sortie.state, now);
  drawHud(ctx, {
    sortie: sortie.state,
    markers: shown,
    reticle,
    battery,
    recording: recorder.recording,
    linkUp,
    warning: warningFor(now),
    stats: DEBUG ? { fps, decodeQueue: video.queueSize, detectMs: detector.lastMs } : null,
  });
  xr.invalidate();
}

const video = new VideoReceiver((frame) => {
  try {
    rawCtx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  } finally {
    frame.close();
  }
  lastFrameAt = performance.now();
  if (videoErrorShown) {
    errorBox.textContent = "";
    videoErrorShown = false;
  }
  const markers = detector.detect(rawView).filter((m) => targetIds.has(m.id));
  const now = performance.now();
  const shown = targets.track(markers, now);
  const shotDown = sortie.update(now, markers.filter((m) => isInReticle(m.center, reticle)).map((m) => m.id));
  for (const id of shotDown) targets.explode(id, now);
  render(shown);
  framesThisSecond++;
}, (error) => {
  showError(error);
  videoErrorShown = true;
});

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
    switch (message.type) {
      case "status":
        battery = message.battery;
        break;
      case "control":
        role = message.role;
        render();
        break;
      case "command":
        if (message.command === "takeoff") {
          takeoffPending = false;
          if (message.accepted) {
            clearTimeout(stopRecordingTimer);
            safetyLandingSent = false;
            sortie.takeoff(performance.now());
            recorder.start();
          } else {
            showError(new Error("離陸できません。別のタブが操縦中か、すでに離陸しています。"));
          }
        } else if (message.accepted) {
          endSortie();
        }
        break;
    }
  };
  ws.onclose = () => {
    linkUp = false;
    takeoffPending = false;
    if (role === "pilot") endSortie();
    role = "available";
    lastFrameAt = null;
    render();
    setTimeout(connect, 1000);
  };
  socket = ws;
}
connect();

function send(message: CockpitMessage): boolean {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

let lastRcAt = 0;
let stopRecordingTimer: ReturnType<typeof setTimeout> | undefined;

function controlTick(xrSources?: XRInputSourceArray): void {
  const { rc, commands } = controls.read(xrSources);
  for (const command of commands) runCommand(command);
  const now = performance.now();
  if (now - lastRcAt >= RC_INTERVAL_MS) {
    if (role === "pilot") send({ type: "rc", ...(videoFresh(now) && sortie.airborne ? rc : HOVER) });
    lastRcAt = now;
  }
}

function runCommand(command: Command): void {
  if (role === "observer") return;
  if (command === "takeoff") {
    if (sortie.airborne || takeoffPending) return;
    if (!videoFresh()) {
      showError(new Error("映像が更新されるまで離陸できません。"));
      return;
    }
    if (recorder.recording) {
      showError(new Error("着陸後の録画が終わるまでお待ちください。"));
      return;
    }
    takeoffPending = send({ type: command });
  } else if (!send({ type: command })) {
    endSortie();
  }
}

function endSortie(): void {
  sortie.land(performance.now());
  clearTimeout(stopRecordingTimer);
  stopRecordingTimer = setTimeout(() => recorder.stop(), RECORD_AFTER_LANDING_MS);
  render();
}

// Runs independently of both decoded frames and the XR frame loop.
setInterval(() => {
  if (videoFresh()) return;
  if (role === "pilot" && sortie.airborne && !safetyLandingSent) {
    safetyLandingSent = true;
    send({ type: "rc", ...HOVER });
    runCommand("land");
  }
  sortie.update(performance.now(), []);
  render();
}, SAFETY_INTERVAL_MS);

// A timer rather than requestAnimationFrame: the browser pauses rAF for pages it considers hidden,
// which silently stopped stick input while video kept playing. In WebXR the XR frame loop reads input.
setInterval(() => {
  if (!xr.presenting) controlTick();
}, DESK_INPUT_INTERVAL_MS);

function showError(error: Error): void {
  videoErrorShown = false;
  console.error(error);
  errorBox.textContent = error.message;
}
