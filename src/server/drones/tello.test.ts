import { expect, test } from "bun:test";
import { parseState } from "./tello";

test("parseState reads every field of a state packet as a number", () => {
  const packet = "pitch:-3;roll:1;yaw:-87;vgx:12;vgy:0;vgz:0;templ:60;temph:62;tof:84;h:80;bat:87;baro:12.34;time:5;agx:-9.00;agy:3.00;agz:-998.00;\r\n";
  expect(parseState(packet)).toEqual({
    pitch: -3, roll: 1, yaw: -87, vgx: 12, vgy: 0, vgz: 0, templ: 60, temph: 62, tof: 84, h: 80,
    bat: 87, baro: 12.34, time: 5, agx: -9, agy: 3, agz: -998,
  });
});

test("parseState skips fields that are not numbers", () => {
  expect(parseState("mid:-1;x:abc;bat:50;")).toEqual({ mid: -1, bat: 50 });
});
