/**
 * textureLoader.ts
 *
 * Service that encapsulates all texture and sprite definition resolution:
 *  - Querying SCSS-parsed theme rules via `queryProperties()`
 *  - Resolving texture names to cached PIXI.Texture arrays
 *  - Building PIXI.Sprite / PIXI.AnimatedSprite instances from definitions
 *  - Building pixi-particles Emitter instances
 *
 * Previously these were static methods on `RenderedObject`, violating the
 * Single Responsibility Principle (Rule 13). Centralising them here allows
 * `RenderedObject` to act as a pure View controller (Rule 14).
 */

import * as emittersJson from "../../img/emitters.json";
import * as PIXI from "pixi.js";
import * as particles from "pixi-particles";
import { textureCache } from "./textureCache";
import {
  createTextureFromDefinition,
  calculateScaleWithHeight,
  images,
} from "../rendering/atlasLoader";
import { queryProperties } from "../parser/parseTheme";
import { parseMapKey } from "./textureUtils";
import type { TextureDefinition } from "./textureUtils";
import type { CustomSpriteLayer } from "./renderedObject";
import type { CustomContainer } from "../rendering/customContainer";
import type { ThemeRule } from "../parser/parseTheme";
import { GroupParticle } from "./groupParticle";
import type { RenderedObject } from "./renderedObject";
import { Settings } from "../ui/settings";

// ---------------------------------------------------------------------------
// TextureLoader
// ---------------------------------------------------------------------------

export class TextureLoader {
  private readonly textureMapRules: ThemeRule[];
  private readonly spriteModeMapRules: ThemeRule[];

  constructor(textureMapRules: ThemeRule[], spriteModeMapRules: ThemeRule[]) {
    this.textureMapRules = textureMapRules;
    this.spriteModeMapRules = spriteModeMapRules;
  }

  // -------------------------------------------------------------------------
  // Texture definition resolution
  // -------------------------------------------------------------------------

  /**
   * Looks up the texture definition object for `textureName` from the SCSS
   * theme rules. Returns `null` if no definition is found.
   */
  getTextureDefinition(textureName: string): TextureDefinition | null {
    const mapKey = parseMapKey(textureName);
    if (mapKey) textureName = mapKey.name;

    let textureDefinition: TextureDefinition | null = null;
    try {
      const raw = queryProperties(
        { element: textureName },
        this.textureMapRules[0],
      ) as Record<string, string[]>;

      textureDefinition = this._normalizeDefinition(raw);
    } catch (e) {
      console.log("TEXTURE FAILED:", e);
    }
    if (!textureDefinition) console.log(`cannot load texture '${textureName}'`);
    return textureDefinition;
  }

  /**
   * Looks up the sprite mode definition (layer texture list) for `spriteName`
   * combined with the provided mode class strings.
   */
  getSpriteDefinition(
    spriteName: string,
    additional: string[] = [],
  ): Record<string, unknown> | null {
    const mapKey = parseMapKey(spriteName);
    if (mapKey) spriteName = mapKey.name;

    let spriteDefinition: Record<string, unknown> | null = null;
    try {
      const raw = queryProperties(
        {
          element: spriteName.split("_")[0],
          class: spriteName.split("_").join(" ") + " " + additional.join(" "),
        },
        this.spriteModeMapRules[0],
      ) as Record<string, string[]>;

      spriteDefinition = this._normalizeDefinition(raw, [
        "textures",
        "layer-textures",
        "layer-cpu-levels",
        "layer-speeds",
      ]) as Record<string, unknown>;
    } catch (e) {
      console.log("SPRITE FAILED:", e);
    }
    if (!spriteDefinition) console.log(`Cannot find sprite: ${spriteName}`);
    return spriteDefinition;
  }

  /**
   * Resolves a texture name to a cached array of `PIXI.Texture` frames.
   * Falls back to `createTextureFromDefinition` if not already cached.
   */
  loadTexture(
    textureDefinition: TextureDefinition,
    textureName: string,
  ): PIXI.Texture[] | null {
    if (!textureName) return null;
    const cleanName = String(textureName);

    let textures =
      textureCache[cleanName] ?? textureCache[cleanName.toLowerCase()];

    if (!textures && textureDefinition.file) {
      const fileKey = String(textureDefinition.file);
      textures = textureCache[fileKey] ?? textureCache[fileKey.toLowerCase()];
      if (textures) {
        textureCache[cleanName] = textures;
        return textures;
      }
    }

    if (!textures) {
      textures = createTextureFromDefinition(
        textureDefinition,
        textureName,
        Settings.mipmapping,
      );
    }

    return textures;
  }

  // -------------------------------------------------------------------------
  // Sprite / emitter construction
  // -------------------------------------------------------------------------

