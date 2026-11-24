/**
 * @file Sample-accurate offline Web Audio renderer using `OfflineAudioContext`.
 * @module replay/offlineAudioCapture
 *
 * @remarks
 * Attaches to `AudioManager` during `?replay=1` rendering to capture exact spatialized sound
 * cue triggers (variant selection, stereo pan, spatial gain, pitch rate, and voice stealing)
 * on the virtual timeline, then renders them through an identical submix + `DynamicsCompressorNode`
 * graph into a standard 16-bit stereo PCM WAV buffer for FFmpeg AAC muxing.
 */

import {
  AUDIO_CONSTANTS,
  BUS_GAINS,
  type AudioCaptureSink,
} from "../audio/audioManager";
import {
  AUDIO_ASSET_URLS,
  SOUND_MANIFEST,
  type SoundBus,
  type SoundId,
} from "../audio/soundManifest";
import { getVirtualElapsedMs } from "./virtualClock";

interface RecordedAudioVoice {
  id: number;
  soundId: SoundId;
  variantFile: string;
  bus: SoundBus;
  startSec: number;
  stopSec: number | null;
  gain: number;
  pan: number;
  playbackRate: number;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function encodeStereoWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const numFrames = Math.min(left.length, right.length);
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataBytes = numFrames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // Bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let outOffset = 44;
  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, left[i] ?? 0));
    const r = Math.max(-1, Math.min(1, right[i] ?? 0));
    view.setInt16(
      outOffset,
      l < 0 ? Math.round(l * 32768) : Math.round(l * 32767),
      true,
    );
    view.setInt16(
      outOffset + 2,
      r < 0 ? Math.round(r * 32768) : Math.round(r * 32767),
      true,
    );
    outOffset += 4;
  }

  return buffer;
}

/**
 * Offline Web Audio capture & synthesis engine mirroring `AudioManager` submix topology.
 */
export class OfflineAudioCapture implements AudioCaptureSink {
  private readonly decodedBuffers = new Map<string, AudioBuffer>();
  private readonly recordedVoices = new Map<number, RecordedAudioVoice>();
  private nextVoiceId = 1;
  private rng: () => number = Math.random;
  private preloadPromise: Promise<void> | null = null;
  private timeOffsetMs = 0;

  /**
   * Sets replay trim start offset (in ms) so output WAV aligns $t = 0$ with the clip start.
   */
  public setTimeOffsetMs(offsetMs: number): void {
    this.timeOffsetMs = Math.max(0, offsetMs);
  }

  /**
   * Configures optional deterministic PRNG seed for audio variant selection and micro-jitter.
   */
  public setSeed(seed?: number | null): void {
    if (seed !== undefined && seed !== null && Number.isFinite(seed)) {
      this.rng = createMulberry32(Math.trunc(seed));
    } else {
      this.rng = Math.random;
    }
  }

  /**
   * Clears all previously captured voice events while keeping decoded `.mp3` buffers cached.
   */
  public resetEvents(): void {
    this.recordedVoices.clear();
    this.nextVoiceId = 1;
  }

  /**
   * Prefetches and decodes all `.mp3` SFX files from `SOUND_MANIFEST` using an offline context.
   */
  public async preloadAndDecodeAll(): Promise<void> {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.preloadPromise = (async () => {
      const OfflineCtx =
        window.OfflineAudioContext ||
        (
          window as unknown as {
            webkitOfflineAudioContext?: typeof OfflineAudioContext;
          }
        ).webkitOfflineAudioContext;
      if (!OfflineCtx) return;

      const decodeCtx = new OfflineCtx(2, 1, 44100);
      const uniqueFiles = new Set<string>();
      for (const def of Object.values(SOUND_MANIFEST)) {
        for (const file of def.variants) {
          uniqueFiles.add(file);
        }
      }

      const tasks: Promise<void>[] = [];
      for (const filename of uniqueFiles) {
        if (this.decodedBuffers.has(filename)) continue;
        const url = AUDIO_ASSET_URLS[filename];
        if (!url) continue;

        tasks.push(
          fetch(url)
            .then((res) => (res.ok ? res.arrayBuffer() : null))
            .then((raw) =>
              raw ? decodeCtx.decodeAudioData(raw.slice(0)) : null,
            )
            .then((audioBuf) => {
              if (audioBuf) {
                this.decodedBuffers.set(filename, audioBuf);
              }
            })
            .catch(() => {
              // Ignore missing individual files gracefully
            }),
        );
      }

      await Promise.all(tasks);
    })();

    return this.preloadPromise;
  }

  /** Returns decoded buffer duration in seconds (default 0.6s fallback). */
  public getDurationSec(variantFile: string): number {
    return this.decodedBuffers.get(variantFile)?.duration ?? 0.6;
  }

  /** Returns `true` when decoded buffer is ready for playback. */
  public hasDecodedBuffer(variantFile: string): boolean {
    return this.decodedBuffers.has(variantFile);
  }

  /** Returns next random float in $[0, 1)$. */
  public nextRandom(): number {
    return this.rng();
  }

