/**
 * @file Client game settings, cookie persistence, and theme rule synchronization.
 * @module ui/settings
 */

import Cookies from "js-cookie";
import { textureCache } from "../models/textureCache";
import { getDefaultTextureMapRules } from "../models/textureMap";
import { getDefaultSpriteModeMapRules } from "../models/spriteModeMap";
import { Controls } from "./controls";

/**
 * Game configuration options persisted across sessions in cookies.
 */
export interface SettingsData {
  /** Graphics quality level (`"low"`, `"medium"`, or `"high"`). */
  graphics: string;
  /** Built-in visual theme name. */
  theme: string;
  /** Custom remote theme stylesheet URL. */
  themeCustom: string;
  /** Steering mouse sensitivity scale factor. */
  mouseScale: number;
  /** UI and nametag font family. */
  font: string;
  /** Whether the leaderboard panel is visible. */
  leaderboardEnabled: boolean;
  /** Whether latency and FPS counter HUD is visible. */
  hudEnabled: boolean;
  /** Whether fleet nametags are rendered. */
  namesEnabled: boolean;
  /** Target network update rate / bandwidth throttle. */
  bandwidth: number;
  /** Whether dash cooldown charge meter is shown. */
  showCooldown: boolean;
  /** Maximum number of lines displayed in combat event log. */
  logLength: number;
  /** Whether radar minimap is displayed. */
  displayMinimap: boolean;
  /** Whether big kill notification banners appear. */
  bigKillMessage: boolean;
  /** Whether keyboard hints are displayed in controls modal. */
  showKeyboardHints: boolean;
  /** Whether player's own nametag is displayed over their ship. */
  showOwnName: boolean;
  /** Whether dark blue ship skins are permitted. */
  allowDarkblueShips: boolean;
  /** Whether controls hint ticker is shown. */
  showHints: boolean;
  /** Font size for player nametag captions. */
  nameSize: number;
  /** Background starfield visibility (`"on"` or `"none"`). */
  background: string;
  /** Whether WebGL mipmapping is enabled for textures. */
  mipmapping: boolean;
  /** Settings schema version tracker. */
  updatesVersion: number;
  /** Mouse button binding mode for one-button controls. */
  mouseOneButton: number;
  [key: string]: string | number | boolean;
}

/**
 * Active game settings repository.
 */
export const Settings: SettingsData = {
  graphics: "high",
  theme: "",
  themeCustom: "",
  mouseScale: 1.0,
  font: "Exo 2",
  leaderboardEnabled: true,
  hudEnabled: true,
  namesEnabled: true,
  bandwidth: 100,
  showCooldown: true,
  logLength: 4,
  displayMinimap: false,
  bigKillMessage: true,
  showKeyboardHints: true,
  showOwnName: true,
  allowDarkblueShips: true,
  showHints: true,
  nameSize: 14,
  background: "on",
  mipmapping: true,
  updatesVersion: 0,
  mouseOneButton: 0,
};

/** Active sprite mode rules matching current graphics level. */
export const spriteModeMapRules = [
  getDefaultSpriteModeMapRules(Settings.graphics),
];

/** Active texture map rules matching current graphics level. */
export const textureMapRules = [getDefaultTextureMapRules(Settings.graphics)];

const themeSelector = document.getElementById(
  "settingsThemeSelector",
) as HTMLInputElement | null;
const themeSelectorCustom = document.getElementById(
  "settingsThemeSelectorCustom",
) as HTMLInputElement | null;
const mouseScale = document.getElementById(
  "settingsMouseScale",
) as HTMLInputElement | null;
const leaderboardEnabled = document.getElementById(
  "settingsLeaderboardEnabled",
) as HTMLInputElement | null;
const showHints = document.getElementById(
  "settingsShowHints",
) as HTMLInputElement | null;
const namesEnabled = document.getElementById(
  "settingsNamesEnabled",
) as HTMLInputElement | null;
const bandwidth = document.getElementById(
  "settingsBandwidth",
) as HTMLInputElement | null;
const hudEnabled = document.getElementById(
  "settingsHUDEnabled",
) as HTMLInputElement | null;
const showCooldown = document.getElementById(
  "settingsShowCooldown",
) as HTMLInputElement | null;
const logLength = document.getElementById(
  "settingsLog",
) as HTMLInputElement | null;
const displayMinimap = document.getElementById(
  "settingsDisplayMinimap",
) as HTMLInputElement | null;
const mipmapping = document.getElementById(
  "settingsMipMapping",
) as HTMLInputElement | null;
const bigKillMessage = document.getElementById(
  "settingsBigKillMessage",
) as HTMLInputElement | null;
const showKeyboardHints = document.getElementById(
  "settingsShowKeyboardHints",
) as HTMLInputElement | null;
const showOwnName = document.getElementById(
  "settingsShowOwnName",
) as HTMLInputElement | null;
const allowDarkblueShips = document.getElementById(
  "settingsAllowDarkblueShips",
) as HTMLInputElement | null;
const nameSize = document.getElementById(
  "settingsNameSize",
) as HTMLInputElement | null;
const background = document.getElementById(
  "settingsBackground",
) as HTMLInputElement | null;

