import { HOVER, VIDEO_TIMEOUT_MS, WS_PATH, type CockpitMessage, type Command, type ControlRole, type LogData, type RcInput, type ServerMessage } from "../shared/protocol";
import { TARGET_IDS } from "../shared/targets";
import { COMMAND_LABELS, Controls, describeRc } from "./controls";
import { MarkerDetector, type DetectedMarker } from "./detector";
import { onTorso, TargetLayer } from "./target-layer";
import { drawInstruments, drawSight, type HudInfo } from "./hud";
import { SortieRecorder } from "./recorder";
import { Sortie } from "./sortie";
import { VideoReceiver } from "./video";
import { XrCockpit } from "./xr";

const RC_INTERVAL_MS = 50;
const STALL_CHECK_INTERVAL_MS = 100;
const DESK_INPUT_INTERVAL_MS = 16;
/** `?debug` shows decode/detection stats; off by default so they stay out of the sortie video. */
const DEBUG = new URLSearchParams(location.search).has("debug");
/** Keeps recording after landing so the sortie video shows the touchdown; a Tello takes a few seconds to come down. */
const RECORD_AFTER_LANDING_MS = 5000;
const LOG_STATS_INTERVAL_MS = 1000;
/** How long the last button press and its answer stay on the HUD. */
const COMMAND_NOTE_MS = 3000;

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const errorBox = document.querySelector<HTMLElement>("#error")!;
const ctx = canvas.getContext("2d")!;
// Keep the last raw view so warnings can be redrawn in XR and recordings without new video.
const rawView = new OffscreenCanvas(canvas.width, canvas.height);
const rawCtx = rawView.getContext("2d")!;
/** The view at the video's depth in XR, and the readouts in front of it; the canvas shows both stacked. */
const sightView = layerLike(canvas);
const instrumentsView = layerLike(canvas);
const sightCtx = sightView.getContext("2d")!;
const instrumentsCtx = instrumentsView.getContext("2d")!;
const reticle = { x: canvas.width / 2, y: canvas.height / 2, radius: canvas.height * 0.11 };

const targetIds = new Set<number>(TARGET_IDS);
const sortie = new Sortie(TARGET_IDS);
const detector = new MarkerDetector(canvas.width, canvas.height);
const targets = new TargetLayer();
const controls = new Controls();
const recorder = new SortieRecorder(canvas, (path) => console.info(`recording saved to ${path}`), showError);
/** Set while the error box shows a video error, which the next decoded frame clears. */
let videoErrorShown = false;
const xr = new XrCockpit(sightView, instrumentsView, controlTick, () => {
  logEvent("xr-end");
  runCommand("land");
});
document.body.append(xr.button());

let battery: number | null = null;
let linkUp = false;
let role: ControlRole = "available";
let lastFrameAt: number | null = null;
/** When the view went stale, while it stays stale; logged once per stall. */
let stalledSince: number | null = null;
let takeoffPending = false;
let framesThisSecond = 0;
/** The stick as read, and what was last sent to the drone (null while nothing is sent). */
let stick: RcInput = HOVER;
let sentRc: RcInput | null = null;
let commandNote: { text: string; at: number } | null = null;
/** The targets on screen, including ones just missed by detection: what the pilot can shoot at. */
let shownMarkers: DetectedMarker[] = [];
/** Longest time a frame spent in the decoder since the last stats log; chunks are stamped with performance.now(). */
let maxDecodeMs = 0;
let fps = 0;
setInterval(() => ([fps, framesThisSecond] = [framesThisSecond, 0]), 1000);

function videoFresh(now = performance.now()): boolean {
  return lastFrameAt !== null && now - lastFrameAt <= VIDEO_TIMEOUT_MS;
}

