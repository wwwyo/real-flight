import { describe, expect, test } from "bun:test";
import { HOVER } from "../shared/protocol";
import { flipDirection } from "./controls";

describe("flipDirection", () => {
  test("follows the right stick's stronger axis", () => {
    expect(flipDirection({ ...HOVER, forwardBack: 40 })).toBe("f");
    expect(flipDirection({ ...HOVER, forwardBack: -40, leftRight: 10 })).toBe("b");
    expect(flipDirection({ ...HOVER, leftRight: -40, forwardBack: 10 })).toBe("l");
    expect(flipDirection({ ...HOVER, leftRight: 40 })).toBe("r");
  });

  test("goes backward with the stick centred, whatever the left stick does", () => {
    expect(flipDirection({ ...HOVER, yaw: 40, upDown: 40 })).toBe("b");
  });
});
