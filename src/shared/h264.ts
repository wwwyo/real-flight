/** NAL unit types this project cares about (ITU-T H.264 Table 7-1). */
export const NalType = {
  Slice: 1,
  IdrSlice: 5,
  Sei: 6,
  Sps: 7,
  Pps: 8,
  AccessUnitDelimiter: 9,
} as const;

/** Returns the NAL unit type of a NAL that starts with an Annex B start code. */
export function nalType(nal: Uint8Array): number {
  return nal[startCodeLength(nal)]! & 0x1f;
}

function startCodeLength(nal: Uint8Array): number {
  return nal[2] === 1 ? 3 : 4;
}

function isVcl(type: number): boolean {
  return type === NalType.Slice || type === NalType.IdrSlice;
}

/** Splits an Annex B buffer into NAL units, each keeping its start code. */
export function splitNals(data: Uint8Array): Uint8Array[] {
  const starts = findStartCodes(data);
  return starts.map((start, i) => data.subarray(start, starts[i + 1] ?? data.length));
}

function findStartCodes(data: Uint8Array, from = 0): number[] {
  const starts: number[] = [];
  for (let i = from; i + 2 < data.length; i++) {
    if (data[i] !== 0 || data[i + 1] !== 0) continue;
    if (data[i + 2] === 1) {
      starts.push(i > 0 && data[i - 1] === 0 ? i - 1 : i);
      i += 2;
    }
  }
  return starts;
}

/** True when the access unit holds an IDR slice, i.e. decoding can start here. */
export function isKeyAccessUnit(accessUnit: Uint8Array): boolean {
  return splitNals(accessUnit).some((nal) => nalType(nal) === NalType.IdrSlice);
}

/**
 * Builds the WebCodecs codec string (`avc1.PPCCLL`) from the first SPS in the access unit.
 * Returns null when the access unit carries no SPS.
 */
export function codecFromAccessUnit(accessUnit: Uint8Array): string | null {
  const sps = splitNals(accessUnit).find((nal) => nalType(nal) === NalType.Sps);
  if (!sps) return null;
  const body = startCodeLength(sps) + 1;
  const hex = (byte: number) => byte.toString(16).padStart(2, "0");
  return `avc1.${hex(sps[body]!)}${hex(sps[body + 1]!)}${hex(sps[body + 2]!)}`;
}

/**
 * Regroups an Annex B byte stream, fed in arbitrary chunks, into access units (one per frame).
 * A frame is only known to be complete when the next one starts, unless the source calls flush().
 */
export class AccessUnitSplitter {
  /** Bytes after the last start code seen, or bytes before the first one (pendingIsNal false). */
  private pending: Uint8Array = new Uint8Array(0);
  private pendingIsNal = false;
  private current: Uint8Array[] = [];
  private currentHasVcl = false;

  /** Feeds bytes and returns the access units completed by them. */
  push(chunk: Uint8Array): Uint8Array[] {
    // Only the new bytes (plus a possibly split start code) can hold start codes not yet seen.
    const scanFrom = Math.max(0, this.pending.length - 3);
    const data = concat([this.pending, chunk]);
    const starts = findStartCodes(data, scanFrom);
    if (this.pendingIsNal && starts[0] !== 0) starts.unshift(0);
    const done: Uint8Array[] = [];
    if (starts.length === 0) {
      // Bytes before the first start code belong to a NAL whose start we missed; keep only what
      // could be the beginning of a start code.
      this.pending = data.slice(-3);
      return done;
    }
    for (let i = 0; i < starts.length - 1; i++) {
      this.addNal(data.subarray(starts[i]!, starts[i + 1]!), done);
    }
    this.pending = data.slice(starts.at(-1)!);
    this.pendingIsNal = true;
    return done;
  }

  /** Treats everything received so far as the end of a frame. */
  flush(): Uint8Array[] {
    const done: Uint8Array[] = [];
    if (this.pendingIsNal) this.addNal(this.pending, done);
    this.pending = new Uint8Array(0);
    this.pendingIsNal = false;
    this.emit(done);
    return done;
  }

  private addNal(nal: Uint8Array, done: Uint8Array[]): void {
    if (nal.length <= startCodeLength(nal)) return;
    const type = nalType(nal);
    if (this.currentHasVcl && startsNewAccessUnit(nal, type)) this.emit(done);
    this.current.push(nal);
    if (isVcl(type)) this.currentHasVcl = true;
  }

  private emit(done: Uint8Array[]): void {
    if (this.currentHasVcl) done.push(concat(this.current));
    this.current = [];
    this.currentHasVcl = false;
  }
}

function startsNewAccessUnit(nal: Uint8Array, type: number): boolean {
  if (!isVcl(type)) {
    return type === NalType.AccessUnitDelimiter || type === NalType.Sps || type === NalType.Pps || type === NalType.Sei;
  }
  // first_mb_in_slice is ue(v); its first bit is 1 exactly when the value is 0, i.e. a new picture.
  const sliceHeader = nal[startCodeLength(nal) + 1];
  return sliceHeader !== undefined && (sliceHeader & 0x80) !== 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
