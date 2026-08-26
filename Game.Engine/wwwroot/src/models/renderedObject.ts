import * as emitters from "../../img/emitters.json";
import { Settings } from "../ui/settings";
import { textureCache } from "./textureCache";
import { getDefaultTextureMapRules } from "./textureMap";
import { getDefaultSpriteModeMapRules } from "./spriteModeMap";
import * as PIXI from "pixi.js";
import "pixi-layers";
import * as particles from "pixi-particles";
import { CustomContainer } from "../rendering/customContainer";
import { queryProperties } from "../parser/parseTheme";
import type { BodyState } from "./cache";
import type { Interpolator, ProjectedPoint } from "../rendering/interpolator";

import {
  preloadAllGameTextures,
  createTextureFromDefinition,
  images,
} from "../rendering/atlasLoader";

const textureMapRules = [getDefaultTextureMapRules(Settings.graphics)];
const spriteModeMapRules = [getDefaultSpriteModeMapRules(Settings.graphics)];

textureCache.initAtlases = () => {
  const rules =
    textureMapRules && textureMapRules.length > 0
      ? textureMapRules[0]
      : undefined;
  preloadAllGameTextures(rules, Settings.mipmapping);
};
textureCache.initAtlases();

const shotThrust = [
  0, 41, 34.17, 30.71, 28.47, 26.85, 25.59, 24.58, 23.73, 23.01, 22.38, 21.82,
  21.33, 20.88, 20.48, 20.11, 19.77, 19.46, 19.17, 18.9, 18.65, 18.41, 18.19,
  17.97, 17.77, 17.58, 17.4, 17.23, 17.07, 16.91, 16.76, 16.62, 16.48, 16.35,
  16.22, 16.1, 15.98, 15.86, 15.75, 15.64, 15.54, 15.44, 15.34, 15.25, 15.16,
  15.07, 14.98, 14.89, 14.81, 14.73, 14.65, 14.58, 14.5, 14.43, 14.36, 14.29,
  14.22, 14.16, 14.09, 14.03, 13.97, 13.91, 13.85, 13.79, 13.73, 13.68, 13.62,
  13.57, 13.52, 13.46, 13.41, 13.36, 13.31, 13.27, 13.22, 13.17, 13.13, 13.08,
  13.04, 12.99, 12.95, 12.91, 12.87, 12.83, 12.79, 12.75, 12.71, 12.67, 12.63,
  12.59, 12.56, 12.52, 12.48, 12.45, 12.41, 12.38, 12.34, 12.21, 12.07, 12.03,
  12,
];

const bulletLifeTable = [
  0, 1560, 1760, 1840, 1960, 2040, 2160, 2160, 2240, 2280, 2240, 2320, 2400,
  2400, 2480, 2440, 2440, 2560, 2520, 2520, 2640, 2600, 2600, 2720, 2720, 2680,
  2680, 2680, 2840, 2800, 2800, 2800, 2760, 2760, 2760, 2920, 2920, 2920, 2880,
  2880, 2880, 2880, 2840, 2840, 3040, 3040, 3040, 3040, 3000, 3000, 3000, 3040,
  3040, 3040, 3040, 3080, 3080, 3080, 3080, 3120, 3120, 3120, 3120, 3120, 3160,
  3160, 3160, 3160, 3160, 3200, 3200, 3200, 3200, 3200, 3240, 3240, 3240, 3240,
  3240, 3240, 3280, 3280, 3280, 3280, 3280, 3280, 3320, 3320, 3320, 3320, 3320,
  3320, 3320, 3360, 3360, 3360, 3360, 3360, 3360, 3400, 3400,
];

class GroupParticle extends particles.Particle {
  body: any;
  renderedObject?: RenderedObject;
  isBoostParticle: boolean;

  constructor(emitter: particles.Emitter) {
    super(emitter);
    this.parentGroup =
      emitter.parent?.parentGroup ||
      (<any>emitter).renderedObject?.container?.bodyGroup;
    this.body = (<any>emitter).renderedObject?.body;
    this.renderedObject = (<any>emitter).renderedObject;
    const texDef = (<any>emitter).textureDefinition;
    const emitterKey = String(texDef?.emitter || "");
    this.isBoostParticle = emitterKey.startsWith("boost");
  }

  update(delta: number): number {
    if (this.isBoostParticle && this.renderedObject?.positionDelta) {
      this.position.x += this.renderedObject.positionDelta.x;
      this.position.y += this.renderedObject.positionDelta.y;
    }

    var ret = super.update(delta);

    const spriteStr = String(this.body?.Sprite || "");
    if (
      this.body &&
      this.body.Size &&
      !spriteStr.startsWith("bullet") &&
      !spriteStr.startsWith("laser")
    ) {
      this.scaleMultiplier = Math.max(0.5, this.body.Size / 50.0);
    } else {
      this.scaleMultiplier = 1.0;
    }

    if (
      this.renderedObject &&
      (spriteStr.startsWith("bullet") || spriteStr.startsWith("laser"))
    ) {
      const now = performance.now();
      const age = now - this.renderedObject.spawnTime;
      const remaining = this.renderedObject.bulletLifetime - age;
      const fadeIn = Math.min(1.0, age / 180);
      const fadeOut =
        remaining < 112.5 ? Math.max(0.0, remaining / 112.5) : 1.0;
      this.alpha *= fadeIn * fadeOut;
    }

    return ret;
  }
}

