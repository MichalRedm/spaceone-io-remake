/**
 * @file Granular UI visibility presets and live CSS/Settings synchronization for gameplay recordings.
 * @module replay/uiVisibility
 */

import {
  Settings,
  dispatchSettingsChanged,
  type GraphicsQuality,
} from "../ui/settings";

/**
 * Individual UI / HUD elements that can be toggled independently during recording or replay.
 */
export type UiElementKey =
  | "leaderboard"
  | "arenaRecord"
  | "names"
  | "ownName"
  | "fleetSize"
  | "cooldown"
  | "autofire"
  | "trackingArrows"
  | "killBanner"
  | "scorePopups"
  | "dangerZone"
  | "ctfHud"
  | "fpsHud"
  | "vignette"
  | "deathMenu";

/**
 * Named UI visibility presets tailored to player recordings, spectators, and AI analysis.
 */
export type UiPreset = "player" | "spectator" | "clean" | "none";

/**
 * Complete visibility map for all 15 configurable UI elements.
 */
export type UiVisibilityMap = Record<UiElementKey, boolean>;

const BODY_HIDE_CLASSES: Readonly<Record<UiElementKey, string | null>> = {
  leaderboard: "rec-hide--leaderboard",
  arenaRecord: "rec-hide--arena-record",
  names: null, // Handled via Settings.namesEnabled
  ownName: "rec-hide--own-name",
  fleetSize: "rec-hide--fleet-size",
  cooldown: "rec-hide--cooldown",
  autofire: "rec-hide--autofire",
  trackingArrows: "rec-hide--tracking-arrows",
  killBanner: "rec-hide--kill-banner",
  scorePopups: "rec-hide--score-popups",
  dangerZone: "rec-hide--danger-zone",
  ctfHud: "rec-hide--ctf-hud",
  fpsHud: null, // Handled via Settings.hudEnabled
  vignette: "rec-hide--vignette",
  deathMenu: "rec-hide--death-menu",
};

const PRESET_PLAYER: Readonly<UiVisibilityMap> = {
  leaderboard: true,
  arenaRecord: true,
  names: true,
  ownName: true,
  fleetSize: true,
  cooldown: true,
  autofire: false,
  trackingArrows: true,
  killBanner: true,
  scorePopups: true,
  dangerZone: true,
  ctfHud: true,
  fpsHud: false,
  vignette: true,
  deathMenu: false,
};

const PRESET_SPECTATOR: Readonly<UiVisibilityMap> = {
  leaderboard: true,
  arenaRecord: true,
  names: true,
  ownName: false,
  fleetSize: false,
  cooldown: false,
  autofire: false,
  trackingArrows: false,
  killBanner: false,
  scorePopups: false,
  dangerZone: false,
  ctfHud: true,
  fpsHud: false,
  vignette: true,
  deathMenu: false,
};

const PRESET_CLEAN: Readonly<UiVisibilityMap> = {
  leaderboard: false,
  arenaRecord: false,
  names: true,
  ownName: false,
  fleetSize: true,
  cooldown: false,
  autofire: false,
  trackingArrows: false,
  killBanner: false,
  scorePopups: false,
  dangerZone: false,
  ctfHud: false,
  fpsHud: false,
  vignette: true,
  deathMenu: false,
};

const PRESET_NONE: Readonly<UiVisibilityMap> = {
  leaderboard: false,
  arenaRecord: false,
  names: false,
  ownName: false,
  fleetSize: false,
  cooldown: false,
  autofire: false,
  trackingArrows: false,
  killBanner: false,
  scorePopups: false,
  dangerZone: false,
  ctfHud: false,
  fpsHud: false,
  vignette: false,
  deathMenu: false,
};

const PRESETS: Readonly<Record<UiPreset, Readonly<UiVisibilityMap>>> = {
  player: PRESET_PLAYER,
  spectator: PRESET_SPECTATOR,
  clean: PRESET_CLEAN,
  none: PRESET_NONE,
};

/**
 * Resolves a named UI preset combined with granular per-element boolean overrides.
 */
export function resolveUiVisibility(
  preset: UiPreset,
  overrides?: Partial<UiVisibilityMap>,
): UiVisibilityMap {
  const base = PRESETS[preset] ?? PRESET_PLAYER;
  return {
    ...base,
    ...(overrides ?? {}),
  };
}

/**
 * Applies resolved UI visibility configuration to both `Settings` and body BEM modifier classes.
 */
export function applyUiVisibility(
  visibility: UiVisibilityMap,
  options?: {
    graphics?: GraphicsQuality;
    soundEnabled?: boolean;
    soundVolume?: number;
  },
): void {
  if (options?.graphics) {
    Settings.graphics = options.graphics;
  }
  if (options?.soundEnabled !== undefined) {
    Settings.soundEnabled = options.soundEnabled;
  }
  if (options?.soundVolume !== undefined) {
    Settings.soundVolume = Math.max(
      0,
      Math.min(100, Math.round(options.soundVolume)),
    );
  }

  Settings.leaderboardEnabled =
    visibility.leaderboard || visibility.arenaRecord;
  Settings.namesEnabled = visibility.names;
  Settings.showOwnName = visibility.ownName;
  Settings.bigKillMessage = visibility.killBanner;
  Settings.hudEnabled = visibility.fpsHud;

  dispatchSettingsChanged();

  if (typeof document !== "undefined" && document.body) {
    const keys = Object.keys(BODY_HIDE_CLASSES) as UiElementKey[];
    for (const key of keys) {
      const cls = BODY_HIDE_CLASSES[key];
      if (cls) {
        document.body.classList.toggle(cls, !visibility[key]);
      }
    }
  }
}
