import * as emitters from "../../img/emitters.json";
import { Settings } from "../settings";
import { textureCache } from "./textureCache";
import { getDefaultTextureMapRules } from "./textureMap";
import { getDefaultSpriteModeMapRules } from "./spriteModeMap";
import * as PIXI from "pixi.js";
import "pixi-layers";
import * as particles from "pixi-particles";
import { compressionOptions } from "jszip/lib/defaults";
import { CustomContainer } from "../CustomContainer";
import {
  parseScssIntoRules,
  parseCssIntoRules,
  queryProperties,
} from "../parser/parseTheme";
import { Sprite } from "pixi.js";

import { initializeAtlasTextures, images } from "../atlasLoader";

textureCache.initAtlases = () => initializeAtlasTextures(Settings.mipmapping);
initializeAtlasTextures(Settings.mipmapping);

var textureMapRules = [getDefaultTextureMapRules(Settings.graphics)];
var spriteModeMapRules = [getDefaultSpriteModeMapRules(Settings.graphics)];

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

class GroupParticle extends particles.Particle {
  body: any;
  renderedObject?: RenderedObject;

  constructor(emitter: particles.Emitter) {
    super(emitter);
    this.parentGroup =
      emitter.parent?.parentGroup ||
      (<any>emitter).renderedObject?.container?.bodyGroup;
    this.body = (<any>emitter).renderedObject?.body;
    this.renderedObject = (<any>emitter).renderedObject;
  }

  update(delta: number): number {
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
      const fadeOut = remaining < 225 ? Math.max(0.0, remaining / 225) : 1.0;
      this.alpha *= fadeIn * fadeOut;
    }

    return ret;
  }
}

export class RenderedObject {
  static groupBoostTimes: Record<number, number> = {};
  static groupBulletData: Record<
    number,
    { spawnTime: number; lifetime: number }
  > = {};

  static getShipCountFromSpeed(speed: number): number {
    let bestIdx = 1;
    let bestDiff = Math.abs(speed - shotThrust[1]);
    for (let i = 2; i < shotThrust.length; i++) {
      const diff = Math.abs(speed - shotThrust[i]);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  container: CustomContainer;
  currentSpriteName: boolean;
  currentMode: number;
  currentZIndex: number;
  activeTextures: {};
  activeEmitters: {};
  body?: any;
  spriteLayers?: any;
  emitterLayers?: any;
  lastTime: number;

  additionalClasses?: string[];
  lastPosition: { x: number; y: number };
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
    this.spawnTime = performance.now();
    this.isBoosting = false;
    this.boostStartTime = 0;
    this.bulletLifetime = 1900;
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
    return modes;
  }

  static getImageFromTextureDefinition(textureDefinition) {
    const img = new Image();
    if (textureDefinition.url) img.src = textureDefinition.url;
    else {
      const src = images[textureDefinition.file];
      if (src) img.src = src;
    }

    return img;
  }

  static getTextureImage(textureName) {
    const textureDefinition = RenderedObject.getTextureDefinition(textureName);
    return RenderedObject.getImageFromTextureDefinition(textureDefinition);
  }

  static loadTexture(textureDefinition, textureName) {
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
      if (!textureDefinition) return null;
      textures = [];

      const img =
        RenderedObject.getImageFromTextureDefinition(textureDefinition);
      if (!img || !img.src) return null;

      const baseTexture = PIXI.BaseTexture.from(img);

      baseTexture.mipmap = Settings.mipmapping
        ? PIXI.MIPMAP_MODES.ON
        : PIXI.MIPMAP_MODES.OFF;

      if (textureDefinition.animated) {
        const tileSize = textureDefinition["tile-size"] || 32;
        const totalTiles = textureDefinition["tile-count"] || 1;

        for (let tileIndex = 0; tileIndex < totalTiles; tileIndex++) {
          const sx = tileSize * (tileIndex % totalTiles);
          const sy = 0;
          const sw = tileSize;
          const sh = tileSize;
          var tex = new PIXI.Texture(
            baseTexture,
            new PIXI.Rectangle(sx, sy, sw, sh),
            null,
            null,
            textureDefinition.rotate || 0,
          );
          (<any>tex).daudScale = RenderedObject.getScaleWithHeight(
            textureDefinition,
            tileSize,
          );
          textures.push(tex);
        }
      } else if (textureDefinition.map) {
        let imageWidth = textureDefinition["image-width"];
        let imageHeight = textureDefinition["image-height"];
        let tileWidth = textureDefinition["tile-width"];
        let tileHeight = textureDefinition["tile-height"];

        let tilesWide = Math.floor(imageWidth / tileWidth);
        let tilesHigh = Math.floor(imageHeight / tileHeight);

        for (var row = 0; row < tilesHigh; row++)
          for (var col = 0; col < tilesWide; col++) {
            let x = Math.floor(col * tileWidth);
            let y = Math.floor(row * tileHeight);

            var texture = new PIXI.Texture(
              baseTexture,
              new PIXI.Rectangle(x, y, tileWidth, tileHeight),
            );

            texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            (<any>texture).daudScale = RenderedObject.getScaleWithHeight(
              textureDefinition,
              tileHeight,
            );
            //texture.scaleMode = PIXI.SCALE_MODES.LINEAR;
            textures.push(texture);
          }
      } else if (textureDefinition.emitter) {
      } else {
        var texture = new PIXI.Texture(baseTexture);
        (<any>texture).daudScale = RenderedObject.getScaleWithHeight(
          textureDefinition,
          baseTexture.realHeight,
        );
        textures.push(texture);
      }

      textureCache[textureName] = textures;
    }

    return textures;
  }

