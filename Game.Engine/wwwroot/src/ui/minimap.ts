/**
 * @file Radar minimap visual component stub.
 * @module ui/minimap
 */

import * as PIXI from "pixi.js";
import type { Dimension2 } from "../math/dimension2";
import type { LeaderboardData } from "./leaderboard";

/**
 * Radar minimap visual component stub for fleet tracking.
 */
export class Minimap {
  ctx?: PIXI.Graphics;

  /**
   * Constructs a Minimap component instance.
   *
   * @param _stage - Parent PIXI stage container.
   * @param _size - Viewport dimensions.
   */
  constructor(_stage?: PIXI.Container, _size?: Dimension2) {
    // Minimap is disabled
  }

  /** Resizes minimap graphic. */
  size(_size: Dimension2): void {}

  /** Checks minimap display visibility settings. */
  checkDisplay(): void {}

  /** Updates blip positions on the minimap. */
  update(_data: LeaderboardData, _worldSize: number, _fleetID: number): void {}
}