  /** Records a newly triggered spatial/UI sound cue at current virtual replay time. */
  public recordVoiceStart(params: {
    soundId: SoundId;
    variantFile: string;
    bus: SoundBus;
    gain: number;
    pan: number;
    playbackRate: number;
  }): number {
    const id = this.nextVoiceId++;
    const relativeSec = (getVirtualElapsedMs() - this.timeOffsetMs) / 1000;
    this.recordedVoices.set(id, {
      id,
      soundId: params.soundId,
      variantFile: params.variantFile,
      bus: params.bus,
      startSec: relativeSec,
      stopSec: null,
      gain: params.gain,
      pan: params.pan,
      playbackRate: params.playbackRate,
    });
    return id;
  }

  /** Marks an active captured voice as stolen with smooth fade-out at current virtual time. */
  public recordVoiceStop(voiceId: number): void {
    const rec = this.recordedVoices.get(voiceId);
    if (rec && rec.stopSec === null) {
      const relativeSec = (getVirtualElapsedMs() - this.timeOffsetMs) / 1000;
      rec.stopSec = Math.max(rec.startSec, relativeSec);
    }
  }

  /**
   * Renders all captured sound events through an `OfflineAudioContext` matching `AudioManager`'s
   * exact bus gains and `DynamicsCompressorNode` settings, returning a 16-bit stereo PCM WAV buffer.
   *
   * @param durationSec - Total output audio duration in seconds.
   * @param masterVolume - Normalized master SFX volume $[0, 1]$.
   * @param speed - Replay playback speed multiplier (default `1.0`).
   * @param sampleRate - Output sample rate in Hz (default `44100`).
   */
  public async renderToWav(
    durationSec: number,
    masterVolume: number,
    speed = 1.0,
    sampleRate = 44100,
  ): Promise<ArrayBuffer> {
    await this.preloadAndDecodeAll();

    const safeDuration = Math.max(0.05, durationSec);
    const frameCount = Math.max(1, Math.ceil(safeDuration * sampleRate));
    const OfflineCtx =
      window.OfflineAudioContext ||
      (
        window as unknown as {
          webkitOfflineAudioContext?: typeof OfflineAudioContext;
        }
      ).webkitOfflineAudioContext;

    if (!OfflineCtx) {
      const silence = new Float32Array(frameCount);
      return encodeStereoWav(silence, silence, sampleRate);
    }

    const ctx = new OfflineCtx(2, frameCount, sampleRate);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = AUDIO_CONSTANTS.COMPRESSOR_THRESHOLD_DB;
    compressor.knee.value = AUDIO_CONSTANTS.COMPRESSOR_KNEE_DB;
    compressor.ratio.value = AUDIO_CONSTANTS.COMPRESSOR_RATIO;
    compressor.attack.value = AUDIO_CONSTANTS.COMPRESSOR_ATTACK_SEC;
    compressor.release.value = AUDIO_CONSTANTS.COMPRESSOR_RELEASE_SEC;

    const masterGain = ctx.createGain();
    masterGain.gain.value =
      AUDIO_CONSTANTS.MASTER_GAIN * Math.max(0, Math.min(1, masterVolume));

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    const createBus = (gain: number): GainNode => {
      const node = ctx.createGain();
      node.gain.value = gain;
      node.connect(compressor);
      return node;
    };

    const buses: Record<SoundBus, GainNode> = {
      weapons: createBus(BUS_GAINS.weapons),
      explosions: createBus(BUS_GAINS.explosions),
      gameplay: createBus(BUS_GAINS.gameplay),
      ui: createBus(BUS_GAINS.ui),
    };

    const safeSpeed = speed > 0 ? speed : 1.0;

    for (const voice of this.recordedVoices.values()) {
      const audioBuf = this.decodedBuffers.get(voice.variantFile);
      if (!audioBuf) continue;

      const startOutSec = voice.startSec / safeSpeed;
      if (startOutSec >= safeDuration) continue;
      if (startOutSec + audioBuf.duration <= 0) continue;

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.playbackRate.value = voice.playbackRate;

      const gainNode = ctx.createGain();
      const scheduleWhen = Math.max(0, startOutSec);
      const bufferOffset = startOutSec < 0 ? -startOutSec : 0;
      gainNode.gain.setValueAtTime(voice.gain, scheduleWhen);

      if (voice.stopSec !== null) {
        const stopOutSec = voice.stopSec / safeSpeed;
        if (stopOutSec <= 0) continue;
        const clampedStop = Math.max(scheduleWhen, stopOutSec);
        const fadeEndSec = clampedStop + AUDIO_CONSTANTS.VOICE_STEAL_FADE_SEC;
        gainNode.gain.setValueAtTime(voice.gain, clampedStop);
        gainNode.gain.linearRampToValueAtTime(0, fadeEndSec);
        source.stop(Math.min(safeDuration, fadeEndSec + 0.002));
      }

      const targetBus = buses[voice.bus];
      if (
        Math.abs(voice.pan) > 0.01 &&
        typeof ctx.createStereoPanner === "function"
      ) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = voice.pan;
        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(targetBus);
      } else {
        source.connect(gainNode);
        gainNode.connect(targetBus);
      }

      source.start(scheduleWhen, bufferOffset);
    }

    const rendered = await ctx.startRendering();
    const left = rendered.getChannelData(0);
    const right =
      rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
    return encodeStereoWav(left, right, sampleRate);
  }
}
