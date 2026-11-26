/**
 * @file Binary `.s1rec` gameplay replay format reader and in-memory recorder.
 * @module replay/replayFormat
 *
 * @remarks
 * Format v1 layout (all multi-byte integers little-endian):
 * - Bytes 0..7: Magic header `S1REC\x00\x01\x00`
 * - Bytes 8..11: `uint32` JSON header length `H`
 * - Bytes 12..(12+H-1): UTF-8 JSON `ReplayHeader` metadata
 * - Repeated until EOF: `elapsedMs` (`uint32`), `payloadLen` (`uint32`), `NetQuantum` bytes
 */

const MAGIC_BYTES: readonly number[] = [
  0x53, 0x31, 0x52, 0x45, 0x43, 0x00, 0x01, 0x00,
];

/**
 * Metadata describing how a `.s1rec` session was tracked and recorded.
 */
export interface ReplayTrackingMetadata {
  mode: string;
  target?: string;
  pov?: boolean;
  viewportRadius?: number;
  playerName?: string;
  playerId?: string;
  fleetId?: number;
}

/**
 * JSON header embedded at the start of every `.s1rec` file.
 */
export interface ReplayHeader {
  version: number;
  createdAtUtc?: string;
  serverUrl?: string;
  worldKey?: string;
  tracking?: ReplayTrackingMetadata;
  hook?: Record<string, unknown>;
}

/**
 * Single timestamped raw FlatBuffers `NetQuantum` packet captured from the server.
 */
export interface ReplayFrame {
  /** Elapsed time in milliseconds from start of recording. */
  elapsedMs: number;
  /** Raw serialized `NetQuantum` payload bytes. */
  payload: Uint8Array;
}

/**
 * Parsed `.s1rec` replay payload ready for playback.
 */
export interface ParsedReplay {
  header: ReplayHeader;
  frames: ReplayFrame[];
  durationMs: number;
}

/**
 * Parses a binary `.s1rec` v1 buffer into structured header metadata and timestamped packets.
 * Safely stops before any incomplete trailing frame (crash/hard-kill resilience).
 *
 * @param buffer - Raw `.s1rec` file `ArrayBuffer`.
 * @returns Parsed header, packet array, and total replay duration in milliseconds.
 * @throws Error when the magic header or JSON header block is invalid.
 */
export function parseReplayBuffer(buffer: ArrayBuffer): ParsedReplay {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (bytes.byteLength < 12) {
    throw new Error("Replay file is too short to contain an S1REC header.");
  }

  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (bytes[i] !== MAGIC_BYTES[i]) {
      throw new Error(
        "Invalid S1REC magic bytes or unsupported replay version.",
      );
    }
  }

  const headerLen = view.getUint32(8, true);
  if (12 + headerLen > bytes.byteLength) {
    throw new Error("Truncated S1REC JSON header.");
  }

  const decoder = new TextDecoder("utf-8");
  const headerText = decoder.decode(bytes.subarray(12, 12 + headerLen));
  const parsedHeader = JSON.parse(headerText) as ReplayHeader;

  const frames: ReplayFrame[] = [];
  let pos = 12 + headerLen;
  let lastElapsed = 0;

  while (pos + 8 <= bytes.byteLength) {
    const elapsedMs = view.getUint32(pos, true);
    const payloadLen = view.getUint32(pos + 4, true);
    pos += 8;

    if (pos + payloadLen > bytes.byteLength) {
      // Stop cleanly on truncated trailing frame
      break;
    }

    const payload = bytes.subarray(pos, pos + payloadLen);
    frames.push({ elapsedMs, payload });
    lastElapsed = elapsedMs;
    pos += payloadLen;
  }

  return {
    header: parsedHeader,
    frames,
    durationMs: lastElapsed,
  };
}

/**
 * Decodes a base64-encoded binary blob into a `Uint8Array`.
 */
export function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Encodes a `Uint8Array` into a base64 string without exceeding JS call stack limits.
 */
export function encodeBytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(""));
}

/**
 * Lightweight in-memory `.s1rec` packet recorder prepared for future in-browser UI recording.
 */
export class ReplayRecorder {
  private readonly header: ReplayHeader;
  private frames: ReplayFrame[] = [];
  private startedAtMs = 0;
  private recording = false;

  public constructor(header: Omit<ReplayHeader, "version">) {
    this.header = {
      version: 1,
      ...header,
    };
  }

  /** Starts or resets capture at the current timestamp. */
  public start(nowMs = performance.now()): void {
    this.frames = [];
    this.startedAtMs = nowMs;
    this.recording = true;
  }

  /** Stops capture while preserving recorded frames. */
  public stop(): void {
    this.recording = false;
  }

  /** Appends an incoming `NetQuantum` packet copy if recording is active. */
  public pushPacket(payload: Uint8Array, nowMs = performance.now()): void {
    if (!this.recording) return;
    const elapsedMs = Math.max(0, Math.round(nowMs - this.startedAtMs));
    this.frames.push({
      elapsedMs,
      payload: payload.slice(),
    });
  }

  /** Serializes all captured packets into a valid `.s1rec` v1 binary buffer. */
  public toArrayBuffer(): ArrayBuffer {
    const encoder = new TextEncoder();
    const headerBytes = encoder.encode(JSON.stringify(this.header));
    let totalSize = 12 + headerBytes.byteLength;
    for (const f of this.frames) {
      totalSize += 8 + f.payload.byteLength;
    }

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const out = new Uint8Array(buffer);

    for (let i = 0; i < MAGIC_BYTES.length; i++) {
      out[i] = MAGIC_BYTES[i] ?? 0;
    }
    view.setUint32(8, headerBytes.byteLength, true);
    out.set(headerBytes, 12);

    let pos = 12 + headerBytes.byteLength;
    for (const f of this.frames) {
      view.setUint32(pos, f.elapsedMs >>> 0, true);
      view.setUint32(pos + 4, f.payload.byteLength >>> 0, true);
      out.set(f.payload, pos + 8);
      pos += 8 + f.payload.byteLength;
    }

    return buffer;
  }
}
