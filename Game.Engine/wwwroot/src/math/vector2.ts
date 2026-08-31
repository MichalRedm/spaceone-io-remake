/**
 * @file 2D Vector representation extending PIXI.Point for world positions, velocities, and directional headings.
 * @module math/vector2
 */

import * as PIXI from "pixi.js";

/**
 * Represents a two-dimensional geometric point or direction vector $(x, y)$.
 *
 * @remarks
 * Extends `PIXI.Point` to allow direct interop with PixiJS display object transforms,
 * while serving as the standard domain primitive for game world coordinates, velocities,
 * and aim targets.
 */
export class Vector2 extends PIXI.Point {
  /**
   * Constructs a 2D Vector instance.
   *
   * @param x - Horizontal coordinate or component.
   * @param y - Vertical coordinate or component.
   */
  constructor(x: number, y: number) {
    super(x, y);
  }
}
