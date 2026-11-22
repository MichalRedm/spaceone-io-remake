/**
 * @file Zero-dependency Native Web Audio API engine for spatialized, polyphony-safe game SFX.
 * @module audio/audioManager
 *
 * @remarks
 * Implements a bus topology (`weapons`, `explosions`, `gameplay`, `ui` -\> `DynamicsCompressorNode` -\>
 * `masterGain` -\> `destination`), lazy gesture-compliant `AudioContext` initialization, background
 * asset fetching/decoding, 2D spatial culling & stereo panning, per-sound cooldowns, and priority
 * voice stealing so intense multi-fleet combat remains punchy and free of clipping.
 */

import {
  AUDIO_ASSET_URLS,
  SOUND_MANIFEST,
  type SoundBus,
  type SoundId,
  type SoundPriority,
} from "./soundManifest";

/** Options passed when triggering a sound cue via `AudioManager.play()`. */
export interface PlaySoundOptions {
  /** World X coordinate in simulation units (required for spatial cues). */
  worldX?: number;
  /** World Y coordinate in simulation units (required for spatial cues). */
  worldY?: number;
  /** Multiplier applied on top of the manifest `baseGain`. */
  gainScale?: number;
  /** Multiplier applied on top of randomized `playbackRate`. */
  pitchScale?: number;
  /** Optional priority override (e.g. boosting own fleet shots over enemy shots). */
  priorityOverride?: SoundPriority;
}

interface ActiveVoice {
  id: SoundId;
  priority: SoundPriority;
  startedAt: number;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  pannerNode: StereoPannerNode | null;
}

const AUDIO_CONSTANTS = {
  MASTER_GAIN: 0.85,
  MUTE_RAMP_SEC: 0.015,
  VOICE_STEAL_FADE_SEC: 0.01,
  MAX_CONCURRENT_VOICES: 16,
  SPATIAL_CULL_VIEWPORT_MULT: 1.15,
  MAX_STEREO_PAN: 0.75,
  MIN_SPATIAL_GAIN: 0.04,
  COMPRESSOR_THRESHOLD_DB: -14,
  COMPRESSOR_KNEE_DB: 18,
  COMPRESSOR_RATIO: 6,
  COMPRESSOR_ATTACK_SEC: 0.003,
  COMPRESSOR_RELEASE_SEC: 0.18,
} as const;

