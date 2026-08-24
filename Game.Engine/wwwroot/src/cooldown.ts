import { Settings } from "./settings";

const progress = document.getElementById("cooldown");
const progressVal = document.getElementById("cooldownValue");

export class Cooldown {
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

  hide(): void {
    if (progress) {
      progress.style.visibility = "hidden";
    }
  }
}
