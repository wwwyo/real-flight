import { codecFromAccessUnit, isKeyAccessUnit } from "../shared/h264";

/**
 * Decodes H.264 access units with WebCodecs. Frames are dropped until a key frame with an SPS
 * arrives, so the cockpit can join a stream at any point.
 */
export class VideoReceiver {
  private decoder: VideoDecoder;
  private configured = false;
  private configuring = false;

  constructor(
    onFrame: (frame: VideoFrame) => void,
    private readonly onError: (error: Error) => void,
  ) {
    this.decoder = new VideoDecoder({
      output: onFrame,
      error: (error) => {
        this.configured = false;
        onError(error);
      },
    });
  }

  get queueSize(): number {
    return this.decoder.decodeQueueSize;
  }

  push(accessUnit: Uint8Array): void {
    const key = isKeyAccessUnit(accessUnit);
    if (this.configured) {
      this.decode(accessUnit, key);
      return;
    }
    const codec = key ? codecFromAccessUnit(accessUnit) : null;
    if (!codec || this.configuring) return;
    this.configuring = true;
    this.configure(codec, accessUnit)
      .catch(this.onError)
      .finally(() => (this.configuring = false));
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
    this.configured = true;
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
