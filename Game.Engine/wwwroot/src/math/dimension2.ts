/**
 * @file 2D dimension representation for viewport, minimap, and render target sizes.
 * @module math/dimension2
 */

import * as PIXI from "pixi.js";

/**
 * Encapsulates a width and height pair representing 2D geometric dimensions.
 *
 * @remarks
 * Used throughout the rendering engine and UI subsystem (e.g. `Camera`, `Minimap`, `Renderer`)
 * to specify viewport pixel dimensions and logical canvas boundaries.
 */
export class Dimension2 {
  /** Width extent in pixels. */
  width: number;
  /** Height extent in pixels. */
  height: number;

  /**
   * Constructs a new 2D dimension container.
   *
   * @param width - Horizontal dimension in pixels.
   * @param height - Vertical dimension in pixels.
   */
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}
