/**
 * @file Outer world map boundary and danger zone visual graphic.
 * @module rendering/border
 */

import * as PIXI from "pixi.js";
import type { CustomContainer } from "./customContainer";
import { RenderedObject } from "../models/renderedObject";
import { hexToRGB } from "../math/hexColor";

/**
 * Visual display controller rendering world perimeter boundary lines and outer deadzone fog.
 *
 * @remarks
 * Draws a prominent red perimeter bounding box and darkened off-map border quads on `CustomContainer.backgroundGroup`.
 */
export class Border extends RenderedObject {
  /** Underlying PixiJS Graphics display instance. */
  graphics: PIXI.Graphics;
  /** World half-width / radius extent in world units. */
  worldSize = 6000;

  /**
   * Constructs a Border display object attached to the background group.
   *
   * @param container - Root game rendering container.
   */
  constructor(container: CustomContainer) {
    super(container);

    this.graphics = new PIXI.Graphics();
    this.graphics.parentGroup = this.container.backgroundGroup;

    this.updateWorldSize(6000);
    this.container.addChild(this.graphics);
  }

  /**
   * Re-draws outer boundary fog and perimeter lines matching the server-configured arena radius.
   *
   * @param size - Arena boundary half-width in world units.
   */
  updateWorldSize(size: number): void {
    const edgeWidth = 4000;
    this.graphics.clear();
    const v = hexToRGB("#200000", 1);
    this.graphics.beginFill(v[0] * 256 * 256 + v[1] * 256 + v[2], v[3]);
    this.graphics.drawRect(
      -size - edgeWidth,
      -size - edgeWidth,
      2 * size + 2 * edgeWidth,
      edgeWidth,
    );
    this.graphics.drawRect(-size - edgeWidth, -size, edgeWidth, 2 * size);
    this.graphics.drawRect(+size, -size, edgeWidth, 2 * size);
    this.graphics.drawRect(
      -size - edgeWidth,
      +size,
      2 * size + 2 * edgeWidth,
      edgeWidth,
    );
    this.graphics.endFill();
    const v2 = hexToRGB("#ff0000", 1);
    this.graphics.lineStyle(3, v2[0] * 256 * 256 + v2[1] * 256 + v2[2], v2[3]);
    this.graphics.drawRect(-size, -size, size * 2, size * 2);

    this.worldSize = size;
  }
}