function warningFor(now: number): string | null {
  if (!linkUp) return "接続が切れました — 操縦できません";
  if (!videoFresh(now)) {
    if (lastFrameAt === null) return "映像を待っています";
    // Flying on: the view may come back, and a drone that lands or freezes on its own surprises the pilot.
    return `映像が途切れています ${((now - lastFrameAt) / 1000).toFixed(1)}s — 操縦は効いています`;
  }
  if (role === "observer") return "別のタブが操縦中です — 閲覧のみ";
  return null;
}

function noteCommand(command: Command, outcome: string): void {
  commandNote = { text: `${COMMAND_LABELS[command]} ${outcome}`, at: performance.now() };
  render();
}

function sentLines(now: number): string[] {
  const lines: string[] = [];
  if (commandNote && now - commandNote.at <= COMMAND_NOTE_MS) lines.push(commandNote.text);
  if (sentRc) lines.push(`送信: ${describeRc(sentRc)}`);
  else if (describeRc(stick) !== describeRc(HOVER)) lines.push(`${describeRc(stick)}（地上のため未送信）`);
  return lines;
}

/** The live target under the reticle's centre, judged on the view the pilot sees. */
function aimedTarget(): number | null {
  const alive = new Set(sortie.state.remaining);
  return shownMarkers.find((m) => alive.has(m.id) && onTorso(m, reticle))?.id ?? null;
}

function shoot(now: number): void {
  const result = sortie.fire(now, aimedTarget());
  if (!result) return;
  if (result.shotDown && result.hit !== null) targets.explode(result.hit, now);
  logEvent("shot", { hit: result.hit, shotDown: result.shotDown });
  render();
}

function render(shown = targets.track([], performance.now())): void {
  const now = performance.now();
  shownMarkers = shown;
  const hud: HudInfo = {
    sortie: sortie.state,
    markers: shown,
    reticle,
    aimed: aimedTarget() !== null,
    battery,
    recording: recorder.recording,
    linkUp,
    warning: warningFor(now),
    sent: sentLines(now),
    stats: DEBUG ? { fps, decodeQueue: video.queueSize, detectMs: detector.lastMs } : null,
  };
  sightCtx.drawImage(rawView, 0, 0);
  targets.draw(sightCtx, shown, sortie.state, now);
  drawSight(sightCtx, hud, now);
  instrumentsCtx.clearRect(0, 0, instrumentsView.width, instrumentsView.height);
  drawInstruments(instrumentsCtx, hud);
  ctx.drawImage(sightView, 0, 0);
  ctx.drawImage(instrumentsView, 0, 0);
  xr.invalidate();
}

const video = new VideoReceiver((frame) => {
  maxDecodeMs = Math.max(maxDecodeMs, performance.now() - frame.timestamp / 1000);
  try {
    rawCtx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  } finally {
    frame.close();
  }
  lastFrameAt = performance.now();
  if (stalledSince !== null) {
    logEvent("video-resume", { stalledMs: Math.round(lastFrameAt - stalledSince) });
    stalledSince = null;
  }
  if (videoErrorShown) {
    errorBox.textContent = "";
    videoErrorShown = false;
  }
  const markers = detector.detect(rawView).filter((m) => targetIds.has(m.id));
  const now = performance.now();
  sortie.update(now);
  render(targets.track(markers, now));
  framesThisSecond++;
}, (error) => {
  logEvent("decoder-error", { message: error.message });
  showError(error);
  videoErrorShown = true;
});