  static getTextureDefinition(textureName) {
    var mapKey = this.parseMapKey(textureName);
    if (mapKey) textureName = mapKey.name;

    var textureDefinition = null;
    try {
      textureDefinition = queryProperties(
        { element: textureName },
        textureMapRules[0],
      );
      for (var i in textureDefinition) {
        textureDefinition[i] = textureDefinition[i].map(function (x) {
          var k = x;
          try {
            var m = JSON.parse(x);
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

  static parseMapKey(mapKey) {
    if (!mapKey) return false;

    var mapKeyMatches = mapKey.match(/^(.*)\[(\d*)\]/);

    if (mapKeyMatches)
      return {
        name: mapKeyMatches[1],
        mapID: mapKeyMatches[2],
      };
    else return false;
  }

  buildSprite(textureName, spriteName): Sprite {
    if (!textureName) return null;
    const textureDefinition = RenderedObject.getTextureDefinition(textureName);
    if (!textureDefinition) return null;
    const textures = RenderedObject.loadTexture(textureDefinition, textureName);
    if (!textures || !textures.length) return null;
    var pixiSprite = null;

    if (textureDefinition.animated) {
      pixiSprite = new PIXI.AnimatedSprite(textures);
      if (pixiSprite instanceof PIXI.AnimatedSprite) {
        pixiSprite.loop = textureDefinition.loop;
        pixiSprite.animationSpeed = textureDefinition["animation-speed"];
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

    if (textureDefinition.tint) {
      if (typeof textureDefinition.tint == "string")
        pixiSprite.tint = parseInt(textureDefinition.tint);
      else pixiSprite.tint = textureDefinition.tint;
    }

    if (textureDefinition.alpha !== undefined)
      pixiSprite.alpha = textureDefinition.alpha;

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
    (<any>pixiSprite).textureDefinition = textureDefinition;

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
  static getScale(textureDefinition, pixiTex): number {
    var spriteSize = 1;
    if (textureDefinition["size"]) {
      var spriteSizeIsPercent =
        typeof textureDefinition["size"] == "string" &&
        textureDefinition["size"][textureDefinition["size"].length - 1] == "%";
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
  static getScaleWithHeight(textureDefinition, height): number {
    var spriteSize = 1;
    if (textureDefinition["size"]) {
      var spriteSizeIsPercent =
        typeof textureDefinition["size"] == "string" &&
        textureDefinition["size"][textureDefinition["size"].length - 1] == "%";
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
  static getSpriteDefinition(spriteName, additional?: string[]): any {
    let spriteDefinition = null;
    if (!additional) {
      additional = [];
    }
    var mapKey = this.parseMapKey(spriteName);
    if (mapKey) spriteName = mapKey.name;
    try {
      spriteDefinition = queryProperties(
        {
          element: spriteName.split("_")[0],
          class: spriteName.split("_").join(" ") + " " + additional.join(" "),
        },
        spriteModeMapRules[0],
      );
      for (var i in spriteDefinition) {
        spriteDefinition[i] = spriteDefinition[i].map(function (x) {
          var k = x;
          try {
            var m = JSON.parse(x);
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

  getModeMap(spriteName, mode) {
    let layers = [];
    const modes = this.decodeModes(mode);

    const spriteDefinition = RenderedObject.getSpriteDefinition(
      spriteName,
      modes,
    );

    return spriteDefinition.textures;
  }

  buildSpriteLayers(spriteName, mode, zIndex) {
    const layers = this.getModeMap(spriteName, mode);

    if (layers) {
      const spriteLayers = [];
      for (let i = 0; i < layers.length; i++) {
        let spriteLayer = null;
        var textureName = layers[i];

        if (this.activeTextures[textureName])
          spriteLayer = this.activeTextures[textureName];
        else {
          //console.log('building sprite for ' + textureName);
          spriteLayer = this.buildSprite(textureName, spriteName);
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

      for (var key in this.activeTextures) {
        if (layers.indexOf(key) == -1) {
          let layer = this.activeTextures[key];
          this.container.removeChild(layer);
          layer.destroy();
          //console.log(`delete sprite layer ${spriteName}:${key}`);
          delete this.activeTextures[key];
        }
      }

      return spriteLayers;
    } else return false;
  }

  buildEmitterLayers(spriteName, mode, zIndex) {
    const layers = this.getModeMap(spriteName, mode);

    if (layers) {
      const emitterLayers = [];
      for (let i = 0; i < layers.length; i++) {
        let emitterLayer = null;
        var textureName = layers[i];
        if (!textureName) continue;

        if (this.activeEmitters[textureName])
          emitterLayer = this.activeEmitters[textureName];
        else {
          const textureDefinition =
            RenderedObject.getTextureDefinition(textureName);

          if (textureDefinition && textureDefinition.emitter) {
            let particleTextureName =
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
                emitterLayer.renderedObject = this;
                emitterLayer.particleConstructor = GroupParticle;
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

      for (var key in this.activeEmitters) {
        if (layers.indexOf(key) == -1) {
          let layer = this.activeEmitters[key];
          this.container.removeChild(layer);
          layer.destroy();
          delete this.activeEmitters[key];
        }
      }

      return emitterLayers;
    } else return false;
  }

  destroy() {
    this.destroySprites();
  }

  destroySprites() {
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
        this.container.removeChild(layer);
        layer.destroy();
      }

      this.emitterLayers = false;
    }
  }

  refreshSprite() {
    this.setSprite(
      this.currentSpriteName,
      this.currentMode,
      this.currentZIndex,
      true,
    );
  }

  setSprite(spriteName, mode, zIndex, reload = false) {
    // check that we really need to change anything
    if (
      reload ||
      spriteName != this.currentSpriteName ||
      mode != this.currentMode ||
      zIndex != this.currentZIndex
    ) {
      const spriteStr = String(spriteName || "");
      const isAb =
        spriteStr.startsWith("ship_ab") ||
        (Array.isArray(mode) && mode.includes("ab"));
      if (isAb && !this.isAbandoned) {
        this.isAbandoned = true;
        this.abandonedStartTime = performance.now();
      }

      this.currentSpriteName = spriteName;
      this.currentMode = mode;
      this.currentZIndex = zIndex;

      // if we have any existing sprites, destroy them
      this.destroySprites();

      this.spriteLayers = this.buildSpriteLayers(spriteName, mode, zIndex);

      this.foreachLayer(function (layer, index) {
        this.container.addChildAt(layer, 2);
      });

      // also adds them to the container
      this.emitterLayers = this.buildEmitterLayers(spriteName, mode, zIndex);
    }
  }
  fixLoadingTextureScales() {
    this.foreachLayer(function (layer, index) {
      if ((<any>layer).textureDefinition)
        layer.baseScale = RenderedObject.getScaleWithHeight(
          (<any>layer).textureDefinition,
          layer.texture.height,
        );
    });
  }
  preRender(time, interpolator) {
    this.fixLoadingTextureScales();
    if (this.body) {
      const newPosition = interpolator.projectObject(this.body, time);
      this.moveSprites(newPosition, this.body.Size);
    }

    if (this.lastTime > 0) {
      //console.log(`update emitters (${time}-${this.lastTime} = ${time - this.lastTime}) * 0.001 = ${(time - this.lastTime) * 0.001}) `);

      this.foreachEmitter((e) => {
        e.update((time - this.lastTime) * 0.001);
      });
    }

    this.lastTime = time;
  }

  moveSprites(interpolatedPosition, size) {
    const angle = interpolatedPosition.Angle;
    this.lastPosition.x = interpolatedPosition.x;
    this.lastPosition.y = interpolatedPosition.y;
    const now = performance.now();

    const isBoostNow =
      (this.body?.Mode & 1) !== 0 || (this.currentMode & 1) !== 0;
    const isInvulnerableNow =
      (this.body?.Mode & 2) !== 0 || (this.currentMode & 2) !== 0;
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
      }
    } else if (this.isBoosting) {
      this.isBoosting = false;
      if (groupID && RenderedObject.groupBoostTimes[groupID]) {
        delete RenderedObject.groupBoostTimes[groupID];
      }
    }

    if (isInvulnerableNow) {
      if (!this.isInvulnerable) {
        this.isInvulnerable = true;
        this.invulnerableStartTime = now;
      }
    } else if (this.isInvulnerable) {
      this.isInvulnerable = false;
    }

    const self = this;
    this.foreachLayer(function (layer, index) {
      layer.pivot.x = layer.texture.width / 2;
      layer.pivot.y = layer.texture.height / 2;

      const scale = size * layer.baseScale;
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

      const fileStr = String(layer.textureDefinition?.file || "").toLowerCase();

      // Invulnerability 12-period (0.25s each, 3s total) blink check (odd=visible, even=invisible)
      if (self.isInvulnerable && !self.isAbandoned) {
        const invulnElapsed = now - self.invulnerableStartTime;
        if (invulnElapsed < 3000) {
          const periodIndex = Math.floor(invulnElapsed / 250) + 1;
          const isBlinkVisible = periodIndex % 2 === 1;
          if (!isBlinkVisible) {
            layer.alpha = 0.0;
            layer.visible = false;
            return;
          }
        }
      }

      // Dynamic Lifecycle Alphas & Crossfades
      if (fileStr.startsWith("dash_trail")) {
        if (!self.isBoosting) {
          layer.alpha = 0.0;
          layer.visible = false;
        } else {
          const boostElapsed = now - self.boostStartTime;
          if (boostElapsed < 50) {
            layer.alpha = 0.0;
            layer.visible = false;
          } else {
            const trailProgress = Math.min(1.0, (boostElapsed - 50) / 450);
            const flicker =
              0.92 +
              0.12 * Math.sin(now * 0.035 + ((self.body?.ID || 0) % 10) * 1.5);
            layer.scale.set(scale, scale * flicker);
            layer.alpha =
              Math.max(0.0, 1.0 - trailProgress) *
              (0.85 +
                0.15 *
                  Math.cos(now * 0.05 + ((self.body?.ID || 0) % 10) * 1.5));
            layer.visible = layer.alpha > 0.01;
          }
        }
      } else if (fileStr.startsWith("dead_ship")) {
        if (!self.isAbandoned) {
          layer.alpha = 0.0;
          layer.visible = false;
        } else {
          const abElapsed = now - self.abandonedStartTime;
          const abProgress = Math.min(1.0, abElapsed / 2000);
          layer.alpha = abProgress;
          layer.visible = layer.alpha > 0.01;
        }
      } else if (
        fileStr.startsWith("particle_ship") ||
        fileStr.includes("_boost")
      ) {
        if (self.isBoosting) {
          const boostElapsed = now - self.boostStartTime;
          if (boostElapsed < 150) {
            layer.alpha = 1.0;
          } else {
            const boostProgress = Math.min(1.0, (boostElapsed - 150) / 350);
            layer.alpha = Math.max(0.0, 1.0 - boostProgress);
          }
          layer.visible = layer.alpha > 0.01;
        } else if (self.isInvulnerable) {
          const invulnElapsed = now - self.invulnerableStartTime;
          const invulnProgress = Math.min(1.0, invulnElapsed / 3000);
          layer.alpha = Math.max(0.0, 1.0 - invulnProgress);
          layer.visible = layer.alpha > 0.01;
        } else {
          layer.alpha = 0.0;
          layer.visible = false;
        }
      } else if (fileStr.startsWith("ship") && !fileStr.startsWith("ship_ab")) {
        if (self.isAbandoned) {
          const abElapsed = now - self.abandonedStartTime;
          const abProgress = Math.min(1.0, abElapsed / 2000);
          layer.alpha = Math.max(0.0, 1.0 - abProgress);
          layer.visible = layer.alpha > 0.01;
        } else {
          layer.alpha = 1.0;
          layer.visible = true;
        }
      } else if (fileStr.includes("glow")) {
        const spawnAge = now - self.spawnTime;
        const spawnAlpha = Math.min(1.0, spawnAge / 1000);
        const glowPulse =
          0.4 + 0.6 * (0.5 + 0.5 * Math.sin((now / 1000) * 2 * Math.PI));
        layer.alpha = spawnAlpha * glowPulse;
        layer.visible = true;
      } else if (fileStr.startsWith("food") || fileStr.startsWith("fish")) {
        const spawnAge = now - self.spawnTime;
        layer.alpha = Math.min(1.0, spawnAge / 1000);
        layer.visible = true;
      } else if (fileStr.includes("laser") && fileStr.includes("trail")) {
        const age = now - self.spawnTime;
        const remaining = self.bulletLifetime - age;
        const fadeIn = Math.min(1.0, age / 180);
        const fadeOut = remaining < 225 ? Math.max(0.0, remaining / 225) : 1.0;
        layer.alpha = fadeIn * fadeOut;
        layer.visible = layer.alpha > 0.01;
      } else if (fileStr.startsWith("laser") || fileStr.startsWith("bullet")) {
        const age = now - self.spawnTime;
        const remaining = self.bulletLifetime - age;
        const fadeIn = Math.min(1.0, age / 120);
        const fadeOut = remaining < 225 ? Math.max(0.0, remaining / 225) : 1.0;
        layer.alpha = fadeIn * fadeOut;
        layer.visible = layer.alpha > 0.01;
      }
    });

    this.foreachEmitter(function (emitter) {
      emitter.updateOwnerPos(interpolatedPosition.x, interpolatedPosition.y);
    });
  }

  update(updateData) {
    this.body = updateData;

    const spriteStr = String(this.body?.Sprite || this.currentSpriteName || "");
    if (spriteStr.startsWith("bullet") || spriteStr.startsWith("laser")) {
      const m = updateData.Momentum;
      if (m) {
        const speed = Math.sqrt(m.x * m.x + m.y * m.y) / 0.0012;
        const shipCount = RenderedObject.getShipCountFromSpeed(speed);
        this.bulletLifetime = 1900 + 25 * shipCount;
      }

      const groupID = updateData.Group || 0;
      if (groupID) {
        const now = performance.now();
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

  foreachLayer(action) {
    if (this.spriteLayers && this.spriteLayers.length)
      this.spriteLayers.forEach((layer, i) => {
        action.apply(this, [layer, i]);
      });
  }

  foreachEmitter(action) {
    //console.log(`enumerating this.emitterLayers.length ${this.emitterLayers.length}`);
    if (this.emitterLayers && this.emitterLayers.length)
      this.emitterLayers.forEach((layer, i) => {
        action.apply(this, [layer, i]);
      });
  }
}

export function spawnFoodPickup(
  container: CustomContainer,
  color: string,
  x: number,
  y: number,
) {
  if (Settings.graphics !== "high") return;
  const textureName = `food_pickup_${color}`;
  const textureDefinition = RenderedObject.getTextureDefinition(textureName);
  if (!textureDefinition || !textureDefinition.emitter) return;
  const particleTextures = RenderedObject.loadTexture(
    RenderedObject.getTextureDefinition(textureDefinition.particle),
    textureDefinition.particle,
  );
  if (!particleTextures || !particleTextures.length) return;
  let emitterConfig = textureDefinition.emitter;
  if (typeof emitterConfig === "string") {
    emitterConfig = (emitters as any)[emitterConfig];
  }
  if (!emitterConfig) return;

  const emitter = new particles.Emitter(
    container.emitterContainer,
    particleTextures,
    emitterConfig,
  );
  emitter.updateOwnerPos(x, y);
  emitter.emit = true;

  let lastTime = performance.now();
  const ticker = () => {
    const now = performance.now();
    const dt = (now - lastTime) * 0.001;
    lastTime = now;
    emitter.update(dt);
    if (!emitter.particleCount && !emitter.emit) {
      PIXI.Ticker.shared.remove(ticker);
      emitter.destroy();
    }
  };
  PIXI.Ticker.shared.add(ticker);

  setTimeout(() => {
    emitter.emit = false;
  }, 60);
}

export function spawnBulletImpact(
  container: CustomContainer,
  color: string,
  x: number,
  y: number,
) {
  if (Settings.graphics !== "high") return;
  const particleTextureName = `particle_${color}`;
  const particleDef = RenderedObject.getTextureDefinition(particleTextureName);
  const particleTextures = RenderedObject.loadTexture(
    particleDef,
    particleTextureName,
  );
  if (!particleTextures || !particleTextures.length) return;
  const emitterConfig =
    (emitters as any)["bullet_impact"] || (emitters as any)["boom_sparkles"];
  if (!emitterConfig) return;

  const emitter = new particles.Emitter(
    container.emitterContainer,
    particleTextures,
    emitterConfig,
  );
  emitter.updateOwnerPos(x, y);
  emitter.emit = true;

  let lastTime = performance.now();
  const ticker = () => {
    const now = performance.now();
    const dt = (now - lastTime) * 0.001;
    lastTime = now;
    emitter.update(dt);
    if (!emitter.particleCount && !emitter.emit) {
      PIXI.Ticker.shared.remove(ticker);
      emitter.destroy();
    }
  };
  PIXI.Ticker.shared.add(ticker);

  setTimeout(() => {
    emitter.emit = false;
  }, 60);
}
