import { Settings } from "./settings";
import { RenderedObject } from "./models/renderedObject";
import * as PIXI from "pixi.js";
import { Vector2 } from "./Vector2";
import type { CustomContainer } from "./CustomContainer";
import type { BodyState } from "./cache";

export class Background extends RenderedObject {
  focus: Vector2;
  speeds: number[];
  backgroundSprites: (PIXI.TilingSprite | null)[] = [];

  constructor(container: CustomContainer) {
    super(container);
    this.focus = new Vector2(0, 0);
    this.speeds = [];
    this.refreshSprite();
  }

  draw(): void {
    if (this.backgroundSprites) {
      for (let i = 0; i < this.backgroundSprites.length; i++) {
        const backgroundSprite = this.backgroundSprites[i];
        if (!backgroundSprite) continue;
        if (this.speeds && this.speeds.length > i) {
          const speed = this.speeds[i] ?? 1;
          backgroundSprite.position.x =
            -100000 *
              (Math.cos(backgroundSprite.rotation) -
                Math.sin(backgroundSprite.rotation)) -
            this.focus.x * (speed - 1);
          backgroundSprite.position.y =
            -100000 *
              (Math.sin(backgroundSprite.rotation) +
                Math.cos(backgroundSprite.rotation)) -
            this.focus.y * (speed - 1);
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

  updateFocus(focus: Vector2): void {
    this.focus = focus;
  }

  refreshSprite(): void {
    const spriteDefinition = RenderedObject.getSpriteDefinition("bg");
    if (!spriteDefinition) return;

    let layerSpeeds = spriteDefinition["layer-speeds"];
    let layerTextures = spriteDefinition["layer-textures"];
    if (!layerSpeeds || !layerTextures) {
      layerSpeeds = [];
      layerTextures = [];
    }
    const speeds = layerSpeeds;
    this.speeds = speeds;
    const allLayersTextureNames: string[] = Array.isArray(layerTextures)
      ? layerTextures
      : [layerTextures];
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
      const textures = RenderedObject.loadTexture(
        allLayersTextures[i],
        allLayersTextureNames[i] ?? "",
      );
      if (textures && textures.length > 0) {
        let backgroundSprite = this.backgroundSprites[i];
        if (!backgroundSprite) {
          backgroundSprite = new PIXI.TilingSprite(textures[0], 200000, 200000);
          backgroundSprite.parentGroup = this.container.backgroundGroup;
          this.container.addChild(backgroundSprite);
          backgroundSprite.tileScale.set(
            RenderedObject.getScale(allLayersTextures[i], textures[0]),
            RenderedObject.getScale(allLayersTextures[i], textures[0]),
          );
          backgroundSprite.rotation = Math.random() - 0.5;
          backgroundSprite.position.x =
            -100000 *
            (Math.cos(backgroundSprite.rotation) -
              Math.sin(backgroundSprite.rotation));
          backgroundSprite.position.y =
            -100000 *
            (Math.sin(backgroundSprite.rotation) +
              Math.cos(backgroundSprite.rotation));

          this.backgroundSprites[i] = backgroundSprite;
        } else backgroundSprite.texture = textures[0];
      }
    }
  }

  override destroy(): void {
    if (this.backgroundSprites) {
      for (let i = 0; i < this.backgroundSprites.length; i++) {
        const backgroundSprite = this.backgroundSprites[i];
        if (backgroundSprite) this.container.removeChild(backgroundSprite);
      }
    }

    this.backgroundSprites = [];
  }

  override update(updateData: BodyState): void {
    super.update(updateData);
  }
}
