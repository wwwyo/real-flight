import { AccessUnitSplitter } from "../../shared/h264";
import type { LogData, RcInput } from "../../shared/protocol";
import type { Drone } from "./drone";

const TELLO_IP = "192.168.10.1";
const COMMAND_PORT = 8889;
/**
 * The Tello keeps answering the port that first sent it `command` until it is switched off. A random
 * port per relay start left a restarted relay without replies, showing DRONE LOST while the drone
 * still obeyed; a fixed port lets every restart pick up the replies.
 */
const REPLY_PORT = 8889;
const STATE_PORT = 8890;
const VIDEO_PORT = 11111;
// Tello splits each frame into 1460-byte packets; a shorter one ends the frame.
const FULL_VIDEO_PACKET = 1460;
/** Tello sends state about 10 times a second once in SDK mode; silence this long means it is gone. */
const STATE_TIMEOUT_MS = 3000;
/** Pause between handshakes while the Tello is off or the Mac is not on its Wi-Fi. */
const RETRY_MS = 2000;

/** DJI Ryze Tello over the Tello SDK (text commands over UDP). */
export class Tello implements Drone {
  readonly name = "tello";
  private commandSocket?: Bun.udp.Socket<"buffer">;
  private replies: ((text: string) => void)[] = [];
  private batteryPercent: number | null = null;
  private lastStateAt: number | null = null;
  private isLinked = false;
  private video = new TransformStream<Uint8Array, Uint8Array>();

  constructor(private readonly log: (event: string, data?: LogData) => void = () => {}) {}

  async connect(): Promise<void> {
    this.commandSocket = await Bun.udpSocket({
      port: REPLY_PORT,
      socket: {
        data: (_socket, buf) => {
          const reply = buf.toString().trim();
          const waiting = this.replies.shift();
          // Fire-and-forget commands get replies too; an "error" there is why the drone did not move.
          if (waiting) waiting(reply);
          else this.log("tello-reply", { reply });
        },
      },
    });
    await Bun.udpSocket({
      port: STATE_PORT,
      socket: {
        data: (_socket, buf) => {
          this.lastStateAt = performance.now();
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

    void this.keepLinked();
  }

  /**
   * Shakes hands until the Tello answers, and again whenever its state stops: a Tello that was switched
   * off and on, or a Mac that rejoined its Wi-Fi, needs `command` and `streamon` again before it sends
   * anything. The relay keeps serving the cockpit meanwhile, so it can start before the drone.
   */
  private async keepLinked(): Promise<void> {
    for (;;) {
      if (!this.isLinked) {
        try {
          await this.request("command");
          await this.request("streamon");
          this.isLinked = true;
          this.lastStateAt = performance.now();
          this.log("tello-linked");
        } catch {
          // Logged by request(); try again after a pause.
        }
      } else if (performance.now() - (this.lastStateAt ?? 0) > STATE_TIMEOUT_MS) {
        this.isLinked = false;
        this.batteryPercent = null;
        this.log("tello-lost", { silentMs: STATE_TIMEOUT_MS });
        continue;
      }
      await Bun.sleep(this.isLinked ? 500 : RETRY_MS);
    }
  }

  linked(): boolean {
    return this.isLinked;
  }

  rc({ leftRight, forwardBack, upDown, yaw }: RcInput): void {
    this.send(`rc ${leftRight} ${forwardBack} ${upDown} ${yaw}`);
  }

  takeoff(): void {
    this.command("takeoff");
  }

  land(): void {
    this.command("land");
  }

  emergency(): void {
    this.command("emergency");
  }

  frames(): AsyncIterable<Uint8Array> {
    return this.video.readable;
  }

  battery(): number | null {
    return this.batteryPercent;
  }

  private command(command: string): void {
    this.log("tello-send", { command, battery: this.batteryPercent });
    this.send(command);
  }

  private send(command: string): void {
    try {
      this.commandSocket?.send(command, COMMAND_PORT, TELLO_IP);
    } catch (error) {
      // Off the Tello's Wi-Fi the address can be unreachable; the handshake loop covers that case.
      this.log("tello-send-failed", { command, error: (error as Error).message });
    }
  }

  /** Retries because a reply can be lost, or answered by a stray datagram, on UDP. */
  private async request(command: string, attempts = 2): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.requestOnce(command);
        this.log("tello-ready", { command, attempt });
        return;
      } catch (error) {
        this.log("tello-retry", { command, attempt, error: (error as Error).message });
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
