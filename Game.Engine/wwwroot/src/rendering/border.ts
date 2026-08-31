/**
 * @file Outer world map boundary and danger zone visual graphic.
 * @module rendering/border
 */

import * as PIXI from "pixi.js";
import type { CustomContainer } from "./customContainer";
import { RenderedObject } from "../models/renderedObject";
import { hexToRGB } from "../math/hexColor";
import { Settings } from "../ui/settings";

let _glowTextureH: PIXI.Texture | null = null;
let _glowTextureV: PIXI.Texture | null = null;

function getGlowTextures(): {
  horizontal: PIXI.Texture;
  vertical: PIXI.Texture;
} {
  if (_glowTextureH && _glowTextureV) {
    return { horizontal: _glowTextureH, vertical: _glowTextureV };
  }

  const size = 64;

  // Horizontal gradient texture (for left & right vertical border walls)
  const canvasH = document.createElement("canvas");
  canvasH.width = size;
  canvasH.height = 2;
  const ctxH = canvasH.getContext("2d")!;
  const gradH = ctxH.createLinearGradient(0, 0, size, 0);
  gradH.addColorStop(0.0, "rgba(255, 0, 0, 0)");
  gradH.addColorStop(0.15, "rgba(255, 0, 0, 0.01)");
  gradH.addColorStop(0.3, "rgba(255, 0, 0, 0.04)");
  gradH.addColorStop(0.42, "rgba(255, 0, 0, 0.14)");
  gradH.addColorStop(0.5, "rgba(255, 0, 0, 0.25)");
  gradH.addColorStop(0.58, "rgba(255, 0, 0, 0.14)");
  gradH.addColorStop(0.7, "rgba(255, 0, 0, 0.04)");
  gradH.addColorStop(0.85, "rgba(255, 0, 0, 0.01)");
  gradH.addColorStop(1.0, "rgba(255, 0, 0, 0)");
  ctxH.fillStyle = gradH;
  ctxH.fillRect(0, 0, size, 2);

  // Vertical gradient texture (for top & bottom horizontal border walls)
  const canvasV = document.createElement("canvas");
  canvasV.width = 2;
  canvasV.height = size;
  const ctxV = canvasV.getContext("2d")!;
  const gradV = ctxV.createLinearGradient(0, 0, 0, size);
  gradV.addColorStop(0.0, "rgba(255, 0, 0, 0)");
  gradV.addColorStop(0.15, "rgba(255, 0, 0, 0.01)");
  gradV.addColorStop(0.3, "rgba(255, 0, 0, 0.04)");
  gradV.addColorStop(0.42, "rgba(255, 0, 0, 0.14)");
  gradV.addColorStop(0.5, "rgba(255, 0, 0, 0.25)");
  gradV.addColorStop(0.58, "rgba(255, 0, 0, 0.14)");
  gradV.addColorStop(0.7, "rgba(255, 0, 0, 0.04)");
  gradV.addColorStop(0.85, "rgba(255, 0, 0, 0.01)");
  gradV.addColorStop(1.0, "rgba(255, 0, 0, 0)");
  ctxV.fillStyle = gradV;
  ctxV.fillRect(0, 0, 2, size);

  const baseTexH = new PIXI.BaseTexture(canvasH, {
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    wrapMode: PIXI.WRAP_MODES.REPEAT,
  });
  _glowTextureH = new PIXI.Texture(baseTexH);

  const baseTexV = new PIXI.BaseTexture(canvasV, {
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    wrapMode: PIXI.WRAP_MODES.REPEAT,
  });
  _glowTextureV = new PIXI.Texture(baseTexV);

  return { horizontal: _glowTextureH, vertical: _glowTextureV };
}

/**
 * Visual display controller rendering world perimeter boundary lines and outer deadzone fog.
 *
 * @remarks
 * Draws a prominent red perimeter bounding box with subtle continuous gradient glow (on medium/high graphics)
 * and darkened off-map border quads on `CustomContainer.backgroundGroup`.
 */
