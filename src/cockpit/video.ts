import { codecFromAccessUnit, isKeyAccessUnit } from "../shared/h264";

/**
 * Frames waiting in the decoder beyond this are stale: the pilot would see the past.
 * Rather than queue them, drop to the next key frame.
 */
const MAX_DECODE_QUEUE = 2;

/**
 * Decodes H.264 access units with WebCodecs. Frames are dropped until a key frame with an SPS
 * arrives, so the cockpit can join a stream at any point.
 */
export class VideoReceiver {
  private decoder: VideoDecoder;
  /** "waiting-key": configured, but skipping frames until the next key frame. */
  private state: "unconfigured" | "configuring" | "waiting-key" | "decoding" = "unconfigured";

  constructor(
    onFrame: (frame: VideoFrame) => void,
    private readonly onError: (error: Error) => void,
  ) {
    this.decoder = new VideoDecoder({
      output: onFrame,
      error: (error) => {
        this.state = "unconfigured";
        onError(error);
      },
    });
  }

  get queueSize(): number {
    return this.decoder.decodeQueueSize;
  }

  push(accessUnit: Uint8Array): void {
    const key = isKeyAccessUnit(accessUnit);
    switch (this.state) {
      case "configuring":
        return;
      case "unconfigured": {
        const codec = key ? codecFromAccessUnit(accessUnit) : null;
        if (!codec) return;
        this.state = "configuring";
        this.configure(codec, accessUnit).catch((error: Error) => {
          this.state = "unconfigured";
          this.onError(error);
        });
        return;
      }
      case "decoding":
        if (!key && this.decoder.decodeQueueSize > MAX_DECODE_QUEUE) {
          this.state = "waiting-key";
          return;
        }
        this.decode(accessUnit, key);
        return;
      case "waiting-key":
        if (!key) return;
        this.state = "decoding";
        this.decode(accessUnit, key);
        return;
    }
  }

  private async configure(codec: string, firstKey: Uint8Array): Promise<void> {
    // No `description`: WebCodecs then expects Annex B, which is what the drone sends.
    const config: VideoDecoderConfig = { codec, optimizeForLatency: true };
    const { supported } = await VideoDecoder.isConfigSupported(config);
    if (!supported) throw new Error(`This browser cannot decode ${codec}`);
    if (this.decoder.state === "closed") {
      throw new Error("The video decoder was closed after an error; reload the cockpit");
    }
    this.decoder.configure(config);
    this.state = "decoding";
    this.decode(firstKey, true);
  }

  private decode(accessUnit: Uint8Array, key: boolean): void {
    this.decoder.decode(
      new EncodedVideoChunk({
        type: key ? "key" : "delta",
        timestamp: Math.round(performance.now() * 1000),
        data: accessUnit,
      }),
    );
  }
}
