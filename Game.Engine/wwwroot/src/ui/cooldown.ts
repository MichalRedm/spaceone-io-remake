/**
 * @file Weapon shot cooldown progress bar UI controller.
 * @module ui/cooldown
 */

const progress = document.getElementById("cooldown");
const progressVal = document.getElementById("cooldown-value");

/**
 * Controller managing the on-screen weapon shot cooldown charge meter.
 */
export class Cooldown {
  /**
   * Sets the weapon shot cooldown meter progress ratio and ensures the bar is visible.
   *
   * @param prog - Integer progress byte value $[0, 255]$.
   */
  setCooldown(prog: number): void {
    if (progress) {
      progress.classList.remove("is-hidden");
    }

    if (progressVal) {
      const percentage = Math.min(100, Math.max(0, (prog / 255) * 100));
      progressVal.style.width = `${percentage}%`;
      progressVal.classList.toggle("cooldown-bar__fill--ready", prog >= 255);
    }
  }

  /**
   * Hides the weapon shot cooldown meter.
   */
  hide(): void {
    if (progress) {
      progress.classList.add("is-hidden");
    }
  }
}
