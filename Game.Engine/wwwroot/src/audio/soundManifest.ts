/**
 * @file Sound effect manifest, Vite asset discovery, and mix/concurrency definitions.
 * @module audio/soundManifest
 *
 * @remarks
 * Discovers all bundled `.mp3` assets via Vite `import.meta.glob` and defines the
 * mixing bus assignment, priority tier, cooldown, polyphony cap, and micro-variation
 * parameters for every sound cue in Spaceone.io Remake.
 */

const rawAudioModules = import.meta.glob("../../audio/**/*.mp3", {
  eager: true,
  import: "default",
}) as Record<string, string>;

/** Map from audio asset filename (without directory) to Vite-resolved asset URL. */
export const AUDIO_ASSET_URLS: Record<string, string> = {};
for (const [assetPath, url] of Object.entries(rawAudioModules)) {
  const filename = assetPath.split("/").pop() ?? "";
  if (filename) {
    AUDIO_ASSET_URLS[filename] = url;
  }
}

/** Semantic submix bus identifier. */
export type SoundBus = "weapons" | "explosions" | "gameplay" | "ui";

/** Strongly typed sound cue identifier. */
export type SoundId =
  | "laser_fire"
  | "bullet_hit"
  | "food_collect"
  | "ship_explode"
  | "boost"
  | "ship_gain"
  | "kill_confirm"
  | "player_spawn"
  | "player_death"
  | "danger_zone"
  | "ctf_event"
  | "ctf_victory"
  | "ui_click";

/** Priority tiers used for voice stealing when global polyphony is saturated. */
export enum SoundPriority {
  Low = 0,
  Medium = 1,
  High = 2,
  Critical = 3,
}

/** Static mixing and concurrency specification for a sound cue. */
export interface SoundDefinition {
  /** Audio filenames (resolved via `AUDIO_ASSET_URLS`) used as randomized variants. */
  variants: readonly string[];
  /** Target submix bus for category gain staging. */
  bus: SoundBus;
  /** Nominal linear gain `[0, 1]` before spatial rolloff and voice scaling. */
  baseGain: number;
  /** Symmetric random playbackRate deviation fraction (e.g. `0.05` = `±5%`). */
  pitchJitter: number;
  /** Symmetric random gain deviation fraction (e.g. `0.05` = `±5%`). */
  gainJitter: number;
  /** Minimum interval in milliseconds between triggers of this sound ID. */
  minIntervalMs: number;
  /** Maximum simultaneous active voices permitted for this sound ID. */
  maxConcurrent: number;
  /** Voice-stealing priority tier. */
  priority: SoundPriority;
  /** Whether the sound uses 2D world coordinates for culling, attenuation, and panning. */
  spatial: boolean;
}

/** Master manifest mapping every `SoundId` to its mixing parameters and variants. */
export const SOUND_MANIFEST: Record<SoundId, SoundDefinition> = {
  laser_fire: {
    variants: ["laser_fire_1.mp3", "laser_fire_2.mp3", "laser_fire_3.mp3"],
    bus: "weapons",
    baseGain: 0.3,
    pitchJitter: 0.04,
    gainJitter: 0.05,
    minIntervalMs: 55,
    maxConcurrent: 3,
    priority: SoundPriority.Medium,
    spatial: true,
  },
  bullet_hit: {
    variants: ["bullet_hit_1.mp3", "bullet_hit_2.mp3"],
    bus: "weapons",
    baseGain: 0.2,
    pitchJitter: 0.05,
    gainJitter: 0.05,
    minIntervalMs: 65,
    maxConcurrent: 2,
    priority: SoundPriority.Medium,
    spatial: true,
  },
  food_collect: {
    variants: [
      "food_collect_1.mp3",
      "food_collect_2.mp3",
      "food_collect_3.mp3",
    ],
    bus: "gameplay",
    baseGain: 0.2,
    pitchJitter: 0.0,
    gainJitter: 0.05,
    minIntervalMs: 75,
    maxConcurrent: 2,
    priority: SoundPriority.Medium,
    spatial: true,
  },
  ship_explode: {
    variants: [
      "ship_explode_1.mp3",
      "ship_explode_2.mp3",
      "ship_explode_3.mp3",
    ],
    bus: "explosions",
    baseGain: 0.54,
    pitchJitter: 0.04,
    gainJitter: 0.05,
    minIntervalMs: 75,
    maxConcurrent: 3,
    priority: SoundPriority.High,
    spatial: true,
  },
  boost: {
    variants: ["boost.mp3"],
    bus: "gameplay",
    baseGain: 0.5,
    pitchJitter: 0.0,
    gainJitter: 0.03,
    minIntervalMs: 120,
    maxConcurrent: 2,
    priority: SoundPriority.High,
    spatial: true,
  },
  ship_gain: {
    variants: ["ship_gain.mp3"],
    bus: "gameplay",
    baseGain: 0.28,
    pitchJitter: 0.0,
    gainJitter: 0.0,
    minIntervalMs: 180,
    maxConcurrent: 2,
    priority: SoundPriority.High,
    spatial: false,
  },
  kill_confirm: {
    variants: ["kill_confirm.mp3"],
    bus: "gameplay",
    baseGain: 0.46,
    pitchJitter: 0.0,
    gainJitter: 0.0,
    minIntervalMs: 140,
    maxConcurrent: 2,
    priority: SoundPriority.High,
    spatial: false,
  },
  player_spawn: {
    variants: ["player_spawn.mp3"],
    bus: "gameplay",
    baseGain: 0.48,
    pitchJitter: 0.0,
    gainJitter: 0.0,
    minIntervalMs: 250,
    maxConcurrent: 1,
    priority: SoundPriority.Critical,
    spatial: false,
  },
  player_death: {
    variants: ["player_death.mp3"],
    bus: "explosions",
    baseGain: 0.65,
    pitchJitter: 0.0,
    gainJitter: 0.0,
    minIntervalMs: 300,
    maxConcurrent: 1,
    priority: SoundPriority.Critical,
    spatial: false,
  },
  danger_zone: {
    variants: ["danger_zone.mp3"],
    bus: "gameplay",
    baseGain: 0.32,
    pitchJitter: 0.0,
    gainJitter: 0.0,
    minIntervalMs: 900,
    maxConcurrent: 1,
    priority: SoundPriority.High,
    spatial: false,
  },
  ctf_event: {
    variants: ["ctf_event.mp3"],
    bus: "gameplay",
    baseGain: 0.5,
    pitchJitter: 0.0,
    gainJitter: 0.0,
    minIntervalMs: 300,
    maxConcurrent: 1,
    priority: SoundPriority.High,
    spatial: false,
  },
  ctf_victory: {
    variants: ["ctf_victory.mp3"],
    bus: "gameplay",
    baseGain: 0.62,
    pitchJitter: 0.0,
    gainJitter: 0.0,
    minIntervalMs: 500,
    maxConcurrent: 1,
    priority: SoundPriority.Critical,
    spatial: false,
  },
  ui_click: {
    variants: ["ui_click.mp3"],
    bus: "ui",
    baseGain: 0.28,
    pitchJitter: 0.02,
    gainJitter: 0.0,
    minIntervalMs: 35,
    maxConcurrent: 2,
    priority: SoundPriority.Low,
    spatial: false,
  },
};
