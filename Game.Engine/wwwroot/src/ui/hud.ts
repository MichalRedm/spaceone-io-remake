/**
 * @file In-game HUD overlay displaying FPS, latency, and tab player count.
 * @module ui/hud
 */

import { Settings } from "./settings";

const hudEl = document.getElementById("hud");

/**
 * Controller managing on-screen FPS/Ping diagnostics and browser tab player counts.
 */
export class HUD {
  /** Internal latency tracker in milliseconds. */
  _latency = 0;
  /** Active frames-per-second metric. */
  framesPerSecond = 0;
  /** Active in-game player count. */
  playerCount = 0;
  /** Active in-game spectator count. */
  spectatorCount = 0;

  /**
   * Sets current network latency and refreshes HUD view.
   */
  set latency(l: number) {
    this._latency = l;
    this.update();
  }

  /**
   * Refreshes HUD diagnostics visibility/readout and synchronizes browser tab title.
   */
  update(): void {
    if (this.playerCount > 0) {
      window.document.title = `SPACEONE.io (${this.playerCount})`;
    } else {
      window.document.title = "SPACEONE.io";
    }

    if (!hudEl) return;

    const isGameplayActive =
      document.body.classList.contains("alive") ||
      document.body.classList.contains("spectating");
    const shouldShow = Settings.hudEnabled && isGameplayActive;

    hudEl.hidden = !shouldShow;
    hudEl.classList.toggle("is-hidden", !shouldShow);

    if (shouldShow) {
      hudEl.textContent = `${this.framesPerSecond} FPS · ${Math.round(this._latency)} ms`;
    }
  }
}
