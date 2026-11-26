/**
 * @file Client game settings, localStorage persistence, and live UI/audio synchronization.
 * @module ui/settings
 */

import { audioManager } from "../audio/audioManager";
import { GameAudio } from "../audio/gameAudio";
import { isReplayMode } from "../replay/virtualClock";

/** Supported graphics quality presets matching the top-bar selector. */
export type GraphicsQuality = "high" | "medium" | "low";

/** Supported server snapshot bandwidth tiers (max updates per tick). */
export type BandwidthTier = 25 | 50 | 100 | 150;

/**
 * Strongly typed client configuration persisted in browser `localStorage`.
 */
export interface SettingsData {
  /** Graphics quality preset (`"high"`, `"medium"`, or `"low"`). */
  graphics: GraphicsQuality;
  /** Whether in-game sound effects are enabled. */
  soundEnabled: boolean;
  /** Master SFX volume percentage (`0` to `100`). */
  soundVolume: number;
  /** Whether the leaderboard, arena record, and CTF score HUD are visible. */
  leaderboardEnabled: boolean;
  /** Whether opponent fleet nametags are rendered on the canvas. */
  namesEnabled: boolean;
  /** Whether the player's own name label above the cooldown bar is visible. */
  showOwnName: boolean;
  /** Whether center-screen kill notification banners are displayed. */
  bigKillMessage: boolean;
  /** Whether the compact top-left FPS and Ping readout is visible in-game. */
  hudEnabled: boolean;
  /** Whether right-clicking triggers Split & Dash. */
  rightClickBoost: boolean;
  /** Target network update throttle (max body updates per server snapshot). */
  bandwidth: BandwidthTier;
}

const SETTINGS_STORAGE_KEY = "spaceone_settings";
const VALID_GRAPHICS: readonly GraphicsQuality[] = ["high", "medium", "low"];
const VALID_BANDWIDTHS: readonly BandwidthTier[] = [25, 50, 100, 150];

/** Immutable default settings values. */
export const DEFAULT_SETTINGS: Readonly<SettingsData> = {
  graphics: "high",
  soundEnabled: true,
  soundVolume: 100,
  leaderboardEnabled: true,
  namesEnabled: true,
  showOwnName: true,
  bigKillMessage: true,
  hudEnabled: false,
  rightClickBoost: true,
  bandwidth: 150,
};

/** Active game settings repository. */
export const Settings: SettingsData = { ...DEFAULT_SETTINGS };

function parseGraphicsQuality(value: unknown): GraphicsQuality | null {
  if (
    typeof value === "string" &&
    (VALID_GRAPHICS as readonly string[]).includes(value)
  ) {
    return value as GraphicsQuality;
  }
  return null;
}

function parseBandwidthTier(value: unknown): BandwidthTier {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    if ((VALID_BANDWIDTHS as readonly number[]).includes(numeric)) {
      return numeric as BandwidthTier;
    }
    if (numeric > 150) {
      return 150;
    }
  }
  return DEFAULT_SETTINGS.bandwidth;
}

