/**
 * @file Combat event log, kill notifications, floating points, and high score tracking.
 * @module ui/log
 */

import Cookies from "js-cookie";
import { escapeHtml } from "./leaderboard";

const bigLog = document.getElementById("big-log");
const scoreCon = document.getElementById("plus-score-container");

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
  /** Timestamp when log feed was last updated in milliseconds. */
  lastDisplay: number;
  private hasActiveMessage = false;

  /**
   * Constructs an empty combat log manager.
   */
  constructor() {
    this.lastDisplay = 0;
  }

  /**
   * Appends an event entry to the combat log, triggers floating score indicators, and updates kill streak messages.
   *
   * @param entry - Combat log event descriptor.
   */
  addEntry(entry: LogEntry): void {
    this.lastDisplay = performance.now();

    let lastMsg = "";
    if (entry.type === "kill") {
      lastMsg = (entry.text || "") + "!";
      if (scoreCon) {
        scoreCon.insertAdjacentHTML(
          "beforeend",
          "<div class='score-popup plusScore'>+" +
            escapeHtml(String(entry.pointsDelta ?? "")) +
            "</div>",
        );
      }
    } else if (entry.type === "killed" || entry.type === "universeDeath") {
      const score = entry.extraData?.score ?? 0;
      updateHighscore(score);
      return;
    } else {
      return;
    }

    if (bigLog) {
      bigLog.textContent = lastMsg;
      this.hasActiveMessage = true;
    }
  }

  /**
   * Periodic check called per frame to auto-fade stale combat messages.
   */
  check(): void {
    if (!this.hasActiveMessage) return;
    const time = performance.now() - this.lastDisplay;

    if (time > 3000) {
      if (bigLog) bigLog.textContent = "";
      this.hasActiveMessage = false;
    }
  }
}

/**
 * Persists and updates player high score badge in UI and local cookies.
 *
 * @param score - Candidate session score.
 */
export function updateHighscore(score: number): void {
  const currentCookie = Cookies.get("highscore");
  let scoreParsed = 0;
  if (currentCookie) {
    scoreParsed = Number(currentCookie);
  }
  if (score > scoreParsed) {
    Cookies.set("highscore", `${score}`, { expires: 365 });
    const scoreNum = document.getElementById("high-score-num");
    if (scoreNum) scoreNum.textContent = String(score);
  }
}
