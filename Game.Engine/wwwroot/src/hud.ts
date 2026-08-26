import { Settings } from "./settings";

const hudh = document.getElementById("hud");
export class HUD {
  _latency = 0;
  framesPerSecond = 0;
  playerCount = 0;
  spectatorCount = 0;

  set latency(l: number) {
    this._latency = l;
    this.update();
  }

  update(): void {
    if (!hudh) return;
    if (Settings.hudEnabled) hudh.style.visibility = "visible";
    else hudh.style.visibility = "hidden";

    hudh.style.fontFamily = Settings.font;

    if (this.playerCount > 0)
      window.document.title = `SPACEONE.io (${this.playerCount})`;
    else window.document.title = `SPACEONE.io`;
  }
}
