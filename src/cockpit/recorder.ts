import { RECORDINGS_PATH } from "../shared/protocol";

const MIME_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];

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
    const recorder = new MediaRecorder(this.canvas.captureStream(30), { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => void this.upload(new Blob(chunks, { type: recorder.mimeType }));
    recorder.start(1000);
    this.recorder = recorder;
  }

  stop(): void {
    if (this.recording) this.recorder!.stop();
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