export class Border extends RenderedObject {
  /** Underlying PixiJS Graphics display instance for fog and crisp line. */
  graphics: PIXI.Graphics;
  /** Four boundary glow tiling sprites. */
  topGlow: PIXI.TilingSprite;
  bottomGlow: PIXI.TilingSprite;
  leftGlow: PIXI.TilingSprite;
  rightGlow: PIXI.TilingSprite;
  /** World half-width / radius extent in world units. */
  worldSize = 6000;

  /**
   * Constructs a Border display object attached to the background group.
   *
   * @param container - Root game rendering container.
   */
  constructor(container: CustomContainer) {
    super(container);

    const { horizontal, vertical } = getGlowTextures();

    // 1. Graphics for deadzone dark red fog
    this.graphics = new PIXI.Graphics();
    this.graphics.parentGroup = this.container.backgroundGroup;
    this.container.addChild(this.graphics);

    // 2. Tiling sprites for smooth continuous Gaussian halo glow (rendered in front of fog)
    this.topGlow = new PIXI.TilingSprite(vertical, 1, 1);
    this.bottomGlow = new PIXI.TilingSprite(vertical, 1, 1);
    this.leftGlow = new PIXI.TilingSprite(horizontal, 1, 1);
    this.rightGlow = new PIXI.TilingSprite(horizontal, 1, 1);

    this.topGlow.parentGroup = this.container.backgroundGroup;
    this.bottomGlow.parentGroup = this.container.backgroundGroup;
    this.leftGlow.parentGroup = this.container.backgroundGroup;
    this.rightGlow.parentGroup = this.container.backgroundGroup;

    this.container.addChild(
      this.topGlow,
      this.bottomGlow,
      this.leftGlow,
      this.rightGlow,
    );

    this.updateWorldSize(6000);
  }

  /**
   * Re-draws outer boundary fog and perimeter lines matching the server-configured arena radius.
   *
   * @param size - Arena boundary half-width in world units.
   */
  updateWorldSize(size: number): void {
    const edgeWidth = 4000;
    const isLow = Settings.graphics === "low";
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

    // Core crisp boundary line (4px on high/medium, 3px on low matching GameRendering.cpp:1023)
    const redColor = 0xff0000;
    const lineWidth = isLow ? 3 : 4;
    this.graphics.lineStyle(lineWidth, redColor, 1.0);
    this.graphics.drawRect(-size, -size, size * 2, size * 2);

    // Subtle continuous Gaussian gradient halo
    if (!isLow) {
      const glowThickness = 16;
      const half = glowThickness / 2;

      this.topGlow.visible = true;
      this.bottomGlow.visible = true;
      this.leftGlow.visible = true;
      this.rightGlow.visible = true;

      // Top & Bottom cover full outer span
      this.topGlow.x = -size - half;
      this.topGlow.y = -size - half;
      this.topGlow.width = 2 * size + glowThickness;
      this.topGlow.height = glowThickness;

      this.bottomGlow.x = -size - half;
      this.bottomGlow.y = +size - half;
      this.bottomGlow.width = 2 * size + glowThickness;
      this.bottomGlow.height = glowThickness;

      // Left & Right fit seamlessly between Top and Bottom (zero corner overlap artifact)
      this.leftGlow.x = -size - half;
      this.leftGlow.y = -size + half;
      this.leftGlow.width = glowThickness;
      this.leftGlow.height = 2 * size - glowThickness;

      this.rightGlow.x = +size - half;
      this.rightGlow.y = -size + half;
      this.rightGlow.width = glowThickness;
      this.rightGlow.height = 2 * size - glowThickness;
    } else {
      this.topGlow.visible = false;
      this.bottomGlow.visible = false;
      this.leftGlow.visible = false;
      this.rightGlow.visible = false;
    }

    this.worldSize = size;
  }
}
