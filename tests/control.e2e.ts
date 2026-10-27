import { expect, test } from "e2e";
import type { Command, ControlRole, ServerMessage } from "../src/shared/protocol";

class Cockpit {
  readonly socket: WebSocket;
  role: ControlRole | null = null;
  drone: string | null = null;
  private replies: Extract<ServerMessage, { type: "command" }>[] = [];

  constructor(baseUrl: string) {
    const url = new URL("/ws", baseUrl);
    url.protocol = "ws:";
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", ({ data }) => {
      if (typeof data !== "string") return;
      const message = JSON.parse(data) as ServerMessage;
      if (message.type === "control") this.role = message.role;
      if (message.type === "status") this.drone = message.drone;
      if (message.type === "command") this.replies.push(message);
    });
  }

  async command(command: Command): Promise<boolean> {
    this.socket.send(JSON.stringify({ type: command }));
    await expect.poll(() => this.replies.length).toBe(1);
    const reply = this.replies.shift()!;
    expect(reply.command).toBe(command);
    return reply.accepted;
  }

  close(): void {
    this.socket.close();
  }
}

// PRD safety: extra cockpit connections must neither steer nor keep the pilot's drone airborne.
test("only the cockpit that takes off owns control, and its disconnect releases it", async () => {
  const baseUrl = process.env.REAL_FLIGHT_TEST_URL ?? "http://localhost:8080";
  const first = new Cockpit(baseUrl);
  const second = new Cockpit(baseUrl);
  try {
    // These checks send flight commands, so never run them against a real drone.
    await expect.poll(() => [first.drone, second.drone]).toEqual(["sim", "sim"]);
    await expect.poll(() => [first.role, second.role]).toEqual(["available", "available"]);
    expect(await first.command("takeoff")).toBe(true);
    await expect.poll(() => [first.role, second.role]).toEqual(["pilot", "observer"]);

    expect(await second.command("takeoff")).toBe(false);
    expect(await second.command("land")).toBe(false);
    expect(await second.command("emergency")).toBe(false);
    expect(await first.command("takeoff")).toBe(false);

    // The owner's drone keeps hovering after its disconnect, and take-off from another cockpit takes it back.
    first.close();
    await expect.poll(() => second.role).toBe("available");
    expect(await second.command("takeoff")).toBe(true);
    await expect.poll(() => second.role).toBe("pilot");
    expect(await second.command("takeoff")).toBe(false);
    expect(await second.command("land")).toBe(true);
    expect(await second.command("takeoff")).toBe(true);
    expect(await second.command("emergency")).toBe(true);
  } finally {
    first.close();
    second.close();
    await expect.poll(() => second.socket.readyState).toBe(WebSocket.CLOSED);
  }
});
