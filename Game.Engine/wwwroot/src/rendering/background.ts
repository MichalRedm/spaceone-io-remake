/**
 * @file Parallax scrolling starfield and multi-layer background texture manager.
 * @module rendering/background
 */

import { Settings } from "../ui/settings";
import { RenderedObject, loadTexture } from "../models/renderedObject";
import { calculateScaleWithHeight } from "./atlasLoader";
import * as PIXI from "pixi.js";
import { Vector2 } from "../math/vector2";
import type { CustomContainer } from "./customContainer";
import type { BodyState } from "../models/cache";

/**
 * Visual controller for multi-layer tiling parallax space backgrounds.
 *
 * @remarks
 * Instantiates `PIXI.TilingSprite` objects per configured background layer and scrolls them
 * at distinct parallax speed ratios based on the active camera focus coordinates.
 */
export class Background extends RenderedObject {
  /** Focus position vector tracking camera center. */
  focus: Vector2;
  /** Speed multipliers for each parallax layer. */
  speeds: number[];
  /** Instantiated tiling sprite layers. */
  backgroundSprites: (PIXI.TilingSprite | null)[] = [];
  /** Precomputed static trigonometry coordinate offsets per layer. */
  private baseOffsets: { x: number; y: number }[] = [];

  /**
   * Constructs a Background renderer attached to `CustomContainer.backgroundGroup`.
   *
   * @param container - Root game rendering container.
   */
  constructor(container: CustomContainer) {
    super(container);
    this.focus = new Vector2(0, 0);
    this.speeds = [];
    this.refreshSprite();
  }

  /**
   * Updates parallax scroll offsets for all active tiling background layers according to camera focus.
   */
  draw(): void {
    if (this.backgroundSprites) {
      for (let i = 0; i < this.backgroundSprites.length; i++) {
        const backgroundSprite = this.backgroundSprites[i];
        if (!backgroundSprite) continue;
        if (this.speeds && this.speeds.length > i) {
          const speed = this.speeds[i] ?? 1;
          const offset = this.baseOffsets[i];
          const baseOffX = offset ? offset.x : 0;
          const baseOffY = offset ? offset.y : 0;
          backgroundSprite.position.x = baseOffX - this.focus.x * (speed - 1);
          backgroundSprite.position.y = baseOffY - this.focus.y * (speed - 1);
          if (Settings.background === "none" && backgroundSprite.visible)
            backgroundSprite.visible = false;
          if (Settings.background === "on" && !backgroundSprite.visible)
            backgroundSprite.visible = true;
        } else {
          backgroundSprite.visible = false;
        }
      }
    }
  }

  /**
   * Updates the focus tracking coordinate.
   *
   * @param focus - World-space position vector.
   */
  updateFocus(focus: Vector2): void {
    this.focus = focus;
  }

  /**
   * Reloads and reconstructs tiling sprites matching the active theme definition.
   */
  override refreshSprite(): void {
    const spriteDefinition = RenderedObject.getSpriteDefinition("bg");
    if (!spriteDefinition) return;

    let layerSpeeds = spriteDefinition["layer-speeds"] as number[] | undefined;
    let layerTextures = spriteDefinition["layer-textures"];
    if (!layerSpeeds || !layerTextures) {
      layerSpeeds = [];
      layerTextures = [];
    }
    this.speeds = layerSpeeds;
    const allLayersTextureNames: string[] = Array.isArray(layerTextures)
      ? (layerTextures as string[])
      : [layerTextures as string];
    const allLayersTextures = allLayersTextureNames.map((x: string) =>
      RenderedObject.getTextureDefinition(x),
    );
    if (!this.backgroundSprites) {
      this.backgroundSprites = [];
    }
    for (let i = 0; i < allLayersTextures.length; i++) {
      if (i >= this.backgroundSprites.length) {
        this.backgroundSprites.push(null);
      }
      const texDef = allLayersTextures[i];
      if (!texDef) continue;
      const textures = loadTexture(texDef, allLayersTextureNames[i] ?? "");
      if (textures && textures.length > 0) {
        let backgroundSprite = this.backgroundSprites[i];
        if (!backgroundSprite) {
          backgroundSprite = new PIXI.TilingSprite(textures[0], 200000, 200000);
          backgroundSprite.parentGroup = this.container.backgroundGroup;
          this.container.addChild(backgroundSprite);
          const scale = calculateScaleWithHeight(texDef, textures[0].height);
          backgroundSprite.tileScale.set(scale, scale);
          backgroundSprite.rotation = Math.random() - 0.5;
          const cosR = Math.cos(backgroundSprite.rotation);
          const sinR = Math.sin(backgroundSprite.rotation);
          const baseOffX = -100000 * (cosR - sinR);
          const baseOffY = -100000 * (sinR + cosR);
          this.baseOffsets[i] = { x: baseOffX, y: baseOffY };
          backgroundSprite.position.x = baseOffX;
          backgroundSprite.position.y = baseOffY;

          this.backgroundSprites[i] = backgroundSprite;
        } else {
          backgroundSprite.texture = textures[0];
          const cosR = Math.cos(backgroundSprite.rotation);
          const sinR = Math.sin(backgroundSprite.rotation);
          const baseOffX = -100000 * (cosR - sinR);
          const baseOffY = -100000 * (sinR + cosR);
          this.baseOffsets[i] = { x: baseOffX, y: baseOffY };
        }
      }
    }
  }

  /**
   * Destroys all tiling sprite layers from the container.
   */
  override destroy(): void {
    if (this.backgroundSprites) {
      for (let i = 0; i < this.backgroundSprites.length; i++) {
        const backgroundSprite = this.backgroundSprites[i];
        if (backgroundSprite) this.container.removeChild(backgroundSprite);
      }
    }

    this.backgroundSprites = [];
    this.baseOffsets = [];
  }

  /**
   * Ingests body state update from server snapshot.
   *
   * @param updateData - Updated kinematic state.
   */
  override update(updateData: BodyState): void {
    super.update(updateData);
  }
}