function clampVolume(value: unknown): number {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return DEFAULT_SETTINGS.soundVolume;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SETTINGS.soundVolume;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

/**
 * Validates and normalizes an untrusted settings object against `DEFAULT_SETTINGS`.
 *
 * @param raw - Untrusted parsed JSON payload or partial object.
 * @returns Fully populated, schema-valid `SettingsData` object.
 */
export function sanitizeSettings(raw: unknown): SettingsData {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const record = raw as Record<string, unknown>;
  const graphics =
    parseGraphicsQuality(record["graphics"]) ?? DEFAULT_SETTINGS.graphics;

  return {
    graphics,
    soundEnabled:
      typeof record["soundEnabled"] === "boolean"
        ? record["soundEnabled"]
        : DEFAULT_SETTINGS.soundEnabled,
    soundVolume:
      record["soundVolume"] !== undefined
        ? clampVolume(record["soundVolume"])
        : DEFAULT_SETTINGS.soundVolume,
    leaderboardEnabled:
      typeof record["leaderboardEnabled"] === "boolean"
        ? record["leaderboardEnabled"]
        : DEFAULT_SETTINGS.leaderboardEnabled,
    namesEnabled:
      typeof record["namesEnabled"] === "boolean"
        ? record["namesEnabled"]
        : DEFAULT_SETTINGS.namesEnabled,
    showOwnName:
      typeof record["showOwnName"] === "boolean"
        ? record["showOwnName"]
        : DEFAULT_SETTINGS.showOwnName,
    bigKillMessage:
      typeof record["bigKillMessage"] === "boolean"
        ? record["bigKillMessage"]
        : DEFAULT_SETTINGS.bigKillMessage,
    hudEnabled:
      typeof record["hudEnabled"] === "boolean"
        ? record["hudEnabled"]
        : DEFAULT_SETTINGS.hudEnabled,
    rightClickBoost:
      typeof record["rightClickBoost"] === "boolean"
        ? record["rightClickBoost"]
        : DEFAULT_SETTINGS.rightClickBoost,
    bandwidth:
      record["bandwidth"] !== undefined
        ? parseBandwidthTier(record["bandwidth"])
        : DEFAULT_SETTINGS.bandwidth,
  };
}

/**
 * Writes current `Settings` to `localStorage` safely.
 */
export function persistSettings(): void {
  if (isReplayMode()) return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(Settings));
  } catch {
    // Ignore storage write errors in restricted/private browsing contexts
  }
}

/**
 * Dispatches a global notification event so live subsystems react immediately
 * when settings change without requiring a page reload.
 */
export function dispatchSettingsChanged(): void {
  window.dispatchEvent(
    new CustomEvent<SettingsData>("spaceone:settings-changed", {
      detail: { ...Settings },
    }),
  );
}

/**
 * Loads settings from `localStorage`, validates schema, and synchronizes DOM and audio state.
 */
export function loadSettings(): void {
  let parsed: unknown = null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      parsed = JSON.parse(raw);
    }
  } catch (err: unknown) {
    console.error("Failed to parse saved settings:", err);
  }

  Object.assign(Settings, sanitizeSettings(parsed));
  applyQueryOverrides();
  syncAllOutputs();
}

/**
 * Restores all modal settings to `DEFAULT_SETTINGS` without resetting `graphics`,
 * keeping the settings modal 100% live and reload-free.
 */
export function resetSettings(): void {
  const currentGraphics = Settings.graphics;
  Object.assign(Settings, DEFAULT_SETTINGS, { graphics: currentGraphics });
  persistSettings();
  syncAllOutputs();
  dispatchSettingsChanged();
  GameAudio.onUiClick();
}

/**
 * Updates sound enabled state, syncs UI icon/modal controls, and updates Web Audio master gain.
 *
 * @param enabled - Whether sound effects should be audible.
 * @param playConfirm - Whether to play a brief confirmation tick when enabling sound.
 */
export function setSoundEnabled(enabled: boolean, playConfirm = false): void {
  Settings.soundEnabled = enabled;
  audioManager.setEnabled(enabled);
  syncSoundControls();

  if (enabled && playConfirm) {
    GameAudio.onUiClick();
  }
}

/**
 * Updates SFX master volume percentage (`0` to `100`), updates Web Audio gain,
 * and automatically unmutes if raised above `0` while muted.
 *
 * @param volume - Volume percentage in $[0, 100]$.
 */
export function setSoundVolume(volume: number): void {
  const clamped = clampVolume(volume);
  Settings.soundVolume = clamped;
  audioManager.setVolume(clamped / 100);

  if (clamped > 0 && !Settings.soundEnabled) {
    setSoundEnabled(true, false);
  }

  syncVolumeControls();
}

/**
 * Toggles sound effects on or off and persists the setting without reloading.
 */
