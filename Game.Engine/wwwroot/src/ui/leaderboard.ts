/**
 * @file In-game leaderboard rendering (FFA, Teams, CTF), arena record banner, and leader indicator compass.
 * @module ui/leaderboard
 */

import { Settings } from "./settings";
import { RenderedObject } from "../models/renderedObject";
import arrow from "../../img/arrow.png";
import { Vector2 } from "../math/vector2";

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
 * Clears all leaderboard table DOM contents.
 */
export function clear(): void {
  if (leaderboard) leaderboard.innerHTML = "";
  if (leaderboardLeft) leaderboardLeft.innerHTML = "";
  if (leaderboardCenter) {
    leaderboardCenter.innerHTML = "";
    leaderboardCenter.style.width = "";
    leaderboardCenter.style.height = "";
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
  position: Vector2,
  rank?: number,
  entryIsSelf?: boolean,
): string {
  if (rank === 1 && entry.Position) {
    drawLeaderArrow(entry.Position, position);
  }

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
  public update(
    data: LeaderboardData,
    position: Vector2,
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

    if (data.Type === "FFA" && leaderboard) {
      let out = "";
      for (let i = 0; i < data.Entries.length; i++) {
        const entry = data.Entries[i];
        if (!entry) continue;
        const entryIsSelf = entry.FleetID === fleetID;
        if (i < 10 || entryIsSelf) {
          out += getOut(entry, position, i + 1, entryIsSelf);
        }
      }
      leaderboard.innerHTML = `<tbody>${out}</tbody>`;
    } else if (data.Type === "Team") {
      let outL = "";
      let outR = "";
      let outC = "";

      data.Entries.forEach((entry: LeaderboardEntry, i: number) => {
        const str = getOut(entry, position, i + 1);
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
        const str = getOut(entry, position, i + 1);
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

function drawLeaderArrow(
  selfPosition: { x: number; y: number },
  position: Vector2,
): void {
  if (!leaderArrow) return;
  let angle = Math.atan2(
    selfPosition.y - position.y,
    selfPosition.x - position.x,
  );
  const dist = Math.sqrt(
    Math.pow(selfPosition.y - position.y, 2) +
      Math.pow(selfPosition.x - position.x, 2),
  );
  const arrowHeight = leaderArrow.height || 40;
  const arrowWidth = leaderArrow.width || 40;

  if (dist > leaderArrowFadeZoneDist + leaderArrowFadeZoneWidth) {
    leaderArrow.style.opacity = `${leaderArrowDefaultOpacity}`;
  } else if (
    dist >= leaderArrowFadeZoneDist &&
    dist <= leaderArrowFadeZoneDist + leaderArrowFadeZoneWidth
  ) {
    leaderArrow.style.opacity = `${
      ((dist - leaderArrowFadeZoneDist) / leaderArrowFadeZoneWidth) *
      leaderArrowDefaultOpacity
    }`;
  } else {
    leaderArrow.style.opacity = "0";
  }
  const criticalAngle = Math.atan2(window.innerHeight, window.innerWidth);
  if (angle < 0) {
    angle += 2 * Math.PI;
  }
  if (angle > 2 * Math.PI - criticalAngle || angle <= criticalAngle) {
    // right
    leaderArrow.style.top =
      (window.innerHeight - arrowHeight) / 2 +
      (window.innerWidth / 2) *
        Math.tan(angle) *
        (1 - (arrowHeight - 2 * leaderArrowTranslate) / window.innerHeight) +
      "px";
    leaderArrow.style.right = -leaderArrowTranslate + "px";
    leaderArrow.style.bottom = "";
    leaderArrow.style.left = "";
  } else if (angle > criticalAngle && angle <= Math.PI - criticalAngle) {
    // bottom
    leaderArrow.style.top = "";
    leaderArrow.style.right = "";
    leaderArrow.style.bottom = -leaderArrowTranslate + "px";
    leaderArrow.style.left =
      (window.innerWidth - arrowWidth) / 2 +
      (window.innerHeight / 2 / Math.tan(angle)) *
        (1 - (arrowWidth - 2 * leaderArrowTranslate) / window.innerWidth) +
      "px";
  } else if (
    angle > Math.PI - criticalAngle &&
    angle <= Math.PI + criticalAngle
  ) {
    // left
    leaderArrow.style.top =
      (window.innerHeight - arrowHeight) / 2 -
      (window.innerWidth / 2) *
        Math.tan(angle) *
        (1 - (arrowHeight - 2 * leaderArrowTranslate) / window.innerHeight) +
      "px";
    leaderArrow.style.right = "";
    leaderArrow.style.bottom = "";
    leaderArrow.style.left = -leaderArrowTranslate + "px";
  } else {
    // top
    leaderArrow.style.top = -leaderArrowTranslate + "px";
    leaderArrow.style.right = "";
    leaderArrow.style.bottom = "";
    leaderArrow.style.left =
      (window.innerWidth - arrowWidth) / 2 -
      (window.innerHeight / 2 / Math.tan(angle)) *
        (1 - (arrowWidth - 2 * leaderArrowTranslate) / window.innerWidth) +
      "px";
  }
  angle += Math.PI / 2;
  leaderArrow.style.transform = "rotate(" + angle + "rad)";
}
