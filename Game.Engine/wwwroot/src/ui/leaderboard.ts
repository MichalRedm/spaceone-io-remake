/**
 * @file In-game leaderboard rendering (FFA, Teams, CTF), arena record banner, and leader indicator compass.
 * @module ui/leaderboard
 */

import { Settings } from "./settings";
import { Vector2 } from "../math/vector2";
import { updateHighscore } from "./log";
import type { Cache } from "../models/cache";
import type { Interpolator } from "../rendering/interpolator";
import { getTextureImage } from "../models/renderedObject";
import { Flag } from "../models/flag";

const record = document.getElementById("record");
const recordScore = document.getElementById("record-score");
const recordFleet = document.getElementById("record-fleet");
const leaderboard = document.getElementById("leaderboard");
const leaderboardLeft = document.getElementById("leaderboard-left");
const leaderboardCenter = document.getElementById("leaderboard-center");
const leaderArrow = document.getElementById(
  "leader-arrow",
) as HTMLImageElement | null;
const leaderArrowFadeZoneDist = 600;
const leaderArrowFadeZoneWidth = 200;
const leaderArrowTranslate = 50;
const leaderArrowDefaultOpacity = 0.7;

/**
 * Clears all leaderboard table DOM contents and hides the leader arrow.
 */
export function clear(): void {
  Leaderboard.ctfBlueFlagCarrierID = 0;
  Leaderboard.ctfRedFlagCarrierID = 0;
  if (leaderboard) leaderboard.innerHTML = "";
  if (leaderboardLeft) leaderboardLeft.innerHTML = "";
  if (leaderboardCenter) {
    leaderboardCenter.innerHTML = "";
    leaderboardCenter.style.width = "";
    leaderboardCenter.style.height = "";
  }
  if (leaderArrow) {
    leaderArrow.style.opacity = "0";
  }
}

/**
 * Escapes unsafe HTML characters from untrusted strings to prevent XSS injection.
 *
 * @param str - Input text.
 * @returns Sanitized string.
 */
