import { RECORDINGS_PATH } from "../shared/protocol";

// H.264 first: browsers usually encode it in hardware, leaving the CPU to decode and lock-on.
const MIME_TYPES = ["video/mp4;codecs=avc1", "video/webm;codecs=h264", "video/webm;codecs=vp8", "video/webm"];
/**
 * The Quest's default came out near 1.5 Mbps, re-encoding the Tello's already noisy picture into blocks.
 * Ten minutes at this rate stays well under the relay's upload limit.
 */
const VIDEO_BITS_PER_SECOND = 6_000_000;

/** Records the cockpit canvas (video + HUD) and uploads each recording to the Mac. */
export class SortieRecorder {
  private recorder?: MediaRecorder;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onSaved: (path: string) => void,
    private readonly onError: (error: Error) => void,
  ) {}

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  start(): void {
    if (this.recording) return;
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const stream = this.canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onerror = () => this.onError(new Error("録画が止まりました（MediaRecorder のエラー）"));
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      void this.upload(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.start(1000);
    this.recorder = recorder;
  }

  stop(): void {
    if (this.recording) this.recorder?.stop();
  }

  private async upload(blob: Blob): Promise<void> {
    try {
      const response = await fetch(RECORDINGS_PATH, { method: "POST", body: blob, headers: { "content-type": blob.type } });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      const { path } = (await response.json()) as { path: string };
      this.onSaved(path);
    } catch (error) {
      this.onError(error as Error);
    }
  }
}