const settingsText = document.getElementById("settings-text");
if (settingsText) {
  Array.from(settingsText.children).forEach((elem) => {
    elem.addEventListener("click", () => {
      Settings.graphics = elem.id.split("-")[1] ?? "high";
      Cookies.set("settings", JSON.stringify(Settings), { expires: 300 });
      window.location.reload();
    });
  });
}

export function save(): void {
  const cookieOptions = { expires: 300 };
  let reload = false;

  if (themeSelector && Settings.theme !== themeSelector.value) {
    Settings.theme = themeSelector.value;
  }
  if (
    themeSelectorCustom &&
    Settings.themeCustom !== themeSelectorCustom.value
  ) {
    Settings.themeCustom = themeSelectorCustom.value;
  }

  if (mipmapping && Settings.mipmapping !== mipmapping.checked) {
    Settings.mipmapping = mipmapping.checked;
    reload = true;
  }

  Settings.font = "Exo 2";
  if (mouseScale) Settings.mouseScale = Number(mouseScale.value);
  if (leaderboardEnabled)
    Settings.leaderboardEnabled = leaderboardEnabled.checked;
  if (showHints) Settings.showHints = showHints.checked;
  if (namesEnabled) Settings.namesEnabled = namesEnabled.checked;
  if (bandwidth) Settings.bandwidth = Number(bandwidth.value);
  if (hudEnabled) Settings.hudEnabled = hudEnabled.checked;
  if (showCooldown) Settings.showCooldown = showCooldown.checked;
  if (logLength) Settings.logLength = Number(logLength.value);
  if (displayMinimap) Settings.displayMinimap = displayMinimap.checked;
  if (mipmapping) Settings.mipmapping = mipmapping.checked;
  if (bigKillMessage) Settings.bigKillMessage = bigKillMessage.checked;
  if (showKeyboardHints) Settings.showKeyboardHints = showKeyboardHints.checked;
  if (showOwnName) Settings.showOwnName = showOwnName.checked;
  if (allowDarkblueShips)
    Settings.allowDarkblueShips = allowDarkblueShips.checked;
  if (background) Settings.background = background.value;

  Cookies.set("settings", JSON.stringify(Settings), cookieOptions);

  if (reload) window.location.reload();
}

export function reset(): void {
  Cookies.remove("settings");
}

export function load(): void {
  let savedSettings: Record<string, any> | null = null;
  const cookie = Cookies.get("settings");
  if (cookie) {
    try {
      savedSettings = JSON.parse(cookie);
    } catch (e) {
      console.error("Failed to parse settings cookie:", e);
    }
  }

  if (savedSettings) {
    for (const key in savedSettings) Settings[key] = savedSettings[key];
  }

  if (themeSelector) themeSelector.value = Settings.theme;
  if (themeSelectorCustom)
    themeSelectorCustom.value = Settings.themeCustom ?? "";

  if (mouseScale) mouseScale.value = String(Settings.mouseScale);
  if (leaderboardEnabled)
    leaderboardEnabled.checked = Settings.leaderboardEnabled;
  if (showHints) showHints.checked = Settings.showHints;
  if (mipmapping) mipmapping.checked = Settings.mipmapping;
  if (namesEnabled) namesEnabled.checked = Settings.namesEnabled;
  if (bandwidth) bandwidth.value = String(Settings.bandwidth);
  if (hudEnabled) hudEnabled.checked = Settings.hudEnabled;
  if (showCooldown) showCooldown.checked = Settings.showCooldown;
  if (logLength) logLength.value = String(Settings.logLength);
  if (displayMinimap) displayMinimap.checked = Settings.displayMinimap;
  if (bigKillMessage) bigKillMessage.checked = Settings.bigKillMessage;
  if (showKeyboardHints) showKeyboardHints.checked = Settings.showKeyboardHints;
  if (showOwnName) showOwnName.checked = Settings.showOwnName;
  if (allowDarkblueShips)
    allowDarkblueShips.checked = Settings.allowDarkblueShips;
  if (nameSize) nameSize.value = String(Settings.nameSize);
  if (background) background.value = Settings.background;

  const graphicsElem = document.getElementById(`graphics-${Settings.graphics}`);
  graphicsElem?.classList.add("setting-selected");
}

(window as any).getTextureMapRules = function () {
  return textureMapRules;
};
(window as any).getModeMapRules = function () {
  return spriteModeMapRules;
};

load();

// Override settings from querystring values
const qs = new URLSearchParams(window.location.search);
if (qs.has("themeCustom")) Settings.themeCustom = qs.get("themeCustom") ?? "";
if (qs.has("leaderboardEnabled"))
  Settings.leaderboardEnabled = qs.get("leaderboardEnabled") === "true";
if (qs.has("hudEnabled")) Settings.hudEnabled = qs.get("hudEnabled") === "true";
if (qs.has("namesEnabled"))
  Settings.namesEnabled = qs.get("namesEnabled") === "true";
if (qs.has("bandwidth")) Settings.bandwidth = Number(qs.get("bandwidth"));

const gear = document.getElementById("gear");
document.getElementById("settings")?.addEventListener("click", () => {
  gear?.classList.remove("closed");
});

document.getElementById("settingsCancel")?.addEventListener("click", () => {
  gear?.classList.add("closed");
});

document.getElementById("settingsSave")?.addEventListener("click", () => {
  save();
  load();
  gear?.classList.add("closed");
});

document.getElementById("settingsReset")?.addEventListener("click", () => {
  reset();
  window.location.reload();
});