export function escapeHtml(str?: string): string {
  if (!str) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/**
 * Historical high-score record for the current arena.
 */
export interface LeaderboardRecord {
  /** Record score. */
  Score: number;
  /** Player name who set the record. */
  Name?: string;
}

/**
 * Single leaderboard participant entry.
 */
export interface LeaderboardEntry {
  /** Fleet group identifier. */
  FleetID?: number;
  /** Player nickname. */
  Name?: string;
  /** Current player score. */
  Score?: number;
  /** Player skin color theme name. */
  Color?: string;
  /** World position of player fleet. */
  Position?: { x: number; y: number };
  /** Bitmask mode flags. */
  Mode?: number;
  /** Optional mode-specific metadata (e.g. CTF flagStatus). */
  ModeData?: { flagStatus?: string; [key: string]: unknown };
}

/**
 * Deserialized leaderboard snapshot payload from server.
 */
export interface LeaderboardData {
  /** Gameplay mode type (`"FFA"`, `"Team"`, or `"CTF"`). */
  Type: string;
  /** Ranked list of active participant entries. */
  Entries: LeaderboardEntry[];
  /** Historical high-score record. */
  Record?: LeaderboardRecord;
}

/** Recognized safe player skin color strings. */
export type LeaderboardColor =
  | "cyan"
  | "blue"
  | "green"
  | "orange"
  | "pink"
  | "red"
  | "yellow"
  | "gray"
  | "white";

/**
 * Maps server-supplied color names to safe CSS color values.
 * Any color not in this map defaults to white.
 * (Rule 11: no unvalidated server data in inline style attributes)
 */
const SAFE_COLORS: Readonly<Record<LeaderboardColor, string>> = {
  cyan: "#00ffff",
  blue: "#2255ff",
  green: "lime",
  orange: "orange",
  pink: "fuchsia",
  red: "red",
  yellow: "yellow",
  gray: "#aaaaaa",
  white: "#ffffff",
};

function toSafeCssColor(serverColor: string | undefined): string {
  if (!serverColor) return "#ffffff";
  return SAFE_COLORS[serverColor as LeaderboardColor] ?? "#ffffff";
}

function getOut(
  entry: LeaderboardEntry,
  rank?: number,
  entryIsSelf?: boolean,
): string {
  const rankStr = rank === undefined ? "" : `${rank}.`;
  const name = escapeHtml(entry.Name) || "Unknown Fleet";
  const colorClass =
    entry.Color && entryIsSelf ? `leaderboard__row--${entry.Color}` : "";
  const selfClass = entryIsSelf ? "leaderboard__row--self" : "";
  const rowClass = ["leaderboard__row", selfClass, colorClass]
    .filter(Boolean)
    .join(" ");

  return (
    `<tr class="${rowClass}">` +
    `<td class="name" title="${name}">${rankStr} ${name}</td>` +
    `<td class="score">${entry.Score ?? 0}</td>` +
    `</tr>`
  );
}

export class Leaderboard {
  /** Active carrier fleet ID for the blue flag (0 if home or dropped). */
  public static ctfBlueFlagCarrierID = 0;
  /** Active carrier fleet ID for the red flag (0 if home or dropped). */
  public static ctfRedFlagCarrierID = 0;

  /**
   * Retrieves the authoritative carrier fleet ID for a given flag sprite.
   *
   * @param sprite - Flag sprite name (e.g. 'ctf_flag_blue', 'ctf_flag_red').
   * @returns Fleet ID of carrier, or 0 if not carried.
   */
  public static getFlagCarrierFleetID(sprite?: string | false | null): number {
    const s = String(sprite || "");
    if (s.includes("blue")) return Leaderboard.ctfBlueFlagCarrierID;
    if (s.includes("red")) return Leaderboard.ctfRedFlagCarrierID;
    return 0;
  }

  private leaderFleetID: number | null = null;
  private targetLeaderPosition: Vector2 | null = null;
  private currentLeaderPosition: Vector2 | null = null;
  private hasLeader = false;
  private cyanFlagPosition: { x: number; y: number } | null = null;
  private redFlagPosition: { x: number; y: number } | null = null;

  public update(
    data: LeaderboardData,
    _position: Vector2,
    fleetID?: number,
  ): void {
    const isEnabled = Settings.leaderboardEnabled;
    if (record) record.classList.toggle("is-hidden", !isEnabled);
    if (leaderboard) leaderboard.classList.toggle("is-hidden", !isEnabled);
    if (leaderboardLeft)
      leaderboardLeft.classList.toggle("is-hidden", !isEnabled);
    if (leaderboardCenter)
      leaderboardCenter.classList.toggle("is-hidden", !isEnabled);

    if (!isEnabled) {
      this.hasLeader = false;
      if (leaderArrow) leaderArrow.style.opacity = "0";
      return;
    }

    if (data.Record && record && recordScore && recordFleet) {
      record.style.fontFamily = Settings.font;
      recordScore.innerHTML = `${data.Record.Score}`;
      recordFleet.innerHTML = `${escapeHtml(data.Record.Name) || "Unknown Fleet"}`;
    }

    if (fleetID) {
      const selfEntry = data.Entries.find((e) => e.FleetID === fleetID);
      if (selfEntry && selfEntry.Score !== undefined) {
        updateHighscore(selfEntry.Score);
      }
    }

    const ctfArena = document.getElementById("ctf-arena");
    if (ctfArena) {
      if (data.Type === "CTF") {
        ctfArena.classList.remove("hide");
      } else {
        ctfArena.classList.add("hide");
      }
    }

    // Determine rank 1 leader position and fleet ID
    const firstEntry = data.Entries[0];
    if (
      firstEntry &&
      firstEntry.Position &&
      firstEntry.FleetID !== undefined &&
      firstEntry.FleetID !== fleetID
    ) {
      this.hasLeader = true;
      this.leaderFleetID = firstEntry.FleetID;
      this.targetLeaderPosition = new Vector2(
        firstEntry.Position.x,
        firstEntry.Position.y,
      );
      if (!this.currentLeaderPosition) {
        this.currentLeaderPosition = new Vector2(
          firstEntry.Position.x,
          firstEntry.Position.y,
        );
      }
    } else {
      this.hasLeader = false;
      this.leaderFleetID = null;
      this.targetLeaderPosition = null;
    }

    if (data.Type === "FFA" && leaderboard) {
      let out = "";
      for (let i = 0; i < data.Entries.length; i++) {
        const entry = data.Entries[i];
        if (!entry) continue;
        const entryIsSelf = entry.FleetID === fleetID;
        if (i < 10 || entryIsSelf) {
          out += getOut(entry, i + 1, entryIsSelf);
        }
      }
      leaderboard.innerHTML = `<tbody>${out}</tbody>`;
      if (leaderboardCenter) {
        leaderboardCenter.innerHTML = "";
        leaderboardCenter.hidden = true;
        leaderboardCenter.classList.add("is-hidden");
        leaderboardCenter.style.width = "";
        leaderboardCenter.style.height = "";
      }
      if (leaderboardLeft) {
        leaderboardLeft.innerHTML = "";
        leaderboardLeft.hidden = true;
        leaderboardLeft.classList.add("is-hidden");
      }
    } else if (data.Type === "Team") {
      let outL = "";
      let outR = "";
      let outC = "";

      data.Entries.forEach((entry: LeaderboardEntry, i: number) => {
        const str = getOut(entry, i + 1);
        if (i === 0 || i === 1) {
          outC += str;
        } else if (entry.Color === "cyan" || entry.Color === "blue") {
          outL += str;
        } else {
          outR += str;
        }
      });

      if (leaderboard) leaderboard.innerHTML = `<tbody>${outR}</tbody>`;
      if (leaderboardLeft) leaderboardLeft.innerHTML = `<tbody>${outL}</tbody>`;
      if (leaderboardCenter)
        leaderboardCenter.innerHTML = `<tbody>${outC}</tbody>`;
    } else if (data.Type === "CTF") {
      let outL = "";
      let outR = "";
      let redFlag: LeaderboardEntry | null = null;
      let cyanFlag: LeaderboardEntry | null = null;

      data.Entries.forEach((entry: LeaderboardEntry, i: number) => {
        const str = getOut(entry, i + 1);
        if (i === 0) {
          cyanFlag = entry;
        } else if (i === 1) {
          redFlag = entry;
        } else if (entry.Color === "cyan" || entry.Color === "blue") {
          outL += str;
        } else {
          outR += str;
        }
      });

      if (cyanFlag && redFlag) {
        Leaderboard.ctfBlueFlagCarrierID =
          (cyanFlag as LeaderboardEntry).FleetID ?? 0;
        Leaderboard.ctfRedFlagCarrierID =
          (redFlag as LeaderboardEntry).FleetID ?? 0;

        if (cyanFlag.Position) {
          this.cyanFlagPosition = cyanFlag.Position;
        }
        if (redFlag.Position) {
          this.redFlagPosition = redFlag.Position;
        }

        const cyanScore = Math.min(
          (cyanFlag as LeaderboardEntry).Score ?? 0,
          5,
        );
        const redScore = Math.min((redFlag as LeaderboardEntry).Score ?? 0, 5);

        // Update home / taken flag status indicators
        const flagStatusCyan =
          cyanFlag.ModeData?.flagStatus ??
          (cyanFlag.FleetID ? "Taken" : "Home");
        const flagStatusRed =
          redFlag.ModeData?.flagStatus ?? (redFlag.FleetID ? "Taken" : "Home");

        const ctfCyanEl = document.getElementById("ctf-cyan");
        const ctfRedEl = document.getElementById("ctf-red");
        if (ctfCyanEl) {
          const homeEl = ctfCyanEl.querySelector(".home");
          const takenEl = ctfCyanEl.querySelector(".taken");
          if (homeEl && takenEl) {
            homeEl.classList.toggle("hide", flagStatusCyan === "Taken");
            takenEl.classList.toggle("hide", flagStatusCyan !== "Taken");
          }
        }
        if (ctfRedEl) {
          const homeEl = ctfRedEl.querySelector(".home");
          const takenEl = ctfRedEl.querySelector(".taken");
          if (homeEl && takenEl) {
            homeEl.classList.toggle("hide", flagStatusRed === "Taken");
            takenEl.classList.toggle("hide", flagStatusRed !== "Taken");
          }
        }

        // Render CTF score indicator banner in leaderboardCenter
        if (leaderboardCenter) {
          const image = (textureName: string) => {
            const imgElem = getTextureImage(textureName);
            const src = imgElem?.src || "";
            return `<img class="overlap" src="${src}" alt="" />`;
          };

          const finalSuffix =
            cyanScore >= 5 ? "_blue" : redScore >= 5 ? "_red" : "";

          leaderboardCenter.hidden = false;
          leaderboardCenter.classList.remove("is-hidden");
          leaderboardCenter.style.width = "372px";
          leaderboardCenter.style.height = "83px";
          leaderboardCenter.innerHTML =
            `<tbody><tr>` +
            `<td class="flag"><img id="ctf-arrow-blue" class="flag-arrow flag-arrow--blue" src="${getTextureImage("ctf_arrow_blue").src}" alt="" /></td>` +
            `<td class="ctf-score-container">` +
            image("ctf_score_stripes") +
            image(`ctf_score_left_${Math.min(cyanScore, 4)}`) +
            image(`ctf_score_right_${Math.min(redScore, 4)}`) +
            image(`ctf_score_final${finalSuffix}`) +
            `</td>` +
            `<td class="flag"><img id="ctf-arrow-red" class="flag-arrow flag-arrow--red" src="${getTextureImage("ctf_arrow_red").src}" alt="" /></td>` +
            `</tr></tbody>`;
        }
      }

      if (leaderboard) leaderboard.innerHTML = `<tbody>${outR}</tbody>`;
      if (leaderboardLeft) {
        leaderboardLeft.hidden = false;
        leaderboardLeft.classList.remove("is-hidden");
        leaderboardLeft.innerHTML = `<tbody>${outL}</tbody>`;
      }
    }
  }

  /**
   * Renders and updates the leader indicator arrow per animation frame.
   *
   * @param cameraPosition - Current interpolated world camera position.
   * @param cache - Spatial entity cache to track leader fleet ships if in view.
   * @param interpolator - Kinematic interpolator for projecting ship positions.
   * @param gameTime - Authoritative render timestamp in milliseconds.
   */
  public renderLeaderArrow(
    cameraPosition: Vector2,
    cache?: Cache,
    interpolator?: Interpolator,
    gameTime?: number,
  ): void {
    // Update CTF flag compass indicator arrows if present
    const blueArrow = document.getElementById("ctf-arrow-blue");
    const redArrow = document.getElementById("ctf-arrow-red");
    if (blueArrow || redArrow) {
      const bluePos = Flag.blueFlagPosition ?? this.cyanFlagPosition;
      const redPos = Flag.redFlagPosition ?? this.redFlagPosition;

      if (blueArrow && bluePos) {
        const blueAngle = Math.atan2(
          bluePos.y - cameraPosition.y,
          bluePos.x - cameraPosition.x,
        );
        blueArrow.style.transform = `rotate(${blueAngle}rad)`;
      }

      if (redArrow && redPos) {
        const redAngle = Math.atan2(
          redPos.y - cameraPosition.y,
          redPos.x - cameraPosition.x,
        );
        redArrow.style.transform = `rotate(${redAngle}rad)`;
      }
    }

    if (!leaderArrow) return;

    if (!this.hasLeader || !this.targetLeaderPosition) {
      leaderArrow.style.opacity = "0";
      return;
    }

    let targetWorldPos: { x: number; y: number } | null = null;

    // If the leader fleet is nearby and present in cache, calculate centroid from interpolated ships
    if (
      this.leaderFleetID !== null &&
      cache &&
      interpolator &&
      gameTime !== undefined
    ) {
      const leaderGroup = cache.getGroup(this.leaderFleetID);
      if (
        leaderGroup?.renderer?.ships &&
        leaderGroup.renderer.ships.length > 0
      ) {
        let accX = 0;
        let accY = 0;
        let count = 0;
        for (const ship of leaderGroup.renderer.ships) {
          if (ship && ship.body) {
            const posX =
              ship.lastPosition.x !== 0 || ship.lastPosition.y !== 0
                ? ship.lastPosition.x
                : (ship.body.Position?.x ?? ship.body.OriginalPosition.x);
            const posY =
              ship.lastPosition.x !== 0 || ship.lastPosition.y !== 0
                ? ship.lastPosition.y
                : (ship.body.Position?.y ?? ship.body.OriginalPosition.y);
            accX += posX;
            accY += posY;
            count++;
          }
        }
        if (count > 0) {
          targetWorldPos = { x: accX / count, y: accY / count };
        }
      }
    }

    if (!targetWorldPos) {
      targetWorldPos = this.targetLeaderPosition;
    }

    // Smoothly interpolate leader world coordinate to avoid sudden snapshot leaps
    if (!this.currentLeaderPosition) {
      this.currentLeaderPosition = new Vector2(
        targetWorldPos.x,
        targetWorldPos.y,
      );
    } else {
      const lerpFactor = 0.15;
      this.currentLeaderPosition.x +=
        (targetWorldPos.x - this.currentLeaderPosition.x) * lerpFactor;
      this.currentLeaderPosition.y +=
        (targetWorldPos.y - this.currentLeaderPosition.y) * lerpFactor;
    }

    const dx = this.currentLeaderPosition.x - cameraPosition.x;
    const dy = this.currentLeaderPosition.y - cameraPosition.y;
    let angle = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Opacity fade zone
    if (dist > leaderArrowFadeZoneDist + leaderArrowFadeZoneWidth) {
      leaderArrow.style.opacity = `${leaderArrowDefaultOpacity}`;
    } else if (dist >= leaderArrowFadeZoneDist) {
      const fadeRatio =
        (dist - leaderArrowFadeZoneDist) / leaderArrowFadeZoneWidth;
      leaderArrow.style.opacity = `${fadeRatio * leaderArrowDefaultOpacity}`;
    } else {
      leaderArrow.style.opacity = "0";
      return;
    }

    const arrowHeight = 40;
    const arrowWidth = 40;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    const criticalAngle = Math.atan2(winHeight, winWidth);
    if (angle < 0) {
      angle += 2 * Math.PI;
    }

    let screenX = 0;
    let screenY = 0;

    if (angle > 2 * Math.PI - criticalAngle || angle <= criticalAngle) {
      // Right edge
      screenX = winWidth + leaderArrowTranslate - arrowWidth;
      screenY =
        (winHeight - arrowHeight) / 2 +
        (winWidth / 2) *
          Math.tan(angle) *
          (1 - (arrowHeight - 2 * leaderArrowTranslate) / winHeight);
    } else if (angle > criticalAngle && angle <= Math.PI - criticalAngle) {
      // Bottom edge
      screenX =
        (winWidth - arrowWidth) / 2 +
        (winHeight / 2 / Math.tan(angle)) *
          (1 - (arrowWidth - 2 * leaderArrowTranslate) / winWidth);
      screenY = winHeight + leaderArrowTranslate - arrowHeight;
    } else if (
      angle > Math.PI - criticalAngle &&
      angle <= Math.PI + criticalAngle
    ) {
      // Left edge
      screenX = -leaderArrowTranslate;
      screenY =
        (winHeight - arrowHeight) / 2 -
        (winWidth / 2) *
          Math.tan(angle) *
          (1 - (arrowHeight - 2 * leaderArrowTranslate) / winHeight);
    } else {
      // Top edge
      screenX =
        (winWidth - arrowWidth) / 2 -
        (winHeight / 2 / Math.tan(angle)) *
          (1 - (arrowWidth - 2 * leaderArrowTranslate) / winWidth);
      screenY = -leaderArrowTranslate;
    }

    const rotation = angle + Math.PI / 2;
    leaderArrow.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) rotate(${rotation}rad)`;
  }
}

function blurText(
  elem: HTMLElement | null,
  blurElem: HTMLElement | null,
  text: string,
): void {
  if (elem && blurElem) {
    elem.innerText = text;
    blurElem.innerText = text;
  }
}
