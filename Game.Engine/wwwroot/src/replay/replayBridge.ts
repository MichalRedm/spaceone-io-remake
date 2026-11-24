/**
 * @file Replay controller bridge driving PixiJS, networking injection, UI visibility, and offline audio.
 * @module replay/replayBridge
 *
 * @remarks
 * Exposes a clean typed bridge (`window.__spaceoneReplay`) when `?replay=1` is active so headless
 * rendering harnesses (and future in-game replay UI controllers) can load `.s1rec` recordings,
 * step deterministic virtual timestamps, query state telemetry, and render sample-accurate audio.
 */

import { WorldConfig } from "../models/worldConfig";
import type { GraphicsQuality } from "../ui/settings";
import { show, hide } from "../ui/domUtils";
import { audioManager } from "../audio/audioManager";
import { OfflineAudioCapture } from "./offlineAudioCapture";
import {
  decodeBase64ToBytes,
  encodeBytesToBase64,
  parseReplayBuffer,
  type ParsedReplay,
} from "./replayFormat";
import {
  applyUiVisibility,
  resolveUiVisibility,
  type UiElementKey,
  type UiPreset,
  type UiVisibilityMap,
} from "./uiVisibility";
import {
  getVirtualElapsedMs,
  resetVirtualClock,
  realClearTimeout,
  realSetTimeout,
  setVirtualTime,
} from "./virtualClock";

/**
 * Configuration options passed from CLI/UI to configure a replay playback session.
 */
export interface ReplayConfigureOptions {
  uiPreset?: UiPreset;
  uiOverrides?: Partial<UiVisibilityMap>;
  graphics?: GraphicsQuality;
  soundEnabled?: boolean;
  soundVolume?: number;
  zoom?: number;
  overlayInfo?: boolean;
  speed?: number;
  seed?: number | null;
  povMode?: boolean;
}

/**
 * Per-frame status returned by `stepTo()`.
 */
export interface ReplayStepStatus {
  virtualTimeMs: number;
  frameIndex: number;
  totalFrames: number;
  isAlive: boolean;
  fleetID: number;
  shipCount: number;
  cameraX: number;
  cameraY: number;
  serverTime: number;
  done: boolean;
}

/**
 * Hooks supplied by `core/game.ts` so `ReplayController` remains decoupled from global variables.
 */
export interface ReplayHostHooks {
  injectPacket: (payload: Uint8Array) => void;
  resetSession: () => void;
  stepRenderFrame: (nowMs: number) => void;
  setZoom: (zoom: number) => void;
  setDeathMenuEnabled: (enabled: boolean) => void;
  setPovMode: (pov: boolean) => void;
  getStateSnapshot: () => {
    isAlive: boolean;
    fleetID: number;
    shipCount: number;
    cameraX: number;
    cameraY: number;
    serverTime: number;
    trackedName: string;
  };
  waitForAtlases: () => Promise<void>;
}

/**
 * Primary replay playback controller attached to `window.__spaceoneReplay`.
 */
export class ReplayController {
  private readonly host: ReplayHostHooks;
  private readonly audioCapture = new OfflineAudioCapture();
  private replay: ParsedReplay | null = null;
  private frameCursor = 0;
  private currentVisibility: UiVisibilityMap = resolveUiVisibility("player");
  private soundEnabled = true;
  private soundVolume = 100;
  private overlayInfo = false;
  private speed = 1.0;
  private timeOffsetMs = 0;
  private lastVirtualStepMs = 0;
  private povMode = true;

  public constructor(host: ReplayHostHooks) {
    this.host = host;
    applyUiVisibility(this.currentVisibility, {
      soundEnabled: this.soundEnabled,
      soundVolume: this.soundVolume,
    });
    this.host.setDeathMenuEnabled(this.currentVisibility.deathMenu);
  }