  /**
   * Builds a PIXI display object (Sprite or AnimatedSprite) for `textureName`.
   * Returns `null` if the definition is missing, is an emitter, or the texture
   * cannot be resolved.
   */
  buildSprite(
    textureName: string,
    spriteName: string,
    container: CustomContainer,
  ): CustomSpriteLayer | null {
    if (!textureName) return null;
    const textureDefinition = this.getTextureDefinition(textureName);
    if (!textureDefinition) return null;
    const textures = this.loadTexture(textureDefinition, textureName);
    if (!textures || !textures.length) return null;

    let pixiSprite: PIXI.Sprite | PIXI.AnimatedSprite | null = null;

    if (textureDefinition.animated) {
      const animated = new PIXI.AnimatedSprite(textures);
      animated.loop = Boolean(textureDefinition.loop);
      animated.animationSpeed = Number(
        textureDefinition["animation-speed"] ?? 1,
      );
      animated.parentGroup = container.bodyGroup;
      pixiSprite = animated;
    } else if (textureDefinition.emitter) {
      return null; // emitters are handled by buildEmitter()
    } else if (textureDefinition.map) {
      console.log("warning: requested tile from TextureLoader");
      return null;
    } else {
      const sprite = new PIXI.Sprite(textures[0]);
      sprite.parentGroup = container.bodyGroup;
      pixiSprite = sprite;
    }

    if (!pixiSprite) return null;

    // Apply definition properties
    if (textureDefinition.tint !== undefined) {
      if (typeof textureDefinition.tint === "string") {
        pixiSprite.tint = parseInt(textureDefinition.tint, 10);
      } else {
        pixiSprite.tint = Number(textureDefinition.tint);
      }
    }
    if (textureDefinition.alpha !== undefined) {
      pixiSprite.alpha = Number(textureDefinition.alpha);
    }
    if (textureDefinition.blendMode !== undefined) {
      pixiSprite.blendMode = textureDefinition.blendMode;
    }

    pixiSprite.pivot.x = pixiSprite.width / 2;
    pixiSprite.pivot.y = pixiSprite.height / 2;
    pixiSprite.x = 0;
    pixiSprite.y = 0;

    const layer = pixiSprite as CustomSpriteLayer;
    layer.baseScale = calculateScaleWithHeight(
      textureDefinition,
      textures[0].height,
    );
    layer.scale.set(layer.baseScale, layer.baseScale);
    layer.textureDefinition = textureDefinition;

    // Rotation
    let rot = Math.PI / 2;
    if (textureDefinition.rotate !== undefined) {
      const rotVal = String(textureDefinition.rotate);
      if (rotVal.endsWith("deg")) {
        rot = (parseFloat(rotVal) * Math.PI) / 180;
      } else {
        const num = parseFloat(rotVal);
        rot = Math.abs(num) > 6.283185 ? (num * Math.PI) / 180 : num;
      }
    }
    layer.baseRotation = rot;

    // Offset
    const offsetX =
      textureDefinition["offset-x"] !== undefined
        ? Number(textureDefinition["offset-x"])
        : textureDefinition.offset?.x !== undefined
          ? Number(textureDefinition.offset.x)
          : 0;
    const offsetY =
      textureDefinition["offset-y"] !== undefined
        ? Number(textureDefinition["offset-y"])
        : textureDefinition.offset?.y !== undefined
          ? Number(textureDefinition.offset.y)
          : 0;
    layer.baseOffset = { x: offsetX, y: offsetY };

    if (
      textureDefinition.animated &&
      pixiSprite instanceof PIXI.AnimatedSprite
    ) {
      pixiSprite.play();
    }

    return layer;
  }

  /**
   * Builds a `particles.Emitter` for `textureName` and attaches it to
   * the owning `RenderedObject`. Returns `null` if the definition is not
   * an emitter or the particle texture cannot be resolved.
   */
  buildEmitter(
    textureName: string,
    container: CustomContainer,
    owner: RenderedObject,
  ): particles.Emitter | null {
    const textureDefinition = this.getTextureDefinition(textureName);
    if (!textureDefinition || !textureDefinition.emitter) return null;

    const particleTextureName =
      (textureDefinition.particle as string | undefined) ?? "particle_cyan";
    const particleDef = this.getTextureDefinition(particleTextureName);
    if (!particleDef) return null;
    const particleTextures = this.loadTexture(particleDef, particleTextureName);
    if (!particleTextures || !particleTextures.length) return null;

    let emitterConfig: unknown = textureDefinition.emitter;
    if (typeof emitterConfig === "string") {
      emitterConfig = (emittersJson as Record<string, unknown>)[emitterConfig];
    }
    if (!emitterConfig) return null;

    const emitterLayer = new particles.Emitter(
      container.emitterContainer,
      particleTextures,
      emitterConfig as particles.OldEmitterConfig,
    );
    emitterLayer.emit = true;
    (emitterLayer as unknown as Record<string, unknown>).renderedObject = owner;
    emitterLayer.particleConstructor = GroupParticle;
    (emitterLayer as unknown as Record<string, unknown>).textureName =
      textureName;
    (emitterLayer as unknown as Record<string, unknown>).textureDefinition =
      textureDefinition;

    return emitterLayer;
  }

  /**
   * Creates an `HTMLImageElement` loaded from the file or URL specified in
   * a texture definition.
   */
  getImageFromTextureDefinition(
    textureDefinition: TextureDefinition,
  ): HTMLImageElement {
    const img = new Image();
    if (textureDefinition.url) {
      img.src = textureDefinition.url;
    } else if (textureDefinition.file) {
      const src = images[textureDefinition.file];
      if (src) img.src = src;
    }
    return img;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Converts the raw `string[][]` map returned by `queryProperties` into a
   * flat object where single-element arrays are unwrapped to scalars.
   * Arrays listed in `keepArrayKeys` are never unwrapped.
   */
  private _normalizeDefinition(
    raw: Record<string, string[]>,
    keepArrayKeys: string[] = [],
  ): TextureDefinition | null {
    if (!raw) return null;
    const result: Record<string, unknown> = {};
    for (const key in raw) {
      const values = raw[key].map((x: string) => {
        try {
          return JSON.parse(x);
        } catch {
          return x;
        }
      });
      result[key] =
        !keepArrayKeys.includes(key) && values.length < 2 ? values[0] : values;
    }
    return result as TextureDefinition;
  }
}
