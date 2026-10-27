import { describe, expect, test } from "bun:test";
import { MAX_LOG_TEXT, parseCockpitMessage } from "./protocol";

describe("parseCockpitMessage", () => {
  test("accepts commands and stick input", () => {
    expect(parseCockpitMessage('{"type":"emergency"}')).toEqual({ type: "emergency" });
    expect(parseCockpitMessage('{"type":"rc","leftRight":10,"forwardBack":-20,"upDown":0,"yaw":5}')).toEqual({
      type: "rc",
      leftRight: 10,
      forwardBack: -20,
      upDown: 0,
      yaw: 5,
    });
  });

  test("clamps stick input to whole numbers within the drone's range", () => {
    expect(parseCockpitMessage('{"type":"rc","leftRight":250,"forwardBack":-1e9,"upDown":12.6,"yaw":0}')).toEqual({
      type: "rc",
      leftRight: 100,
      forwardBack: -100,
      upDown: 13,
      yaw: 0,
    });
  });

  test("accepts flat cockpit logs within the size limit", () => {
    expect(parseCockpitMessage('{"type":"log","event":"video-stall","data":{"ms":1200,"reason":null}}')).toEqual({
      type: "log",
      event: "video-stall",
      data: { ms: 1200, reason: null },
    });
    for (const text of [
      '{"type":"log","event":"Bad Event","data":{}}',
      '{"type":"log","event":"stats","data":{"nested":{"a":1}}}',
      '{"type":"log","event":"stats","data":[]}',
      `{"type":"log","event":"stats","data":{"pad":"${"x".repeat(MAX_LOG_TEXT)}"}}`,
    ]) {
      expect(parseCockpitMessage(text)).toBeNull();
    }
  });

  test("rejects anything else", () => {
    for (const text of ["not json", "null", "[]", '{"type":"flip"}', '{"type":"rc","leftRight":"1","forwardBack":0,"upDown":0,"yaw":0}', '{"type":"rc"}']) {
      expect(parseCockpitMessage(text)).toBeNull();
    }
  });
});