  /**
   * Awaits GPU sprite atlas warmup, web fonts (with offline timeout guard), and decoded SFX assets.
   */
  public async waitForReady(enableAudio = true): Promise<void> {
    await this.host.waitForAtlases();

    if (typeof document !== "undefined" && document.fonts?.ready) {
      await new Promise<void>((resolve) => {
        const timer = realSetTimeout(resolve, 1500);
        document.fonts.ready
          .then(() => {
            realClearTimeout(timer);
            resolve();
          })
          .catch(() => {
            realClearTimeout(timer);
            resolve();
          });
      });
    }

    if (enableAudio && this.soundEnabled) {
      await this.audioCapture.preloadAndDecodeAll();
    }
  }

  /**
   * Applies UI visibility presets, zoom, sound settings, overlay toggle, and deterministic seed.
   */
  public configure(options: ReplayConfigureOptions): void {
    const preset: UiPreset =
      options.uiPreset ?? (this.povMode ? "player" : "spectator");
    this.currentVisibility = resolveUiVisibility(preset, options.uiOverrides);

    if (options.soundEnabled !== undefined) {
      this.soundEnabled = options.soundEnabled;
    }
    if (options.soundVolume !== undefined) {
      this.soundVolume = Math.max(
        0,
        Math.min(100, Math.round(options.soundVolume)),
      );
    }
    if (options.zoom !== undefined && options.zoom > 0) {
      this.host.setZoom(options.zoom);
    }
    if (options.overlayInfo !== undefined) {
      this.overlayInfo = options.overlayInfo;
    }
    if (options.speed !== undefined && options.speed > 0) {
      this.speed = options.speed;
    }
    if (options.seed !== undefined) {
      this.audioCapture.setSeed(options.seed);
    }
    if (options.povMode !== undefined) {
      this.povMode = options.povMode;
      this.host.setPovMode(this.povMode);
    }

    this.host.setDeathMenuEnabled(this.currentVisibility.deathMenu);

    applyUiVisibility(this.currentVisibility, {
      graphics: options.graphics,
      soundEnabled: this.soundEnabled,
      soundVolume: this.soundVolume,
    });

    if (this.soundEnabled) {
      audioManager.setEnabled(true);
      audioManager.setVolume(this.soundVolume / 100);
      audioManager.attachOfflineCapture(this.audioCapture);
    } else {
      audioManager.setEnabled(false);
      audioManager.attachOfflineCapture(null);
    }

    this.updateOverlayVisibility();
  }

  /**
   * Loads a `.s1rec` replay from a base64 string and resets playback to `startMs`.
   */
  public async loadReplayBase64(
    base64Data: string,
    startOffsetMs = 0,
  ): Promise<{ frameCount: number; durationMs: number; povMode: boolean }> {
    const bytes = decodeBase64ToBytes(base64Data);
    return this.loadReplayBytes(bytes, startOffsetMs);
  }

  /**
   * Loads a `.s1rec` replay from raw bytes and resets simulation/rendering caches cleanly.
   */
  public async loadReplayBytes(
    bytes: Uint8Array,
    startOffsetMs = 0,
  ): Promise<{ frameCount: number; durationMs: number; povMode: boolean }> {
    const bufferCopy = bytes.slice().buffer;
    this.replay = parseReplayBuffer(bufferCopy);
    this.frameCursor = 0;
    this.timeOffsetMs = Math.max(0, startOffsetMs);
    this.lastVirtualStepMs = 0;

    resetVirtualClock();
    this.audioCapture.resetEvents();
    this.audioCapture.setTimeOffsetMs(this.timeOffsetMs);

    // Reveal gameplay canvas and base HUD before resetSession() clears mode-specific panels
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.remove("loading", "lobby", "connectionerror");
      hide(".visibility");
      hide(".visibility4");
      show(".visibility2");
      const canvas = document.getElementById("game-canvas");
      if (canvas) {
        canvas.style.visibility = "initial";
      }
    }

    const headerPov = this.replay.header.tracking?.pov;
    if (typeof headerPov === "boolean") {
      this.povMode = headerPov;
      this.host.setPovMode(headerPov);
    }

    this.host.resetSession();
    WorldConfig.resetToDefaults();

    if (this.replay.header.hook) {
      WorldConfig.updateFromHook(this.replay.header.hook);
    }

    if (this.soundEnabled) {
      await this.audioCapture.preloadAndDecodeAll();
      audioManager.attachOfflineCapture(this.audioCapture);
    }

