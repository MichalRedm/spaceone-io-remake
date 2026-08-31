/**
 * @file In-game HUD overlay displaying latency, FPS, and player counts.
 * @module ui/hud
 */

import { Settings } from "./settings";

const hudh = document.getElementById("hud");

/**
 * Controller managing on-screen HUD diagnostics and window title updates.
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
   * Refreshes HUD visibility and synchronizes browser tab title with active player count.
   */
  update(): void {
    if (!hudh) return;
    hudh.hidden = !Settings.hudEnabled;
    hudh.classList.toggle("is-hidden", !Settings.hudEnabled);

    hudh.style.fontFamily = Settings.font;

    if (this.playerCount > 0)
      window.document.title = `SPACEONE.io (${this.playerCount})`;
    else window.document.title = `SPACEONE.io`;
  }
}
