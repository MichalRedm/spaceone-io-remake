import * as PIXI from "pixi.js";
import type { Dimension2 } from "../math/dimension2";
import type { LeaderboardData } from "./leaderboard";

export class Minimap {
  ctx?: PIXI.Graphics;

  constructor(_stage?: PIXI.Container, _size?: Dimension2) {
    // Minimap is disabled
  }

  size(_size: Dimension2): void {}

  checkDisplay(): void {}

  update(_data: LeaderboardData, _worldSize: number, _fleetID: number): void {}
}
