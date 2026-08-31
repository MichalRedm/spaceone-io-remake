/**
 * @file In-game leaderboard rendering (FFA, Teams, CTF), arena record banner, and leader indicator compass.
 * @module ui/leaderboard
 */

import { Settings } from "./settings";
import { Vector2 } from "../math/vector2";
import type { Cache } from "../models/cache";
import type { Interpolator } from "../rendering/interpolator";

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
  const colorClass =
    entry.Color && entryIsSelf ? `leaderboard__row--${entry.Color}` : "";
  const selfClass = entryIsSelf ? "leaderboard__row--self" : "";
  const rowClass = ["leaderboard__row", selfClass, colorClass]
    .filter(Boolean)
    .join(" ");

  return (
    `<tr class="${rowClass}">` +
    `<td class="name">${rankStr} ${escapeHtml(entry.Name) || "Unknown Squadron"}</td>` +
    `<td class="score">${entry.Score ?? 0}</td>` +
    `</tr>`
  );
}

export class Leaderboard {
  private leaderFleetID: number | null = null;
  private targetLeaderPosition: Vector2 | null = null;
  private currentLeaderPosition: Vector2 | null = null;
  private hasLeader = false;

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
      recordFleet.innerHTML = `${escapeHtml(data.Record.Name) || "Unknown Squadron"}`;
    }

    const ctfArena = document.getElementById("ctf_arena");
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
        blurText(
          document.getElementById("ctf_score_left"),
          document.getElementById("ctf_score_left_blur"),
          `${(cyanFlag as LeaderboardEntry).Score ?? 0}`,
        );
        blurText(
          document.getElementById("ctf_score_right"),
          document.getElementById("ctf_score_right_blur"),
          `${(redFlag as LeaderboardEntry).Score ?? 0}`,
        );
      }

      if (leaderboard) leaderboard.innerHTML = `<tbody>${outR}</tbody>`;
      if (leaderboardLeft) leaderboardLeft.innerHTML = `<tbody>${outL}</tbody>`;
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
          if (ship.body) {
            const projected = interpolator.projectObject(ship.body, gameTime);
            accX += projected.x;
            accY += projected.y;
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

    const arrowHeight = leaderArrow.offsetHeight || leaderArrow.height || 40;
    const arrowWidth = leaderArrow.offsetWidth || leaderArrow.width || 40;
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
