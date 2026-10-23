import { describe, expect, test } from "bun:test";
import { AccessUnitSplitter, codecFromAccessUnit, isKeyAccessUnit, nalType, splitNals } from "./h264";

const START = [0, 0, 0, 1];
const sps = [...START, 0x67, 0x42, 0x00, 0x1f, 0xab];
const pps = [...START, 0x68, 0xce, 0x3c, 0x80];
/** Slice NALs; 0x88/0x9a set the first bit of first_mb_in_slice, i.e. the first slice of a picture. */
const idr = [...START, 0x65, 0x88, 0x84, 0x00];
const slice = [...START, 0x41, 0x9a, 0x02, 0x03];
const secondSlice = [...START, 0x41, 0x40, 0x02, 0x03];

const stream = new Uint8Array([...sps, ...pps, ...idr, ...slice, ...secondSlice, ...slice]);

function splitInChunks(data: Uint8Array, size: number): Uint8Array[] {
  const splitter = new AccessUnitSplitter();
  const units: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) units.push(...splitter.push(data.subarray(i, i + size)));
  units.push(...splitter.flush());
  return units;
}

describe("AccessUnitSplitter", () => {
  test("groups NALs into one access unit per picture", () => {
    const units = splitInChunks(stream, stream.length);
    expect(units.map((u) => splitNals(u).map(nalType))).toEqual([[7, 8, 5], [1, 1], [1]]);
  });

  test("gives the same access units whatever the chunk boundaries", () => {
    const whole = splitInChunks(stream, stream.length);
    for (const size of [1, 2, 3, 5, 7]) expect(splitInChunks(stream, size)).toEqual(whole);
  });

  test("skips bytes before the first start code, as when joining a stream mid-frame", () => {
    const joined = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, ...stream]);
    for (const size of [1, 3, 4, joined.length]) {
      expect(splitInChunks(joined, size)).toEqual(splitInChunks(stream, stream.length));
    }
  });

  test("keeps SPS/PPS flushed on their own for the frame that follows", () => {
    const splitter = new AccessUnitSplitter();
    splitter.push(new Uint8Array([...sps, ...pps]));
    expect(splitter.flush()).toEqual([]);
    splitter.push(new Uint8Array(idr));
    const [unit] = splitter.flush();
    expect(splitNals(unit!).map(nalType)).toEqual([7, 8, 5]);
  });

  test("holds the last picture until the next one starts or the source flushes", () => {
    const splitter = new AccessUnitSplitter();
    expect(splitter.push(new Uint8Array([...sps, ...pps, ...idr]))).toEqual([]);
    expect(splitter.flush()).toHaveLength(1);
  });
});

describe("access unit helpers", () => {
  const [key, delta] = splitInChunks(stream, stream.length);

  test("only an access unit with an IDR slice is a key frame", () => {
    expect(isKeyAccessUnit(key!)).toBe(true);
    expect(isKeyAccessUnit(delta!)).toBe(false);
  });

  test("builds the codec string from the SPS profile, constraints and level", () => {
    expect(codecFromAccessUnit(key!)).toBe("avc1.42001f");
    expect(codecFromAccessUnit(delta!)).toBeNull();
  });
});