export function toggleSound(): void {
  setSoundEnabled(!Settings.soundEnabled, true);
  persistSettings();
  dispatchSettingsChanged();
}

function applyQueryOverrides(): void {
  const qs = new URLSearchParams(window.location.search);
  const gfx = parseGraphicsQuality(qs.get("graphics"));
  if (gfx) {
    Settings.graphics = gfx;
  }
  if (qs.has("soundEnabled")) {
    Settings.soundEnabled = qs.get("soundEnabled") === "true";
  }
  if (qs.has("soundVolume")) {
    Settings.soundVolume = clampVolume(qs.get("soundVolume"));
  }
  if (qs.has("leaderboardEnabled")) {
    Settings.leaderboardEnabled = qs.get("leaderboardEnabled") === "true";
  }
  if (qs.has("hudEnabled")) {
    Settings.hudEnabled = qs.get("hudEnabled") === "true";
  }
  if (qs.has("namesEnabled")) {
    Settings.namesEnabled = qs.get("namesEnabled") === "true";
  }
  if (qs.has("showOwnName")) {
    Settings.showOwnName = qs.get("showOwnName") === "true";
  }
  if (qs.has("bigKillMessage")) {
    Settings.bigKillMessage = qs.get("bigKillMessage") === "true";
  }
  if (qs.has("bandwidth")) {
    Settings.bandwidth = parseBandwidthTier(qs.get("bandwidth"));
  }
}

const soundToggleBtn = document.getElementById(
  "sound-toggle",
) as HTMLButtonElement | null;
const soundToggleIcon = document.getElementById("sound-toggle-icon");
const soundEnabledInput = document.getElementById(
  "settings-sound-enabled",
) as HTMLInputElement | null;
const soundVolumeInput = document.getElementById(
  "settings-sound-volume",
) as HTMLInputElement | null;
const soundVolumeValue = document.getElementById("settings-sound-volume-value");
const leaderboardEnabledInput = document.getElementById(
  "settings-leaderboard-enabled",
) as HTMLInputElement | null;
const namesEnabledInput = document.getElementById(
  "settings-names-enabled",
) as HTMLInputElement | null;
const showOwnNameInput = document.getElementById(
  "settings-show-own-name",
) as HTMLInputElement | null;
const bigKillMessageInput = document.getElementById(
  "settings-big-kill-message",
) as HTMLInputElement | null;
const hudEnabledInput = document.getElementById(
  "settings-hud-enabled",
) as HTMLInputElement | null;
const rightClickBoostInput = document.getElementById(
  "settings-right-click-boost",
) as HTMLInputElement | null;
const bandwidthSelect = document.getElementById(
  "settings-bandwidth",
) as HTMLSelectElement | null;

function syncSoundControls(): void {
  const enabled = Settings.soundEnabled;

  if (soundToggleBtn) {
    soundToggleBtn.classList.toggle("sound-toggle--muted", !enabled);
    soundToggleBtn.setAttribute("aria-pressed", String(enabled));
    soundToggleBtn.title = enabled
      ? "Sound: ON (M in-game)"
      : "Sound: OFF (M in-game)";
  }

  if (soundToggleIcon) {
    soundToggleIcon.classList.toggle("fa-volume-up", enabled);
    soundToggleIcon.classList.toggle("fa-volume-mute", !enabled);
  }

  if (soundEnabledInput) {
    soundEnabledInput.checked = enabled;
  }
}

function syncVolumeControls(): void {
  if (soundVolumeInput) {
    soundVolumeInput.value = String(Settings.soundVolume);
  }
  if (soundVolumeValue) {
    soundVolumeValue.textContent = `${Settings.soundVolume}%`;
  }
}

function syncGraphicsBar(): void {
  const options = document.querySelectorAll<HTMLElement>(
    "#graphics-bar-options [data-graphics]",
  );
  options.forEach((opt) => {
    const isSelected = opt.dataset["graphics"] === Settings.graphics;
    opt.classList.toggle("graphics-bar__option--selected", isSelected);
    opt.classList.toggle("setting-selected", isSelected);
  });
}

