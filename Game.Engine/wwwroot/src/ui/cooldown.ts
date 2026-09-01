/**
 * @file Dash / boost cooldown progress bar UI controller.
 * @module ui/cooldown
 */

import { Settings } from "./settings";

const progress = document.getElementById("cooldown");
const progressVal = document.getElementById("cooldown-value");

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
      progress.classList.toggle("is-hidden", !Settings.showCooldown);
    }

    if (progressVal) {
      const percentage = Math.min(100, Math.max(0, (prog / 255) * 100));
      progressVal.style.width = `${percentage}%`;
      progressVal.classList.toggle("cooldown-bar__fill--ready", prog >= 255);
    }
  }

  /**
   * Hides the cooldown meter.
   */
  hide(): void {
    if (progress) {
      progress.classList.add("is-hidden");
    }
  }
}