export interface CustomSpriteLayer extends PIXI.Sprite {
  textureDefinition?: any;
  baseScale?: number;
  baseOffset?: { x: number; y: number };
  baseRotation?: number;
  zOrder?: number;
}

export class RenderedObject {
  static groupBoostTimes: Record<number, number> = {};
  static groupInvulnerableTimes: Record<number, number> = {};
  static groupBulletData: Record<
    number,
    { spawnTime: number; lifetime: number }
  > = {};
  static lastPruneTime = 0;

  static pruneStaticState(now: number): void {
    if (now - RenderedObject.lastPruneTime < 5000) return;
    RenderedObject.lastPruneTime = now;

    for (const id in RenderedObject.groupBulletData) {
      const entry = RenderedObject.groupBulletData[id];
      if (entry && now - entry.spawnTime > 5000) {
        delete RenderedObject.groupBulletData[id];
      }
    }

    for (const id in RenderedObject.groupBoostTimes) {
      const t = RenderedObject.groupBoostTimes[id];
      if (t && now - t > 5000) {
        delete RenderedObject.groupBoostTimes[id];
      }
    }

    for (const id in RenderedObject.groupInvulnerableTimes) {
      const t = RenderedObject.groupInvulnerableTimes[id];
      if (t && now - t > 5000) {
        delete RenderedObject.groupInvulnerableTimes[id];
      }
    }
  }

