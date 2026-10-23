import { AccessUnitSplitter } from "../../shared/h264";
import type { RcInput } from "../../shared/protocol";
import type { Drone } from "./drone";

const TELLO_IP = "192.168.10.1";
const COMMAND_PORT = 8889;
const STATE_PORT = 8890;
const VIDEO_PORT = 11111;
// Tello splits each frame into 1460-byte packets; a shorter one ends the frame.
const FULL_VIDEO_PACKET = 1460;

/** DJI Ryze Tello over the Tello SDK (text commands over UDP). */
export class Tello implements Drone {
  readonly name = "tello";
  private commandSocket?: Bun.udp.Socket<"buffer">;
  private replies: ((text: string) => void)[] = [];
  private batteryPercent: number | null = null;
  private video = new TransformStream<Uint8Array, Uint8Array>();

  async connect(): Promise<void> {
    this.commandSocket = await Bun.udpSocket({
      socket: {
        data: (_socket, buf) => this.replies.shift()?.(buf.toString().trim()),
      },
    });
    await Bun.udpSocket({
      port: STATE_PORT,
      socket: {
        data: (_socket, buf) => {
          const match = /bat:(\d+)/.exec(buf.toString());
          if (match) this.batteryPercent = Number(match[1]);
        },
      },
    });
    const splitter = new AccessUnitSplitter();
    const writer = this.video.writable.getWriter();
    await Bun.udpSocket({
      port: VIDEO_PORT,
      socket: {
        data: (_socket, buf) => {
          const units = splitter.push(buf);
          if (buf.length < FULL_VIDEO_PACKET) units.push(...splitter.flush());
          for (const unit of units) void writer.write(unit);
        },
      },
    });

    await this.request("command");
    await this.request("streamon");
  }

  rc({ leftRight, forwardBack, upDown, yaw }: RcInput): void {
    this.send(`rc ${leftRight} ${forwardBack} ${upDown} ${yaw}`);
  }

  takeoff(): void {
    this.send("takeoff");
  }

  land(): void {
    this.send("land");
  }

  emergency(): void {
    this.send("emergency");
  }

  frames(): AsyncIterable<Uint8Array> {
    return this.video.readable;
  }

  battery(): number | null {
    return this.batteryPercent;
  }

  private send(command: string): void {
    this.commandSocket?.send(command, COMMAND_PORT, TELLO_IP);
  }

  /** Retries because a reply can be lost, or answered by a stray datagram, on UDP. */
  private async request(command: string, attempts = 3): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.requestOnce(command);
      } catch (error) {
        if (attempt >= attempts) throw error;
      }
    }
  }

  private requestOnce(command: string, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const onReply = (reply: string) => {
        clearTimeout(timer);
        if (reply === "ok") resolve();
        else reject(new Error(`Tello answered "${reply}" to "${command}"`));
      };
      const timer = setTimeout(() => {
        this.replies = this.replies.filter((waiting) => waiting !== onReply);
        reject(new Error(`Tello did not answer "${command}"`));
      }, timeoutMs);
      this.replies.push(onReply);
      this.send(command);
    });
  }
}
