/**
 * @file Outer world map boundary and danger zone visual graphic.
 * @module rendering/border
 */

import * as PIXI from "pixi.js";
import type { CustomContainer } from "./customContainer";
import { RenderedObject } from "../models/renderedObject";
import { hexToRGB } from "../math/hexColor";
import { Settings } from "../ui/settings";

/**
 * Visual display controller rendering world perimeter boundary lines and outer deadzone fog.
 *
 * @remarks
 * Draws a prominent red perimeter bounding box with multi-pass neon glow (on medium/high graphics)
 * and darkened off-map border quads on `CustomContainer.backgroundGroup`.
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

    // Dark red deadzone fog outside boundary
    const v = hexToRGB("#220000", 1);
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

    const redColor = 0xff0000;

    // Clean, crisp boundary stroke matching original game (GameRendering.cpp:1023)
    const lineWidth = Settings.graphics === "low" ? 3 : 4;
    this.graphics.lineStyle(lineWidth, redColor, 1.0);
    this.graphics.drawRect(-size, -size, size * 2, size * 2);

    this.worldSize = size;
  }
}
