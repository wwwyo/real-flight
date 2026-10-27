import { describe, expect, test } from "bun:test";
import { HOVER } from "../shared/protocol";
import { describeRc } from "./controls";

describe("describeRc", () => {
  test("names each moving axis with its direction and percent", () => {
    expect(describeRc({ leftRight: 0, forwardBack: 60, upDown: 0, yaw: 40 })).toBe("右旋回 40% / 前進 60%");
    expect(describeRc({ leftRight: -25, forwardBack: -10, upDown: -100, yaw: -5 })).toBe("左旋回 5% / 後退 10% / 左移動 25% / 下降 100%");
  });

  test("calls centred sticks a hover", () => {
    expect(describeRc(HOVER)).toBe("ホバリング");
  });
});
