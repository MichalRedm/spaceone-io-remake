/**
 * @file Dash / boost cooldown progress bar UI controller.
 * @module ui/cooldown
 */

import { Settings } from "./settings";

const progress = document.getElementById("cooldown");
const progressVal = document.getElementById("cooldownValue");

/**
 * Controller managing the on-screen dash/boost cooldown charge meter.
 */
export class Cooldown {
  /**
   * Sets the cooldown meter progress ratio.
   *
   * @param prog - Integer progress byte value $[0, 255]$.
   */
  setCooldown(prog: number): void {
    if (progress) {
      if (Settings.showCooldown) {
        progress.style.visibility = "visible";
      } else {
        progress.style.visibility = "hidden";
      }
    }

    if (progressVal) {
      progressVal.style.width = (prog / 255) * 100 + "%";
    }
  }

  /**
   * Hides the cooldown meter.
   */
  hide(): void {
    if (progress) {
      progress.style.visibility = "hidden";
    }
  }
}
