/**
 * @file Combat event log, kill notifications, floating points, and death screen statistics.
 * @module ui/log
 */

import Cookies from "js-cookie";
import { Settings } from "./settings";
import { escapeHtml } from "./leaderboard";

const log = document.getElementById("log");
const bigLog = document.getElementById("bigLog");
const scoreCon = document.getElementById("plusScoreContainer");

/**
 * Metadata payload attached to combat log events.
 */
export interface LogEntryExtraData {
  /** Round-trip ping comparisons between killer and victim. */
  ping?: { you: number; them: number };
  /** Kill/death stats summary. */
  stats?: { kills: number; deaths: number };
  /** Total score achieved. */
  score?: number;
  /** Total ships destroyed. */
  kills?: number;
  /** Active session duration in milliseconds. */
  gameTime?: number;
}

/**
 * Combat event log entry descriptor.
 */
export interface LogEntry {
  /** Event category (e.g. `'kill'`, `'killed'`, `'universeDeath'`). */
  type?: string;
  /** Event description text. */
  text?: string;
  /** Score delta awarded for the event. */
  pointsDelta?: number | string;
  /** Additional diagnostic metadata. */
  extraData?: LogEntryExtraData;
}

/**
 * Combat kill feed and session stats manager.
 */
export class Log {
  /** History buffer of recent log entries. */
  data: Array<{ time: Date; entry: LogEntry }>;
  /** Timestamp when log feed was last updated in milliseconds. */
  lastDisplay: number;

  /**
   * Constructs an empty combat log manager.
   */
  constructor() {
    this.data = [];
    this.lastDisplay = 0;
  }

  /**
   * Appends an event entry to the combat log, triggers floating score indicators, and updates kill streak messages.
   *
   * @param entry - Combat log event descriptor.
   */
  addEntry(entry: LogEntry): void {
    this.data.push({ time: new Date(), entry });
    while (this.data.length > Settings.logLength) this.data.shift();

    this.lastDisplay = performance.now();

    let out = "<table>";

    for (const slot of this.data) {
      out +=
        "<tr>" +
        `<td><b style="color:gray">${slot.time.toLocaleTimeString()}</b></td>` +
        `<td>${escapeHtml(slot.entry.text)}</td>`;

      if (slot.entry.extraData && slot.entry.extraData.ping)
        out += `<td><b style="color:gray">${slot.entry.extraData.ping.you}ms/${slot.entry.extraData.ping.them}ms</b></td>`;
      else out += "<td></td>";

      if (
        slot.entry.extraData &&
        slot.entry.extraData.stats &&
        slot.entry.extraData.stats.deaths > 0
      )
        out += `<td><b style="color:gray">k/d: ${slot.entry.extraData.stats.kills / slot.entry.extraData.stats.deaths}</b></td>`;
      else out += "<td></td>";

      out += "</tr>";
    }

    out += "</table>";

    if (log) log.innerHTML = out;

    const lastSlot = this.data[this.data.length - 1];
    if (!lastSlot) return;
    const lastData = lastSlot.entry;

    let lastMsg = "";
    if (lastData.type === "kill") {
      lastMsg = (lastData.text || "") + "!";
      if (scoreCon) {
        scoreCon.insertAdjacentHTML(
          "beforeend",
          "<div class='plusScore'>+" +
            escapeHtml(String(lastData.pointsDelta ?? "")) +
            "</div>",
        );
      }
    } else if (lastData.type === "killed") {
      deathStats(lastData);
    } else {
      if (lastData.type === "universeDeath") {
        deathStats(lastData);
      }
      return;
    }
    if (bigLog) bigLog.textContent = lastMsg;
  }

  /**
   * Periodic check called per frame to auto-fade stale combat messages.
   */
  check(): void {
    const time = performance.now() - this.lastDisplay;
    if (time > 6000 && log) {
      log.textContent = "";
    }

    if (time > 3000 && bigLog) {
      bigLog.textContent = "";
    }
  }
}

/**
 * Populates death screen stats modal (score, kills, game duration, highscore) upon player death.
 *
 * @param lastData - Death event log entry.
 */
function deathStats(lastData: LogEntry): void {
  const deathScreen = document.getElementById("deathScreen");
  if (deathScreen) deathScreen.style.visibility = "visible";
  const score = lastData.extraData?.score ?? 0;
  const scoreEl = document.getElementById("deathScreenScore");
  if (scoreEl) scoreEl.textContent = String(score);
  updateHighscore(score);
  console.log("Died with score " + score);
  const killsEl = document.getElementById("deathScreenKills");
  if (killsEl) killsEl.textContent = String(lastData.extraData?.kills ?? 0);
  const gameTime = lastData.extraData?.gameTime ?? 0;
  const gameTimeInSeconds = Math.round(gameTime / 1000);
  const gameTimeMinutes = Math.floor(gameTimeInSeconds / 60);
  const gameTimeSeconds = gameTimeInSeconds - 60 * gameTimeMinutes;
  const timeEl = document.getElementById("deathScreenGameTime");
  if (timeEl) {
    if (gameTimeMinutes === 0) {
      timeEl.textContent = `${gameTimeSeconds}sec`;
    } else {
      timeEl.textContent = `${gameTimeMinutes}min ${gameTimeSeconds}sec`;
    }
  }
}

updateHighscore(0);

/**
 * Updates personal best highscore in cookies and DOM.
 *
 * @param score - Achieved score.
 */
function updateHighscore(score: number): void {
  const currentHighscore = Number(Cookies.get("highscore") ?? 0);
  if (score >= currentHighscore) {
    Cookies.set("highscore", score);
  }
  if (score > currentHighscore) {
    console.log("New personal highscore!");
  }
  const highScoreEl = document.getElementById("high-score-num");
  if (highScoreEl) {
    highScoreEl.textContent = String(Cookies.get("highscore") ?? 0);
  }
}