function syncModalInputs(): void {
  syncSoundControls();
  syncVolumeControls();

  if (leaderboardEnabledInput) {
    leaderboardEnabledInput.checked = Settings.leaderboardEnabled;
  }
  if (namesEnabledInput) {
    namesEnabledInput.checked = Settings.namesEnabled;
  }
  if (showOwnNameInput) {
    showOwnNameInput.checked = Settings.showOwnName;
  }
  if (bigKillMessageInput) {
    bigKillMessageInput.checked = Settings.bigKillMessage;
  }
  if (hudEnabledInput) {
    hudEnabledInput.checked = Settings.hudEnabled;
  }
  if (rightClickBoostInput) {
    rightClickBoostInput.checked = Settings.rightClickBoost;
  }
  if (bandwidthSelect) {
    bandwidthSelect.value = String(Settings.bandwidth);
  }
}

function syncAllOutputs(): void {
  audioManager.setVolume(Settings.soundVolume / 100);
  setSoundEnabled(Settings.soundEnabled, false);
  syncGraphicsBar();
  syncModalInputs();
}

function bindLiveToggle(
  input: HTMLInputElement | null,
  applyValue: (checked: boolean) => void,
): void {
  if (!input) return;
  input.addEventListener("change", () => {
    applyValue(input.checked);
    persistSettings();
    dispatchSettingsChanged();
    GameAudio.onUiClick();
  });
}

function bindEventListeners(): void {
  const graphicsOptions = document.querySelectorAll<HTMLElement>(
    "#graphics-bar-options [data-graphics]",
  );
  graphicsOptions.forEach((elem) => {
    elem.addEventListener("click", () => {
      const nextGraphics = parseGraphicsQuality(elem.dataset["graphics"]);
      if (!nextGraphics || nextGraphics === Settings.graphics) return;
      Settings.graphics = nextGraphics;
      persistSettings();
      window.location.reload();
    });
  });

  soundToggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSound();
  });

  soundEnabledInput?.addEventListener("change", () => {
    setSoundEnabled(soundEnabledInput.checked, true);
    persistSettings();
    dispatchSettingsChanged();
  });

  soundVolumeInput?.addEventListener("input", () => {
    setSoundVolume(Number(soundVolumeInput.value));
    persistSettings();
    dispatchSettingsChanged();
  });

  soundVolumeInput?.addEventListener("change", () => {
    if (Settings.soundEnabled && Settings.soundVolume > 0) {
      GameAudio.onUiClick();
    }
  });

  bindLiveToggle(leaderboardEnabledInput, (checked) => {
    Settings.leaderboardEnabled = checked;
  });
  bindLiveToggle(namesEnabledInput, (checked) => {
    Settings.namesEnabled = checked;
  });
  bindLiveToggle(showOwnNameInput, (checked) => {
    Settings.showOwnName = checked;
  });
  bindLiveToggle(bigKillMessageInput, (checked) => {
    Settings.bigKillMessage = checked;
  });
  bindLiveToggle(hudEnabledInput, (checked) => {
    Settings.hudEnabled = checked;
  });
  bindLiveToggle(rightClickBoostInput, (checked) => {
    Settings.rightClickBoost = checked;
  });

  bandwidthSelect?.addEventListener("change", () => {
    Settings.bandwidth = parseBandwidthTier(bandwidthSelect.value);
    persistSettings();
    dispatchSettingsChanged();
    GameAudio.onUiClick();
  });

  document.getElementById("settings-reset")?.addEventListener("click", () => {
    resetSettings();
  });

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (e.key.toLowerCase() !== "m") return;

    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
    }

    if (!GameAudio.isInGame()) return;

    toggleSound();
  });
}

loadSettings();
bindEventListeners();