const BUS_GAINS: Record<SoundBus, number> = {
  weapons: 0.85,
  explosions: 0.95,
  gameplay: 0.95,
  ui: 0.8,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveAudioContextCtor(): typeof AudioContext | null {
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/**
 * Singleton Web Audio manager handling context lifecycle, submix routing,
 * spatial attenuation/panning, and concurrency control.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private buses: Record<SoundBus, GainNode> | null = null;

  private rawArrayBuffers = new Map<string, ArrayBuffer>();
  private decodedBuffers = new Map<string, AudioBuffer>();
  private loadingRaw = new Map<string, Promise<ArrayBuffer | null>>();
  private decodingBuffers = new Map<string, Promise<AudioBuffer | null>>();

  private activeVoices = new Set<ActiveVoice>();
  private activeCountById = new Map<SoundId, number>();
  private lastPlayedTime = new Map<SoundId, number>();
  private lastVariantById = new Map<SoundId, number>();

  private enabled = true;
  private gestureListenersBound = false;
  private preloadStarted = false;

  /** Camera center world coordinates (world units) and viewport width (world units). */
  private listenerX = 0;
  private listenerY = 0;
  private viewportWidth = 1000;

  /**
   * Initializes gesture-unlock listeners and kicks off non-blocking asset prefetching.
   */
  init(): void {
    this.bindGestureUnlock();
    this.preloadAll();
  }

  /**
   * Enables or disables all audio playback with a smooth 15 ms anti-click ramp.
   *
   * @param enabled - Whether sound effects are audible.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      const target = enabled ? AUDIO_CONSTANTS.MASTER_GAIN : 0;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(
        target,
        now + AUDIO_CONSTANTS.MUTE_RAMP_SEC,
      );
    }
    if (enabled && this.ctx) {
      this.unlockAndDecodePending();
    }
  }

  /**
   * Returns whether audio playback is currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Updates the 2D spatial audio listener position and viewport width in world units.
   *
   * @param worldX - Camera look-at X in world units.
   * @param worldY - Camera look-at Y in world units.
   * @param viewportWidth - Visible camera frustum width in world units.
   */
  setListener(worldX: number, worldY: number, viewportWidth: number): void {
    this.listenerX = worldX;
    this.listenerY = worldY;
    if (viewportWidth > 0) {
      this.viewportWidth = viewportWidth;
    }
  }

  /**
   * Prefetches all manifest `.mp3` assets as raw `ArrayBuffer`s in the background.
   */
  preloadAll(): void {
    if (this.preloadStarted) return;
    this.preloadStarted = true;

    const uniqueFiles = new Set<string>();
    for (const def of Object.values(SOUND_MANIFEST)) {
      for (const file of def.variants) {
        uniqueFiles.add(file);
      }
    }

    for (const file of uniqueFiles) {
      void this.fetchRawAsset(file);
    }
  }

  /**
   * Schedules playback of a sound cue, enforcing spatial culling, cooldowns,
   * polyphony caps, and priority voice stealing.
   *
   * @param id - Manifest sound identifier.
   * @param options - Optional world coordinates, gain/pitch scaling, and priority override.
   */
  play(id: SoundId, options: PlaySoundOptions = {}): void {
    if (!this.enabled) return;
    if (document.hidden || window.Game?.isBackgrounded) return;
    if (!this.ctx || this.ctx.state !== "running" || !this.buses) return;

    const def = SOUND_MANIFEST[id];
    const nowMs = performance.now();

    const prevTime = this.lastPlayedTime.get(id) ?? -Infinity;
    if (nowMs - prevTime < def.minIntervalMs) {
      return;
    }

    let spatialGain = 1.0;
    let pan = 0.0;

    if (
      def.spatial &&
      options.worldX !== undefined &&
      options.worldY !== undefined
    ) {
      const dx = options.worldX - this.listenerX;
      const dy = options.worldY - this.listenerY;
      const maxDist =
        this.viewportWidth * AUDIO_CONSTANTS.SPATIAL_CULL_VIEWPORT_MULT;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDist) {
        return;
      }

      const normDist = clamp(dist / maxDist, 0, 1);
      // Smooth quadratic rolloff: full presence near camera, gentle tail near edge
      spatialGain = (1.0 - normDist * 0.72) ** 2;
      if (spatialGain < AUDIO_CONSTANTS.MIN_SPATIAL_GAIN) {
        return;
      }

      const halfWidth = Math.max(1, this.viewportWidth * 0.5);
      pan = clamp(
        (dx / halfWidth) * AUDIO_CONSTANTS.MAX_STEREO_PAN,
        -AUDIO_CONSTANTS.MAX_STEREO_PAN,
        AUDIO_CONSTANTS.MAX_STEREO_PAN,
      );
    }

    const variantFile = this.pickVariant(id, def.variants);
    const buffer = this.decodedBuffers.get(variantFile);
    if (!buffer) {
      // Trigger lazy decode for next trigger without blocking current frame
      void this.ensureDecoded(variantFile);
      return;
    }

    const priority = options.priorityOverride ?? def.priority;
    const activeForId = this.activeCountById.get(id) ?? 0;
    if (activeForId >= def.maxConcurrent) {
      if (!this.stealOldestVoiceForId(id)) {
        return;
      }
    }

    if (this.activeVoices.size >= AUDIO_CONSTANTS.MAX_CONCURRENT_VOICES) {
      if (!this.stealLowestPriorityVoice(priority)) {
        return;
      }
    }

    const pitchRand =
      def.pitchJitter > 0 ? 1 + (Math.random() * 2 - 1) * def.pitchJitter : 1;
    const gainRand =
      def.gainJitter > 0 ? 1 + (Math.random() * 2 - 1) * def.gainJitter : 1;

    const finalGain = clamp(
      def.baseGain * spatialGain * (options.gainScale ?? 1) * gainRand,
      0.001,
      1.2,
    );
    const finalRate = clamp(pitchRand * (options.pitchScale ?? 1), 0.5, 2.0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = finalRate;

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = finalGain;

    let pannerNode: StereoPannerNode | null = null;
    const targetBus = this.buses[def.bus];

    if (
      def.spatial &&
      Math.abs(pan) > 0.01 &&
      typeof this.ctx.createStereoPanner === "function"
    ) {
      pannerNode = this.ctx.createStereoPanner();
      pannerNode.pan.value = pan;
      source.connect(voiceGain);
      voiceGain.connect(pannerNode);
      pannerNode.connect(targetBus);
    } else {
      source.connect(voiceGain);
      voiceGain.connect(targetBus);
    }

    const voice: ActiveVoice = {
      id,
      priority,
      startedAt: nowMs,
      source,
      gainNode: voiceGain,
      pannerNode,
    };

    this.activeVoices.add(voice);
    this.activeCountById.set(id, (this.activeCountById.get(id) ?? 0) + 1);
    this.lastPlayedTime.set(id, nowMs);

    source.onended = () => {
      this.cleanupVoice(voice);
    };

    try {
      source.start(0);
    } catch {
      this.cleanupVoice(voice);
    }
  }

  private bindGestureUnlock(): void {
    if (this.gestureListenersBound) return;
    this.gestureListenersBound = true;

    const removeUnlockListeners = () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
      window.removeEventListener("click", unlock, true);
    };

    const unlock = () => {
      this.unlockAndDecodePending(removeUnlockListeners);
      if (this.ctx && this.ctx.state === "running") {
        removeUnlockListeners();
      }
    };

    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("touchstart", unlock, true);
    window.addEventListener("click", unlock, true);
  }

  private unlockAndDecodePending(onRunning?: () => void): void {
    if (!this.ensureContext() || !this.ctx) return;

    if (this.ctx.state === "suspended") {
      void this.ctx
        .resume()
        .then(() => {
          if (this.ctx?.state === "running") {
            onRunning?.();
            this.decodeAllPrefetched();
          }
        })
        .catch(() => {});
    } else {
      onRunning?.();
      this.decodeAllPrefetched();
    }
  }

  private ensureContext(): boolean {
    if (this.ctx) return true;
    const AudioCtxCtor = resolveAudioContextCtor();
    if (!AudioCtxCtor) return false;

    try {
      const ctx = new AudioCtxCtor();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = AUDIO_CONSTANTS.COMPRESSOR_THRESHOLD_DB;
      compressor.knee.value = AUDIO_CONSTANTS.COMPRESSOR_KNEE_DB;
      compressor.ratio.value = AUDIO_CONSTANTS.COMPRESSOR_RATIO;
      compressor.attack.value = AUDIO_CONSTANTS.COMPRESSOR_ATTACK_SEC;
      compressor.release.value = AUDIO_CONSTANTS.COMPRESSOR_RELEASE_SEC;

      const masterGain = ctx.createGain();
      masterGain.gain.value = this.enabled ? AUDIO_CONSTANTS.MASTER_GAIN : 0;

      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      const createBus = (gain: number): GainNode => {
        const node = ctx.createGain();
        node.gain.value = gain;
        node.connect(compressor);
        return node;
      };

      this.buses = {
        weapons: createBus(BUS_GAINS.weapons),
        explosions: createBus(BUS_GAINS.explosions),
        gameplay: createBus(BUS_GAINS.gameplay),
        ui: createBus(BUS_GAINS.ui),
      };

      this.compressor = compressor;
      this.masterGain = masterGain;
      this.ctx = ctx;
      return true;
    } catch {
      return false;
    }
  }

  private async fetchRawAsset(filename: string): Promise<ArrayBuffer | null> {
    const cached = this.rawArrayBuffers.get(filename);
    if (cached) return cached;

    const existing = this.loadingRaw.get(filename);
    if (existing) return existing;

    const url = AUDIO_ASSET_URLS[filename];
    if (!url) return null;

    const promise = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => {
        if (buf) {
          this.rawArrayBuffers.set(filename, buf);
          if (this.ctx && this.ctx.state === "running") {
            void this.ensureDecoded(filename);
          }
        }
        return buf;
      })
      .catch(() => null)
      .finally(() => {
        this.loadingRaw.delete(filename);
      });

    this.loadingRaw.set(filename, promise);
    return promise;
  }

  private decodeAllPrefetched(): void {
    for (const def of Object.values(SOUND_MANIFEST)) {
      for (const file of def.variants) {
        if (!this.decodedBuffers.has(file)) {
          void this.ensureDecoded(file);
        }
      }
    }
  }

  private async ensureDecoded(filename: string): Promise<AudioBuffer | null> {
    const cached = this.decodedBuffers.get(filename);
    if (cached) return cached;

    const existing = this.decodingBuffers.get(filename);
    if (existing) return existing;

    if (!this.ctx) return null;

    const promise = (async (): Promise<AudioBuffer | null> => {
      const raw = await this.fetchRawAsset(filename);
      if (!raw || !this.ctx) return null;
      try {
        // Slice a copy so repeated/concurrent decode calls never observe detached ArrayBuffers
        const decoded = await this.ctx.decodeAudioData(raw.slice(0));
        this.decodedBuffers.set(filename, decoded);
        return decoded;
      } catch {
        return null;
      }
    })().finally(() => {
      this.decodingBuffers.delete(filename);
    });

    this.decodingBuffers.set(filename, promise);
    return promise;
  }

  private pickVariant(id: SoundId, variants: readonly string[]): string {
    if (variants.length <= 1) {
      return variants[0] ?? "";
    }
    const lastIdx = this.lastVariantById.get(id) ?? -1;
    let idx = Math.floor(Math.random() * variants.length);
    if (idx === lastIdx) {
      idx =
        (idx + 1 + Math.floor(Math.random() * (variants.length - 1))) %
        variants.length;
    }
    this.lastVariantById.set(id, idx);
    return variants[idx] ?? variants[0] ?? "";
  }

  private stealOldestVoiceForId(id: SoundId): boolean {
    let oldest: ActiveVoice | null = null;
    for (const voice of this.activeVoices) {
      if (voice.id === id) {
        if (!oldest || voice.startedAt < oldest.startedAt) {
          oldest = voice;
        }
      }
    }
    if (!oldest) return false;
    this.fadeAndStopVoice(oldest);
    return true;
  }

  private stealLowestPriorityVoice(incomingPriority: SoundPriority): boolean {
    let victim: ActiveVoice | null = null;
    for (const voice of this.activeVoices) {
      if (voice.priority > incomingPriority) continue;
      if (
        !victim ||
        voice.priority < victim.priority ||
        (voice.priority === victim.priority &&
          voice.startedAt < victim.startedAt)
      ) {
        victim = voice;
      }
    }
    if (!victim || victim.priority > incomingPriority) {
      return false;
    }
    this.fadeAndStopVoice(victim);
    return true;
  }

  private fadeAndStopVoice(voice: ActiveVoice): void {
    this.cleanupVoice(voice, true);
  }

  private cleanupVoice(voice: ActiveVoice, stopWithFade = false): void {
    if (!this.activeVoices.has(voice)) return;
    this.activeVoices.delete(voice);

    const prevCount = this.activeCountById.get(voice.id) ?? 0;
    if (prevCount <= 1) {
      this.activeCountById.delete(voice.id);
    } else {
      this.activeCountById.set(voice.id, prevCount - 1);
    }

    voice.source.onended = null;

    if (stopWithFade && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
        voice.gainNode.gain.linearRampToValueAtTime(
          0,
          now + AUDIO_CONSTANTS.VOICE_STEAL_FADE_SEC,
        );
        voice.source.onended = () => {
          voice.source.onended = null;
          try {
            voice.source.disconnect();
            voice.gainNode.disconnect();
            voice.pannerNode?.disconnect();
          } catch {
            // Node already disconnected
          }
        };
        voice.source.stop(now + AUDIO_CONSTANTS.VOICE_STEAL_FADE_SEC + 0.002);
        return;
      } catch {
        // Fallback to immediate disconnect below
      }
    }

    try {
      voice.source.disconnect();
      voice.gainNode.disconnect();
      voice.pannerNode?.disconnect();
    } catch {
      // Node already disconnected
    }
  }
}

/** Global Web Audio playback engine singleton. */
export const audioManager = new AudioManager();