  static getShipCountFromSpeed(speed: number): number {
    if (speed <= 0) return 1;
    let bestIdx = 1;
    let bestDiff = Math.abs(speed - shotThrust[1]);
    for (let i = 2; i < shotThrust.length; i++) {
      const diff = Math.abs(speed - shotThrust[i]);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    if (speed < shotThrust[shotThrust.length - 1]) {
      const estimatedN = Math.round(Math.pow(41.0 / speed, 3.7987));
      return Math.max(shotThrust.length - 1, estimatedN);
    }
    return bestIdx;
  }

  container: CustomContainer;
  currentSpriteName: string | false;
  currentMode: number;
  currentZIndex: number;
  activeTextures: Record<string, CustomSpriteLayer>;
  activeEmitters: Record<string, particles.Emitter>;
  body?: BodyState | null;
  spriteLayers?: CustomSpriteLayer[] | false;
  emitterLayers?: particles.Emitter[] | false;
  lastTime: number;

  additionalClasses?: string[];
  lastPosition: { x: number; y: number };
  positionDelta: { x: number; y: number };
  spawnTime: number;
  isBoosting: boolean;
  boostStartTime: number;
  bulletLifetime: number;
  isAbandoned: boolean;
  abandonedStartTime: number;
  isInvulnerable: boolean;
  invulnerableStartTime: number;

  constructor(container: CustomContainer) {
    this.container = container;
    this.currentSpriteName = false;
    this.currentMode = 0;
    this.currentZIndex = 0;

    this.lastTime = 0;
    this.activeTextures = {};
    this.activeEmitters = {};

    this.lastPosition = { x: 0, y: 0 };
    this.positionDelta = { x: 0, y: 0 };
    this.spawnTime = performance.now();
    this.isBoosting = false;
    this.boostStartTime = 0;
    this.bulletLifetime = 1840;
    this.isAbandoned = false;
    this.abandonedStartTime = 0;
    this.isInvulnerable = false;
    this.invulnerableStartTime = 0;
  }

  decodeModes(mode: number): string[] {
    const modes: string[] = [];
    const spriteStr = String(this.body?.Sprite || this.currentSpriteName || "");
    if (spriteStr.startsWith("boom")) {
      const colors = [
        "cyan",
        "blue",
        "cyan",
        "green",
        "orange",
        "pink",
        "red",
        "yellow",
      ];
      if (mode >= 1 && mode < colors.length) {
        modes.push(colors[mode]);
      } else {
        modes.push("cyan");
      }
    }
    modes.push("default");
    if ((mode & 1) !== 0) modes.push("boost");
    return modes;
  }

  static getImageFromTextureDefinition(
    textureDefinition: any,
  ): HTMLImageElement {
    const img = new Image();
    if (textureDefinition?.url) img.src = textureDefinition.url;
    else if (textureDefinition?.file) {
      const src = images[textureDefinition.file];
      if (src) img.src = src;
    }

    return img;
  }

  static getTextureImage(textureName: string): HTMLImageElement {
    const textureDefinition = RenderedObject.getTextureDefinition(textureName);
    return RenderedObject.getImageFromTextureDefinition(textureDefinition);
  }

  static loadTexture(textureDefinition: any, textureName: string): any {
    if (!textureName) return null;
    const cleanName = String(textureName);
    let textures =
      textureCache[cleanName] || textureCache[cleanName.toLowerCase()];

    if (!textures && textureDefinition?.file) {
      const fileKey = String(textureDefinition.file);
      if (textureCache[fileKey] || textureCache[fileKey.toLowerCase()]) {
        textures = textureCache[fileKey] || textureCache[fileKey.toLowerCase()];
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

  static getTextureDefinition(textureName: string): any {
    const mapKey = this.parseMapKey(textureName);
    if (mapKey) textureName = mapKey.name;

    let textureDefinition: any = null;
    try {
      textureDefinition = queryProperties(
        { element: textureName },
        textureMapRules[0],
      );
      for (const i in textureDefinition) {
        textureDefinition[i] = textureDefinition[i].map(function (x: string) {
          let k: any = x;
          try {
            const m = JSON.parse(x);
            k = m;
          } finally {
            return k;
          }
        });
        if (textureDefinition[i].length < 2) {
          textureDefinition[i] = textureDefinition[i][0];
        }
      }
    } catch (e) {
      console.log("TEXTURE FAILED:", e);
    }
    if (!textureDefinition) console.log(`cannot load texture '${textureName}'`);

    return textureDefinition;
  }

  static parseMapKey(mapKey: string): { name: string; mapID: number } | false {
    if (!mapKey) return false;

    const mapKeyMatches = mapKey.match(/^(.*)\[(\d*)\]/);

    if (mapKeyMatches && mapKeyMatches[1] && mapKeyMatches[2])
      return {
        name: mapKeyMatches[1],
        mapID: parseInt(mapKeyMatches[2], 10),
      };
    else return false;
  }

  buildSprite(textureName: string, _spriteName: string): PIXI.Sprite | null {
    if (!textureName) return null;
    const textureDefinition = RenderedObject.getTextureDefinition(textureName);
    if (!textureDefinition) return null;
    const textures = RenderedObject.loadTexture(textureDefinition, textureName);
    if (!textures || !textures.length) return null;
    let pixiSprite: any = null;

    if (textureDefinition.animated) {
      pixiSprite = new PIXI.AnimatedSprite(textures);
      if (pixiSprite instanceof PIXI.AnimatedSprite) {
        pixiSprite.loop = Boolean(textureDefinition.loop);
        pixiSprite.animationSpeed = Number(
          textureDefinition["animation-speed"] ?? 1,
        );
      }
      pixiSprite.parentGroup = this.container.bodyGroup;
    } else if (textureDefinition.emitter) {
      return null;
    } else if (textureDefinition.map) {
      console.log("warning: requested tile from RenderedObject");
    } else {
      pixiSprite = new PIXI.Sprite(textures[0]);
      pixiSprite.parentGroup = this.container.bodyGroup;
    }

    if (!pixiSprite) return null;

    if (textureDefinition.tint) {
      if (typeof textureDefinition.tint === "string")
        pixiSprite.tint = parseInt(textureDefinition.tint, 10);
      else pixiSprite.tint = Number(textureDefinition.tint);
    }

    if (textureDefinition.alpha !== undefined)
      pixiSprite.alpha = Number(textureDefinition.alpha);

    if (textureDefinition.blendMode)
      pixiSprite.blendMode = textureDefinition.blendMode;

    pixiSprite.pivot.x = pixiSprite.width / 2;
    pixiSprite.pivot.y = pixiSprite.height / 2;
    pixiSprite.x = 0;
    pixiSprite.y = 0;

    pixiSprite.baseScale = RenderedObject.getScaleWithHeight(
      textureDefinition,
      textures[0].height,
    );
    pixiSprite.scale = pixiSprite.baseScale;
    pixiSprite.textureDefinition = textureDefinition;

    let rot = Math.PI / 2;
    if (textureDefinition.rotate !== undefined) {
      const rotVal = String(textureDefinition.rotate);
      if (rotVal.endsWith("deg")) {
        rot = (parseFloat(rotVal) * Math.PI) / 180;
      } else {
        const num = parseFloat(rotVal);
        if (Math.abs(num) > 6.283185) {
          rot = (num * Math.PI) / 180;
        } else {
          rot = num;
        }
      }
    }
    pixiSprite.baseRotation = rot;

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
    pixiSprite.baseOffset = { x: offsetX, y: offsetY };

    if (textureDefinition.animated && pixiSprite instanceof PIXI.AnimatedSprite)
      pixiSprite.play();

    return pixiSprite;
  }

  static getScale(textureDefinition: any, pixiTex: PIXI.Texture): number {
    let spriteSize = 1;
    if (textureDefinition["size"]) {
      const spriteSizeIsPercent =
        typeof textureDefinition["size"] === "string" &&
        textureDefinition["size"][textureDefinition["size"].length - 1] === "%";
      spriteSize = spriteSizeIsPercent
        ? parseFloat(
            textureDefinition["size"].slice(
              0,
              textureDefinition["size"].length - 1,
            ),
          ) / 100
        : parseFloat(textureDefinition["size"]) / pixiTex.height;
    }
    if (textureDefinition["scale"]) {
      spriteSize = parseFloat(textureDefinition["scale"]);
    }
    return spriteSize;
  }

  static getScaleWithHeight(textureDefinition: any, height: number): number {
    let spriteSize = 1;
    if (textureDefinition["size"]) {
      const spriteSizeIsPercent =
        typeof textureDefinition["size"] === "string" &&
        textureDefinition["size"][textureDefinition["size"].length - 1] === "%";
      spriteSize = spriteSizeIsPercent
        ? parseFloat(
            textureDefinition["size"].slice(
              0,
              textureDefinition["size"].length - 1,
            ),
          ) / 100
        : parseFloat(textureDefinition["size"]) / height;
    }
    if (textureDefinition["scale"]) {
      spriteSize = parseFloat(textureDefinition["scale"]);
    }
    return spriteSize;
  }

  static getSpriteDefinition(spriteName: string, additional?: string[]): any {
    let spriteDefinition: any = null;
    if (!additional) {
      additional = [];
    }
    const mapKey = this.parseMapKey(spriteName);
    if (mapKey) spriteName = mapKey.name;
    try {
      spriteDefinition = queryProperties(
        {
          element: spriteName.split("_")[0],
          class: spriteName.split("_").join(" ") + " " + additional.join(" "),
        },
        spriteModeMapRules[0],
      );
      for (const i in spriteDefinition) {
        spriteDefinition[i] = spriteDefinition[i].map(function (x: string) {
          let k: any = x;
          try {
            const m = JSON.parse(x);
            k = m;
          } finally {
            return k;
          }
        });
        if (
          i !== "textures" &&
          i !== "layer-textures" &&
          i !== "layer-cpu-levels" &&
          i !== "layer-speeds" &&
          spriteDefinition[i].length < 2
        ) {
          spriteDefinition[i] = spriteDefinition[i][0];
        }
      }
    } catch (e) {
      console.log("SPRITE FAILED:", e);
    }
    if (!spriteDefinition) console.log(`Cannot find sprite: ${spriteName}`);

    return spriteDefinition;
  }

  getModeMap(spriteName: string | false, mode: number): string[] | false {
    if (!spriteName) return false;
    const modes = this.decodeModes(mode);

    const spriteDefinition = RenderedObject.getSpriteDefinition(
      spriteName,
      modes,
    );

    return spriteDefinition?.textures ?? false;
  }

  buildSpriteLayers(
    spriteName: string | false,
    mode: number,
    zIndex: number,
  ): CustomSpriteLayer[] | false {
    const layers = this.getModeMap(spriteName, mode);

    if (layers) {
      const spriteLayers: CustomSpriteLayer[] = [];
      for (let i = 0; i < layers.length; i++) {
        let spriteLayer: any = null;
        const textureName = layers[i];
        if (!textureName) continue;

        if (this.activeTextures[textureName])
          spriteLayer = this.activeTextures[textureName];
        else {
          spriteLayer = this.buildSprite(textureName, spriteName || "");
        }

        if (spriteLayer != null) {
          let effectiveZ = zIndex;
          const spriteStr = String(spriteName || "");
          if (!effectiveZ || effectiveZ === 0) {
            if (spriteStr.startsWith("ship")) {
              effectiveZ = 200;
            } else if (
              spriteStr.startsWith("bullet") ||
              spriteStr.startsWith("laser")
            ) {
              effectiveZ = 100;
            } else {
              effectiveZ = 50;
            }
          } else {
            if (spriteStr.startsWith("ship") && effectiveZ < 200) {
              effectiveZ = 200;
            } else if (
              (spriteStr.startsWith("bullet") ||
                spriteStr.startsWith("laser")) &&
              effectiveZ >= 200
            ) {
              effectiveZ = 100;
            }
          }

          spriteLayer.zOrder = effectiveZ + i + (this.body?.ID || 0) / 100000;

          spriteLayers.push(spriteLayer);
          this.activeTextures[textureName] = spriteLayer;
        }
      }

      for (const key in this.activeTextures) {
        if (layers.indexOf(key) === -1) {
          const layer = this.activeTextures[key];
          if (layer) {
            this.container.removeChild(layer);
            layer.destroy();
          }
          delete this.activeTextures[key];
        }
      }

      return spriteLayers;
    } else return false;
  }

  buildEmitterLayers(
    spriteName: string | false,
    mode: number,
    zIndex: number,
  ): particles.Emitter[] | false {
    const layers = this.getModeMap(spriteName, mode);

    if (layers) {
      const emitterLayers: particles.Emitter[] = [];
      for (let i = 0; i < layers.length; i++) {
        let emitterLayer: any = null;
        const textureName = layers[i];
        if (!textureName) continue;

        if (this.activeEmitters[textureName])
          emitterLayer = this.activeEmitters[textureName];
        else {
          const textureDefinition =
            RenderedObject.getTextureDefinition(textureName);

          if (textureDefinition && textureDefinition.emitter) {
            const particleTextureName =
              textureDefinition.particle || "particle_cyan";
            const particleDef =
              RenderedObject.getTextureDefinition(particleTextureName);
            const particleTextures = RenderedObject.loadTexture(
              particleDef,
              particleTextureName,
            );

            if (particleTextures && particleTextures.length) {
              let emitterConfig = textureDefinition.emitter;
              if (typeof emitterConfig === "string")
                emitterConfig = (emitters as any)[emitterConfig];

              if (emitterConfig) {
                emitterLayer = new particles.Emitter(
                  this.container.emitterContainer,
                  particleTextures,
                  emitterConfig,
                );
                emitterLayer.emit = true;
                (emitterLayer as any).renderedObject = this;
                emitterLayer.particleConstructor = GroupParticle;
                (emitterLayer as any).textureName = textureName;
                (emitterLayer as any).textureDefinition = textureDefinition;
              }
            }
          }
        }

        if (emitterLayer != null) {
          let effectiveZ = zIndex;
          const spriteStr = String(spriteName || "");
          if (!effectiveZ || effectiveZ === 0) {
            if (spriteStr.startsWith("ship")) {
              effectiveZ = 200;
            } else if (
              spriteStr.startsWith("bullet") ||
              spriteStr.startsWith("laser")
            ) {
              effectiveZ = 100;
            } else {
              effectiveZ = 50;
            }
          } else {
            if (spriteStr.startsWith("ship") && effectiveZ < 200) {
              effectiveZ = 200;
            } else if (
              (spriteStr.startsWith("bullet") ||
                spriteStr.startsWith("laser")) &&
              effectiveZ >= 200
            ) {
              effectiveZ = 100;
            }
          }

          emitterLayer.zOrder = effectiveZ + i + (this.body?.ID || 0) / 100000;

          emitterLayers.push(emitterLayer);
          this.activeEmitters[textureName] = emitterLayer;
        }
      }

      for (const key in this.activeEmitters) {
        if (layers.indexOf(key) === -1) {
          const layer = this.activeEmitters[key];
          if (layer) {
            this.container.removeChild(layer as any);
            layer.destroy();
          }
          delete this.activeEmitters[key];
        }
      }

      return emitterLayers;
    } else return false;
  }

  destroy(): void {
    this.destroySprites();
  }

  destroySprites(): void {
    if (this.spriteLayers) {
      for (const layer of this.spriteLayers) {
        this.container.removeChild(layer);
        layer.destroy();
      }

      this.spriteLayers = false;
      this.activeTextures = {};
    }

    if (this.emitterLayers) {
      for (const layer of this.emitterLayers) {
        this.container.removeChild(layer as any);
        layer.destroy();
      }

      this.emitterLayers = false;
    }
  }

  refreshSprite(): void {
    this.setSprite(
      this.currentSpriteName,
      this.currentMode,
      this.currentZIndex,
      true,
    );
  }

  setSprite(
    spriteName: string | false,
    mode: number,
    zIndex: number,
    reload = false,
  ): void {
    // check that we really need to change anything
    if (
      reload ||
      spriteName !== this.currentSpriteName ||
      mode !== this.currentMode ||
      zIndex !== this.currentZIndex
    ) {
      const spriteStr = String(spriteName || "");
      const isAb =
        spriteStr.startsWith("ship_ab") ||
        (Array.isArray(mode) && (mode as any).includes("ab"));
      if (isAb && !this.isAbandoned) {
        this.isAbandoned = true;
        this.abandonedStartTime = performance.now();
      }

      this.currentSpriteName = spriteName;
      this.currentMode = mode;
      this.currentZIndex = zIndex;

      if (reload) {
        this.destroySprites();
      }

      this.spriteLayers = this.buildSpriteLayers(spriteName, mode, zIndex);

      this.foreachLayer((layer) => {
        if (!layer.parent) this.container.addChildAt(layer, 2);
      });

      // also adds them to the container
      this.emitterLayers = this.buildEmitterLayers(spriteName, mode, zIndex);
    }
  }

  fixLoadingTextureScales(): void {
    if (this.spriteLayers && this.spriteLayers.length) {
      for (let i = 0; i < this.spriteLayers.length; i++) {
        const layer = this.spriteLayers[i];
        if (layer && layer.textureDefinition) {
          layer.baseScale = RenderedObject.getScaleWithHeight(
            layer.textureDefinition,
            layer.texture.height,
          );
        }
      }
    }
  }

  preRender(time: number, interpolator: Interpolator): void {
    this.fixLoadingTextureScales();
    if (this.body) {
      const newPosition = interpolator.projectObject(this.body, time);
      this.moveSprites(newPosition, this.body.Size);
    }

    if (this.lastTime > 0 && this.emitterLayers && this.emitterLayers.length) {
      const dt = (time - this.lastTime) * 0.001;
      for (let i = 0; i < this.emitterLayers.length; i++) {
        const e = this.emitterLayers[i];
        if (e) e.update(dt);
      }
    }

    this.lastTime = time;
  }

  moveSprites(interpolatedPosition: ProjectedPoint, size: number): void {
    const angle = interpolatedPosition.Angle;
    if (this.lastPosition.x !== 0 || this.lastPosition.y !== 0) {
      this.positionDelta.x = interpolatedPosition.x - this.lastPosition.x;
      this.positionDelta.y = interpolatedPosition.y - this.lastPosition.y;
    } else {
      this.positionDelta.x = 0;
      this.positionDelta.y = 0;
    }
    this.lastPosition.x = interpolatedPosition.x;
    this.lastPosition.y = interpolatedPosition.y;
    const now = performance.now();

    const isBoostNow =
      ((this.body?.Mode ?? 0) & 1) !== 0 || (this.currentMode & 1) !== 0;
    const isInvulnerableNow =
      ((this.body?.Mode ?? 0) & 2) !== 0 || (this.currentMode & 2) !== 0;
    const groupID = this.body?.Group || 0;

    if (isBoostNow) {
      if (!this.isBoosting) {
        this.isBoosting = true;
        if (groupID && RenderedObject.groupBoostTimes[groupID]) {
          this.boostStartTime = RenderedObject.groupBoostTimes[groupID];
        } else {
          this.boostStartTime = now;
          if (groupID) RenderedObject.groupBoostTimes[groupID] = now;
        }
      } else if (now - this.boostStartTime >= 1000) {
        this.isBoosting = false;
        this.boostStartTime = 0;
        if (groupID && RenderedObject.groupBoostTimes[groupID]) {
          delete RenderedObject.groupBoostTimes[groupID];
        }
      }
    } else if (this.isBoosting) {
      this.isBoosting = false;
      this.boostStartTime = 0;
      if (groupID && RenderedObject.groupBoostTimes[groupID]) {
        delete RenderedObject.groupBoostTimes[groupID];
      }
    }

    if (isInvulnerableNow) {
      if (!this.isInvulnerable) {
        this.isInvulnerable = true;
        if (groupID && RenderedObject.groupInvulnerableTimes[groupID]) {
          this.invulnerableStartTime =
            RenderedObject.groupInvulnerableTimes[groupID];
        } else {
          this.invulnerableStartTime = now;
          if (groupID) RenderedObject.groupInvulnerableTimes[groupID] = now;
        }
      } else if (now - this.invulnerableStartTime >= 3000) {
        this.isInvulnerable = false;
        this.invulnerableStartTime = 0;
        if (groupID && RenderedObject.groupInvulnerableTimes[groupID]) {
          delete RenderedObject.groupInvulnerableTimes[groupID];
        }
      }
    } else if (this.isInvulnerable) {
      this.isInvulnerable = false;
      this.invulnerableStartTime = 0;
      if (groupID && RenderedObject.groupInvulnerableTimes[groupID]) {
        delete RenderedObject.groupInvulnerableTimes[groupID];
      }
    }

    if (this.spriteLayers && this.spriteLayers.length) {
      for (let i = 0; i < this.spriteLayers.length; i++) {
        const layer = this.spriteLayers[i];
        if (!layer) continue;

        layer.pivot.x = layer.texture.width / 2;
        layer.pivot.y = layer.texture.height / 2;

        const scale = size * (layer.baseScale || 1);
        layer.scale.set(scale, scale);

        const offX = (layer.baseOffset?.x || 0) * scale;
        const offY = (layer.baseOffset?.y || 0) * scale;

        layer.position.x =
          interpolatedPosition.x +
          (offX * Math.cos(angle) - offY * Math.sin(angle));

        layer.position.y =
          interpolatedPosition.y +
          (offY * Math.cos(angle) + offX * Math.sin(angle));

        const rotationOffset =
          layer.baseRotation !== undefined
            ? layer.baseRotation
            : layer.textureDefinition?.rotate !== undefined
              ? Number(layer.textureDefinition.rotate)
              : Math.PI / 2;

        layer.rotation = angle + rotationOffset;

        const fileStr = String(
          layer.textureDefinition?.file || "",
        ).toLowerCase();

        // Invulnerability 12-period (0.25s each, 3s total) blink check (odd=visible, even=invisible/dimmed)
        let isBlinkDimmed = false;
        if (this.isInvulnerable && !this.isAbandoned) {
          const invulnElapsed = now - this.invulnerableStartTime;
          if (invulnElapsed < 3000) {
            const periodIndex = Math.floor(invulnElapsed / 250) + 1;
            const isBlinkVisible = periodIndex % 2 === 1;
            if (!isBlinkVisible) {
              if (this.isBoosting) {
                // When boosting, dash trail stays continuous; ship body/aura dims to ghostly translucent (alpha 0.25)
                if (!fileStr.startsWith("dash_trail")) {
                  isBlinkDimmed = true;
                }
              } else {
                layer.alpha = 0.0;
                layer.visible = false;
                continue;
              }
            }
          }
        }

        // Dynamic Lifecycle Alphas & Crossfades
        if (fileStr.startsWith("dash_trail")) {
          if (!this.isBoosting) {
            layer.alpha = 0.0;
            layer.visible = false;
          } else {
            const boostElapsed = now - this.boostStartTime;
            if (boostElapsed < 160) {
              // Phase 1 (0-160ms): Surge ramp - no dash trail
              layer.alpha = 0.0;
              layer.visible = false;
            } else if (boostElapsed < 360) {
              // Phase 2 (160-360ms): Steady dash trail with flame flicker
              const flicker =
                0.92 +
                0.12 *
                  Math.sin(now * 0.035 + ((this.body?.ID || 0) % 10) * 1.5);
              layer.scale.set(scale, scale * flicker);
              layer.alpha =
                0.85 +
                0.15 * Math.cos(now * 0.05 + ((this.body?.ID || 0) % 10) * 1.5);
              layer.visible = true;
            } else {
              // Phase 3 (360-1000ms): Fades out smoothly over the 640ms deceleration phase
              const phase3Elapsed = boostElapsed - 360;
              const phase3Progress = Math.min(
                1.0,
                Math.max(0.0, phase3Elapsed / 640),
              );
              const fadeAlpha = 1.0 - phase3Progress;
              const flicker =
                0.92 +
                0.12 *
                  Math.sin(now * 0.035 + ((this.body?.ID || 0) % 10) * 1.5);
              layer.scale.set(scale, scale * flicker);
              layer.alpha =
                fadeAlpha *
                (0.85 +
                  0.15 *
                    Math.cos(now * 0.05 + ((this.body?.ID || 0) % 10) * 1.5));
              layer.visible = layer.alpha > 0.01;
            }
          }
        } else if (fileStr.startsWith("dead_ship")) {
          if (!this.isAbandoned) {
            layer.alpha = 0.0;
            layer.visible = false;
          } else {
            const abElapsed = now - this.abandonedStartTime;
            const abProgress = Math.min(1.0, abElapsed / 2000);
            layer.alpha = abProgress;
            layer.visible = layer.alpha > 0.01;
          }
        } else if (
          fileStr.startsWith("particle_ship") ||
          fileStr.includes("_boost")
        ) {
          let boostAlpha = 0.0;
          if (this.isBoosting) {
            const boostElapsed = now - this.boostStartTime;
            if (boostElapsed < 360) {
              // Phase 1 & 2 (0-360ms): Full intensity throughout surge and steady burn
              boostAlpha = 1.0;
            } else if (boostElapsed < 1000) {
              // Phase 3 (360-1000ms): Deceleration fade-out
              const phase3Elapsed = boostElapsed - 360;
              const phase3Progress = Math.min(
                1.0,
                Math.max(0.0, phase3Elapsed / 640),
              );
              boostAlpha = Math.max(0.0, 1.0 - phase3Progress);
            }
          }

          let invulnAlpha = 0.0;
          if (this.isInvulnerable) {
            const invulnElapsed = now - this.invulnerableStartTime;
            if (invulnElapsed < 3000) {
              const invulnProgress = Math.min(1.0, invulnElapsed / 3000);
              invulnAlpha = Math.max(0.0, 1.0 - invulnProgress);
            }
          }

          // Composite overlay: maximum intensity between boost and invulnerability overlays
          let combinedAlpha = Math.max(boostAlpha, invulnAlpha);
          if (isBlinkDimmed) {
            combinedAlpha *= 0.25;
          }

          layer.alpha = combinedAlpha;
          layer.visible = layer.alpha > 0.01;
        } else if (
          fileStr.startsWith("ship") &&
          !fileStr.startsWith("ship_ab")
        ) {
          if (this.isAbandoned) {
            const abElapsed = now - this.abandonedStartTime;
            const abProgress = Math.min(1.0, abElapsed / 2000);
            layer.alpha = Math.max(0.0, 1.0 - abProgress);
            layer.visible = layer.alpha > 0.01;
          } else {
            layer.alpha = isBlinkDimmed ? 0.25 : 1.0;
            layer.visible = layer.alpha > 0.01;
          }
        } else if (fileStr.includes("glow")) {
          const spawnAge = now - this.spawnTime;
          const spawnAlpha = Math.min(1.0, spawnAge / 1000);
          const glowPulse =
            0.4 + 0.6 * (0.5 + 0.5 * Math.sin((now / 1000) * 2 * Math.PI));
          layer.alpha = spawnAlpha * glowPulse;
          layer.visible = true;
        } else if (fileStr.startsWith("food") || fileStr.startsWith("fish")) {
          const spawnAge = now - this.spawnTime;
          layer.alpha = Math.min(1.0, spawnAge / 1000);
          layer.visible = true;
        } else if (fileStr.includes("laser") && fileStr.includes("trail")) {
          const age = now - this.spawnTime;
          const remaining = this.bulletLifetime - age;
          const fadeIn = Math.min(1.0, age / 180);
          const fadeOut =
            remaining < 112.5 ? Math.max(0.0, remaining / 112.5) : 1.0;
          layer.alpha = fadeIn * fadeOut;
          layer.visible = layer.alpha > 0.01;
        } else if (
          fileStr.startsWith("laser") ||
          fileStr.startsWith("bullet")
        ) {
          const age = now - this.spawnTime;
          const remaining = this.bulletLifetime - age;
          const fadeIn = Math.min(1.0, age / 56.25);
          const fadeOut =
            remaining < 56.25 ? Math.max(0.0, remaining / 56.25) : 1.0;
          layer.alpha = fadeIn * fadeOut;
          layer.visible = layer.alpha > 0.01;
        }
      }
    }

    if (this.emitterLayers && this.emitterLayers.length) {
      for (let i = 0; i < this.emitterLayers.length; i++) {
        const emitter = this.emitterLayers[i];
        if (!emitter) continue;
        const texDef = (emitter as any).textureDefinition;
        const emitterKey = String(texDef?.emitter || "");
        const isBoostEmitter = emitterKey.startsWith("boost");

        if (isBoostEmitter) {
          if (this.isBoosting) {
            const boostElapsed = now - this.boostStartTime;
            // Spawn bullet particles starting from Phase 2 (160ms) along the dash trail
            emitter.emit = boostElapsed >= 160;
          } else {
            // Stop emitting when boost finishes; existing particles finish their lifetime naturally
            emitter.emit = false;
          }

          // Align emitter to the rear nozzle and rotate in the direction of the dash trail
          const trailAngleDeg = ((angle + Math.PI) * 180) / Math.PI;
          emitter.rotate(trailAngleDeg);
          const rearX =
            interpolatedPosition.x - Math.cos(angle) * (size * 0.45);
          const rearY =
            interpolatedPosition.y - Math.sin(angle) * (size * 0.45);
          emitter.updateOwnerPos(rearX, rearY);
        } else {
          emitter.updateOwnerPos(
            interpolatedPosition.x,
            interpolatedPosition.y,
          );
        }
      }
    }
  }

  update(updateData: any): void {
    this.body = updateData;

    const isBoostNow = (updateData.Mode & 1) !== 0;
    const groupID = updateData.Group || 0;
    const now = performance.now();
    RenderedObject.pruneStaticState(now);

    if (isBoostNow) {
      if (!this.isBoosting) {
        this.isBoosting = true;
        if (groupID && RenderedObject.groupBoostTimes[groupID]) {
          this.boostStartTime = RenderedObject.groupBoostTimes[groupID] ?? now;
        } else {
          this.boostStartTime = now;
          if (groupID) RenderedObject.groupBoostTimes[groupID] = now;
        }
      }
    } else if (this.isBoosting) {
      this.isBoosting = false;
      this.boostStartTime = 0;
      if (groupID && RenderedObject.groupBoostTimes[groupID]) {
        delete RenderedObject.groupBoostTimes[groupID];
      }
    }

    const isInvulnerableNow = (updateData.Mode & 2) !== 0;
    if (isInvulnerableNow) {
      if (!this.isInvulnerable) {
        this.isInvulnerable = true;
        if (groupID && RenderedObject.groupInvulnerableTimes[groupID]) {
          this.invulnerableStartTime =
            RenderedObject.groupInvulnerableTimes[groupID] ?? now;
        } else {
          this.invulnerableStartTime = now;
          if (groupID) RenderedObject.groupInvulnerableTimes[groupID] = now;
        }
      }
    } else if (this.isInvulnerable) {
      this.isInvulnerable = false;
      this.invulnerableStartTime = 0;
      if (groupID && RenderedObject.groupInvulnerableTimes[groupID]) {
        delete RenderedObject.groupInvulnerableTimes[groupID];
      }
    }

    const spriteStr = String(this.body?.Sprite || this.currentSpriteName || "");
    if (spriteStr.startsWith("bullet") || spriteStr.startsWith("laser")) {
      const m = updateData.Momentum;
      if (m) {
        const speed = Math.sqrt(m.x * m.x + m.y * m.y) / 0.0156;
        const shipCount = RenderedObject.getShipCountFromSpeed(speed);
        this.bulletLifetime =
          bulletLifeTable[shipCount] ?? 1985 + 25 * shipCount;
      }

      if (groupID) {
        const existing = RenderedObject.groupBulletData[groupID];
        if (existing && now - existing.spawnTime < 500) {
          this.spawnTime = existing.spawnTime;
          this.bulletLifetime = existing.lifetime;
        } else {
          RenderedObject.groupBulletData[groupID] = {
            spawnTime: this.spawnTime,
            lifetime: this.bulletLifetime,
          };
        }
      }
    }

    this.setSprite(updateData.Sprite, updateData.Mode, updateData.zIndex);
  }

  foreachLayer(action: (layer: any, i: number) => void): void {
    if (this.spriteLayers && this.spriteLayers.length) {
      for (let i = 0; i < this.spriteLayers.length; i++) {
        action.call(this, this.spriteLayers[i], i);
      }
    }
  }

  foreachEmitter(
    action: (emitter: particles.Emitter, i: number) => void,
  ): void {
    if (this.emitterLayers && this.emitterLayers.length) {
      for (let i = 0; i < this.emitterLayers.length; i++) {
        const emitter = this.emitterLayers[i];
        if (emitter) action.call(this, emitter, i);
      }
    }
  }
}
