import { Settings } from "./settings";
import * as PIXI from "pixi.js";
import { Vector2 } from "./Vector2";
import type { Dimension2 } from "./Dimension2";
import type { LeaderboardData } from "./leaderboard";

const minimapSize = 180;
const minimapMarginBottom = 15;
const minimapMarginRight = 15;

const colors: Record<string, number> = {
  red: 0xff0000,
  pink: 0xff00cb,
  orange: 0xffa500,
  yellow: 0xffff00,
  cyan: 0x00ffff,
  blue: 0x2255ff,
  green: 0x00ff00,
};

export class Minimap {
  ctx: PIXI.Graphics;
  worldSize = 0;

  constructor(stage: PIXI.Container, size: Dimension2) {
    this.ctx = new PIXI.Graphics();
    this.size(size);
    stage.addChild(this.ctx);
  }

  size(size: Dimension2): void {
    this.ctx.position = new Vector2(
      size.width - minimapSize - minimapMarginRight,
      size.height - minimapSize - minimapMarginBottom,
    );
  }

  checkDisplay(): void {
    if (Settings.displayMinimap !== this.ctx.visible)
      this.ctx.visible = Settings.displayMinimap;
  }

  update(_data: LeaderboardData, _worldSize: number, _fleetID: number): void {
    // Minimap update hook
  }

  drawMinimap(
    _position: Vector2,
    _color: string,
    _self: boolean,
    _rank: number,
    _isCTF: boolean,
  ): void {
    // Minimap draw hook
  }
}