let socket: WebSocket | undefined;
function connect(): void {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${WS_PATH}`);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => {
    linkUp = true;
    logEvent("link-open", { xr: xr.presenting });
  };
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
        noteCommand(message.command, message.accepted ? "✓ 受理" : "✗ 拒否");
        if (message.command === "takeoff") {
          takeoffPending = false;
          if (message.accepted) {
            // A refusal from an earlier attempt no longer applies.
            errorBox.textContent = "";
            clearTimeout(stopRecordingTimer);
            sortie.takeoff(performance.now());
            recorder.start();
            logEvent("recording-start", { recording: recorder.recording });
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
  const { rc, commands, fire } = controls.read(xrSources);
  stick = rc;
  for (const command of commands) runCommand(command);
  const now = performance.now();
  if (fire && sortie.canFire(now)) shoot(now);
  if (now - lastRcAt >= RC_INTERVAL_MS) {
    sentRc = null;
    if (role === "pilot") {
      const input = sortie.airborne ? rc : HOVER;
      // The relay ignores stick input on the ground, so only airborne input counts as sent.
      if (send({ type: "rc", ...input }) && sortie.airborne) sentRc = input;
    }
    lastRcAt = now;
  }
}

function logEvent(event: string, data: LogData = {}): void {
  send({ type: "log", event, data });
}

function runCommand(command: Command): void {
  if (role === "observer") {
    logEvent("command-blocked", { command, reason: "observer" });
    noteCommand(command, "✗ 未送信（別のタブが操縦中）");
    return;
  }
  if (command === "takeoff") {
    if (sortie.airborne || takeoffPending) {
      logEvent("command-blocked", { command, reason: sortie.airborne ? "airborne" : "pending" });
      noteCommand(command, sortie.airborne ? "✗ 未送信（飛行中）" : "… 返事待ち");
      return;
    }
    if (!videoFresh()) {
      noteCommand(command, "✗ 未送信（映像なし）");
      showError(new Error("映像が更新されるまで離陸できません。"));
      return;
    }
    if (recorder.recording) {
      noteCommand(command, "✗ 未送信（録画の終了待ち）");
      showError(new Error("着陸後の録画が終わるまでお待ちください。"));
      return;
    }
    takeoffPending = send({ type: command });
    noteCommand(command, takeoffPending ? "→ 送信" : "✗ 未送信（接続なし）");
  } else if (send({ type: command })) {
    noteCommand(command, "→ 送信");
  } else {
    noteCommand(command, "✗ 未送信（接続なし）");
    endSortie();
  }
}

function endSortie(): void {
  sortie.land(performance.now());
  clearTimeout(stopRecordingTimer);
  stopRecordingTimer = setTimeout(() => {
    logEvent("recording-stop", { recording: recorder.recording });
    recorder.stop();
  }, RECORD_AFTER_LANDING_MS);
  render();
}

// Runs independently of both decoded frames and the XR frame loop.
setInterval(() => {
  if (videoFresh()) return;
  if (stalledSince === null && lastFrameAt !== null) {
    stalledSince = lastFrameAt;
    logEvent("video-stall", { airborne: sortie.airborne, decodeQueue: video.queueSize });
  }
  sortie.update(performance.now());
  render();
}, STALL_CHECK_INTERVAL_MS);

// A timer rather than requestAnimationFrame: the browser pauses rAF for pages it considers hidden,
// which silently stopped stick input while video kept playing. In WebXR the XR frame loop reads input.
setInterval(() => {
  if (!xr.presenting) controlTick();
}, DESK_INPUT_INTERVAL_MS);

// What the pilot saw each second, for the Mac's link log.
setInterval(() => {
  const now = performance.now();
  logEvent("stats", {
    fps,
    decodeQueue: video.queueSize,
    maxDecodeMs: Math.round(maxDecodeMs),
    detectMs: Math.round(detector.lastMs * 10) / 10,
    ...video.takeCounts(),
    sinceFrameMs: lastFrameAt === null ? null : Math.round(now - lastFrameAt),
    role,
    airborne: sortie.airborne,
    xr: xr.presenting,
    warning: warningFor(now),
  });
  maxDecodeMs = 0;
}, LOG_STATS_INTERVAL_MS);

function showError(error: Error): void {
  logEvent("cockpit-error", { message: error.message });
  videoErrorShown = false;
  console.error(error);
  errorBox.textContent = error.message;
}

function layerLike(source: HTMLCanvasElement): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = source.width;
  layer.height = source.height;
  return layer;
}