    return {
      frameCount: this.replay.frames.length,
      durationMs: this.replay.durationMs,
      povMode: this.povMode,
    };
  }

  /**
   * Advances playback by stepping output time (`outputTimeMs` in output video timeline) or absolute
   * replay timeline (`replayTimeMs`), injecting all due server packets and rendering one frame.
   */
  public stepTo(outputTimeMs: number): ReplayStepStatus {
    if (!this.replay) {
      throw new Error("No replay loaded before calling stepTo().");
    }

    const virtualReplayMs = this.timeOffsetMs + outputTimeMs * this.speed;
    const prevElapsed = this.lastVirtualStepMs;
    const deltaMs = Math.max(0, virtualReplayMs - prevElapsed);

    // Sub-step large frame intervals (>= 34ms) so Pixi particles & physics interpolators stay smooth
    const maxSubStepMs = 33.4;
    const subSteps =
      deltaMs > maxSubStepMs ? Math.ceil(deltaMs / maxSubStepMs) : 1;

    for (let s = 1; s <= subSteps; s++) {
      const subVirtualMs = prevElapsed + (deltaMs * s) / subSteps;
      setVirtualTime(subVirtualMs);

      while (this.frameCursor < this.replay.frames.length) {
        const frame = this.replay.frames[this.frameCursor];
        if (!frame || frame.elapsedMs > subVirtualMs) break;
        this.host.injectPacket(frame.payload);
        this.frameCursor++;
      }

      this.host.stepRenderFrame(performance.now());
    }

    this.lastVirtualStepMs = virtualReplayMs;
    const snap = this.host.getStateSnapshot();
    this.updateOverlayText(virtualReplayMs, snap);

    return {
      virtualTimeMs: getVirtualElapsedMs(),
      frameIndex: this.frameCursor,
      totalFrames: this.replay.frames.length,
      isAlive: snap.isAlive,
      fleetID: snap.fleetID,
      shipCount: snap.shipCount,
      cameraX: snap.cameraX,
      cameraY: snap.cameraY,
      serverTime: snap.serverTime,
      done: this.frameCursor >= this.replay.frames.length,
    };
  }

  /**
   * Renders all captured spatial SFX for the stepped replay window into a base64 WAV string.
   */
  public async renderAudioWavBase64(
    outputDurationSec: number,
  ): Promise<string> {
    if (!this.soundEnabled) return "";
    // OfflineAudioCapture records raw virtual timestamps; offset by timeOffsetMs during render
    const wavBuffer = await this.audioCapture.renderToWav(
      outputDurationSec,
      this.soundVolume / 100,
      this.speed,
    );
    return encodeBytesToBase64(new Uint8Array(wavBuffer));
  }

  /**
   * Returns current UI visibility map (for testing and diagnostics).
   */
  public getUiVisibility(): UiVisibilityMap {
    return { ...this.currentVisibility };
  }

  private updateOverlayVisibility(): void {
    const el = document.getElementById("recording-dev-overlay");
    if (!el) return;
    el.hidden = !this.overlayInfo;
    el.classList.toggle("is-hidden", !this.overlayInfo);
  }

  private updateOverlayText(
    replayMs: number,
    snap: ReturnType<ReplayHostHooks["getStateSnapshot"]>,
  ): void {
    if (!this.overlayInfo) return;
    const el = document.getElementById("recording-dev-overlay");
    if (!el) return;
    const tSec = (replayMs / 1000).toFixed(2);
    const trackingLabel =
      snap.trackedName || this.replay?.header.tracking?.target || "spectator";
    const statusText = snap.isAlive
      ? `ALIVE (${snap.shipCount} ships)`
      : "SPECTATE/DEAD";
    el.textContent =
      `t=${tSec}s | tick=${snap.serverTime}ms | ${trackingLabel} [F:${snap.fleetID}] | ` +
      `${statusText} | cam=(${Math.round(snap.cameraX)}, ${Math.round(snap.cameraY)})`;
  }
}

export type { UiElementKey, UiPreset, UiVisibilityMap };
