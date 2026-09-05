/**
 * @file Combat event log, kill notifications, floating points, and high score tracking.
 * @module ui/log
 */

import Cookies from "js-cookie";
import { escapeHtml } from "./leaderboard";
import { showCtfAnnouncement } from "./ctfNotification";

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
        const popup = document.createElement("div");
        popup.className = "score-popup plusScore";
        popup.textContent = "+" + (entry.pointsDelta ?? "");
        scoreCon.appendChild(popup);
        const cleanup = () => {
          if (popup.parentNode) {
            popup.remove();
          }
        };
        popup.addEventListener("animationend", cleanup, { once: true });
        setTimeout(cleanup, 3000);
      }
    } else if (entry.type === "killed" || entry.type === "universeDeath") {
      const score = entry.extraData?.score ?? 0;
      updateHighscore(score);
      return;
    } else if (
      entry.type === "ctf" ||
      (entry.text && entry.text.startsWith("CTF:"))
    ) {
      let text = entry.text || "";
      if (text.startsWith("CTF:")) {
        text = text.slice(4).trim();
      }
      const lower = text.toLowerCase();
      let variant: "cyan" | "red" | "gold" | "default" = "default";
      if (
        lower.includes("win") ||
        lower.includes("won") ||
        lower.includes("victory") ||
        lower.includes("game over")
      ) {
        variant = "gold";
      } else if (lower.includes("blue") || lower.includes("cyan")) {
        variant = "cyan";
      } else if (lower.includes("red")) {
        variant = "red";
      }
      showCtfAnnouncement(text, variant, variant === "gold" ? 5000 : 3500);
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
    const parsed = Number(currentCookie);
    if (!isNaN(parsed)) {
      scoreParsed = parsed;
    }
  }
  if (score > scoreParsed) {
    Cookies.set("highscore", `${score}`, { expires: 365 });
    const scoreNum = document.getElementById("high-score-num");
    if (scoreNum) scoreNum.textContent = String(score);
  }
}

/**
 * Initializes the high score display from saved cookie on startup.
 */
export function initHighscore(): void {
  const apply = () => {
    const saved = Cookies.get("highscore");
    if (saved !== undefined) {
      const scoreNum = document.getElementById("high-score-num");
      if (scoreNum) scoreNum.textContent = saved;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
}

initHighscore();
