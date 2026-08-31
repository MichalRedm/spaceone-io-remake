/**
 * renderedObject.ts — Facade / View Controller
 *
 * `RenderedObject` is the public-facing API that the rest of the game engine
 * uses to attach, update, and destroy the visual representation of a game
 * entity.  It owns the PIXI display objects but does NOT compute their
 * animation values inline.
 *
 * Responsibilities (Rule 14 — RenderedObject as View Controller):
 *  ✅ Add / remove sprite layers and emitters to the PIXI scene graph
 *  ✅ Maintain per-entity state (isBoosting, spawnTime, bulletLifetime …)
 *  ✅ Delegate per-frame animation to SpriteAnimator
 *  ✅ Delegate texture/sprite resolution to TextureLoader
 *
 * Responsibilities moved OUT:
 *  ❌ Animation math (alpha curves, invulnerability blink) → spriteAnimator.ts
 *  ❌ Texture/SCSS querying                               → textureLoader.ts
 *  ❌ Group-state caches (groupBoostTimes …)              → spriteAnimator.ts
 *  ❌ Particle class (GroupParticle)                      → groupParticle.ts
 *  ❌ Pure math helpers (parseMapKey, getScale)           → textureUtils.ts
 */

import * as PIXI from "pixi.js";
import "pixi-layers";
import * as particles from "pixi-particles";
import { CustomContainer } from "../rendering/customContainer";
import { WorldConfig } from "./worldConfig";
import type { BodyState } from "./cache";
import type { Interpolator, ProjectedPoint } from "../rendering/interpolator";
import {
  SpriteAnimator,
  groupBoostTimes,
  groupInvulnerableTimes,
  groupBulletData,
  pruneStaticState,
  type AnimationContext,
} from "./spriteAnimator";
import { TextureLoader } from "./textureLoader";
import { getDefaultTextureMapRules } from "./textureMap";
import { getDefaultSpriteModeMapRules } from "./spriteModeMap";
import { Settings } from "../ui/settings";
import {
  calculateScaleWithHeight,
  preloadAllGameTextures,
} from "../rendering/atlasLoader";
import { textureCache } from "./textureCache";
import { decodeModes, parseMapKey } from "./textureUtils";

// ---------------------------------------------------------------------------
// Module-level service singletons
// ---------------------------------------------------------------------------

const _textureMapRules = [getDefaultTextureMapRules(Settings.graphics)];
const _spriteModeMapRules = [getDefaultSpriteModeMapRules(Settings.graphics)];

// Initialise the atlas textures once at module load time.
textureCache.initAtlases = () => {
  preloadAllGameTextures(_textureMapRules[0], Settings.mipmapping);
};
textureCache.initAtlases();

/** Module-level singleton used by all RenderedObject instances. */
const _loader = new TextureLoader(_textureMapRules, _spriteModeMapRules);

/** Module-level singleton for per-frame animation. */
const _animator = new SpriteAnimator();

// ---------------------------------------------------------------------------
// CustomSpriteLayer
// ---------------------------------------------------------------------------

/**
 * A PIXI.Sprite augmented with the cached metadata from its texture definition.
 * The extra fields are written once at sprite creation time and read each frame
 * by `SpriteAnimator`.
 */
export interface CustomSpriteLayer extends PIXI.Sprite {
  textureDefinition?: Record<string, unknown>;
  baseScale?: number;
  baseOffset?: { x: number; y: number };
  baseRotation?: number;
  zOrder?: number;
}

// ---------------------------------------------------------------------------
// Z-index helpers (extracted from buildSpriteLayers / buildEmitterLayers)
// ---------------------------------------------------------------------------

/**
 * Determines the effective rendering z-order for a sprite given the entity's
 * sprite name prefix and the group-provided z-index hint.
 */
function resolveEffectiveZ(
  spriteName: string | false,
  zIndex: number,
  layerIndex: number,
  bodyID: number,
): number {
  const spriteStr = String(spriteName || "");
  const isShip = spriteStr.startsWith("ship");
  const isBullet =
    spriteStr.startsWith("bullet") || spriteStr.startsWith("laser");

  let effectiveZ = zIndex;
  if (!effectiveZ || effectiveZ === 0) {
    effectiveZ = isShip ? 200 : isBullet ? 100 : 50;
  } else {
    if (isShip && effectiveZ < 200) effectiveZ = 200;
    else if (isBullet && effectiveZ >= 200) effectiveZ = 100;
  }
  return effectiveZ + layerIndex + bodyID / 100000;
}

// ---------------------------------------------------------------------------
// RenderedObject — thin Facade / View Controller
// ---------------------------------------------------------------------------

export class RenderedObject {
  // ── Public state (read by SpriteAnimator via AnimationContext) ─────────────
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

  // ── Static helpers (delegated to module-level _loader / textureUtils) ───────

  /** @deprecated Import `getTextureDefinition` from `renderedObject` module instead. */
  static getTextureDefinition(
    textureName: string,
  ): ReturnType<TextureLoader["getTextureDefinition"]> {
    return _loader.getTextureDefinition(textureName);
  }

  /** @deprecated Import `loadTexture` from `renderedObject` module instead. */
  static loadTexture(
    textureDefinition: Parameters<TextureLoader["loadTexture"]>[0],
    textureName: string,
  ): ReturnType<TextureLoader["loadTexture"]> {
    return _loader.loadTexture(textureDefinition, textureName);
  }

  /** @deprecated Import `getSpriteDefinition` from `renderedObject` module instead. */
  static getSpriteDefinition(
    spriteName: string,
    additional?: string[],
  ): ReturnType<TextureLoader["getSpriteDefinition"]> {
    return _loader.getSpriteDefinition(spriteName, additional);
  }

  /** @deprecated Import `parseMapKey` from `textureUtils` module instead. */
  static parseMapKey(mapKey: string): { name: string; mapID: number } | false {
    return parseMapKey(mapKey);
  }

  /** @deprecated Import `getTextureImage` from `renderedObject` module instead. */
  static getTextureImage(textureName: string): HTMLImageElement {
    const textureDefinition = _loader.getTextureDefinition(textureName);
    if (!textureDefinition) return new Image();
    return _loader.getImageFromTextureDefinition(textureDefinition);
  }

  // ── Sprite layer management ────────────────────────────────────────────────

  getModeMap(spriteName: string | false, mode: number): string[] | false {
    if (!spriteName) return false;
    const modes = decodeModes(mode, spriteName);
    const spriteDefinition = _loader.getSpriteDefinition(spriteName, modes);
    const textures = spriteDefinition?.textures as string[] | undefined;
    return textures ?? false;
  }

  buildSpriteLayers(
    spriteName: string | false,
    mode: number,
    zIndex: number,
  ): CustomSpriteLayer[] | false {
    const layers = this.getModeMap(spriteName, mode);
    if (!layers) return false;

    const spriteLayers: CustomSpriteLayer[] = [];

    for (let i = 0; i < layers.length; i++) {
      const textureName = layers[i];
      if (!textureName) continue;

      let spriteLayer: CustomSpriteLayer | null = null;
      if (this.activeTextures[textureName]) {
        spriteLayer = this.activeTextures[textureName];
        // Restart cached one-shot animated sprites on reuse.
        if (
          spriteLayer instanceof PIXI.AnimatedSprite &&
          !spriteLayer.loop &&
          !spriteLayer.playing
        ) {
          spriteLayer.gotoAndPlay(0);
        }
      } else {
        spriteLayer = _loader.buildSprite(
          textureName,
          String(spriteName || ""),
          this.container,
        );
      }

      if (spriteLayer !== null) {
        spriteLayer.zOrder = resolveEffectiveZ(
          spriteName,
          zIndex,
          i,
          this.body?.ID ?? 0,
        );
        spriteLayers.push(spriteLayer);
        this.activeTextures[textureName] = spriteLayer;
      }
    }

    // Destroy layers that are no longer in the active set.
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
  }

  buildEmitterLayers(
    spriteName: string | false,
    mode: number,
    zIndex: number,
  ): particles.Emitter[] | false {
    const layers = this.getModeMap(spriteName, mode);
    if (!layers) return false;

    const emitterLayers: particles.Emitter[] = [];

    for (let i = 0; i < layers.length; i++) {
      const textureName = layers[i];
      if (!textureName) continue;

      let emitterLayer: particles.Emitter | null = null;
      if (this.activeEmitters[textureName]) {
        emitterLayer = this.activeEmitters[textureName];
      } else {
        emitterLayer = _loader.buildEmitter(textureName, this.container, this);
      }

      if (emitterLayer !== null) {
        emitterLayer.zOrder = resolveEffectiveZ(
          spriteName,
          zIndex,
          i,
          this.body?.ID ?? 0,
        );
        emitterLayers.push(emitterLayer);
        this.activeEmitters[textureName] = emitterLayer;
      }
    }

    // Destroy emitters no longer in the active set.
    for (const key in this.activeEmitters) {
      if (layers.indexOf(key) === -1) {
        const layer = this.activeEmitters[key];
        if (layer) {
          this.container.removeChild(layer as unknown as PIXI.DisplayObject);
          layer.destroy();
        }
        delete this.activeEmitters[key];
      }
    }

    return emitterLayers;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

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
        this.container.removeChild(layer as unknown as PIXI.DisplayObject);
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
    if (
      reload ||
      spriteName !== this.currentSpriteName ||
      mode !== this.currentMode ||
      zIndex !== this.currentZIndex
    ) {
      const spriteStr = String(spriteName || "");
      const isAb =
        spriteStr.startsWith("ship_ab") ||
        (Array.isArray(mode) && (mode as unknown as string[]).includes("ab"));
      if (isAb && !this.isAbandoned) {
        this.isAbandoned = true;
        this.abandonedStartTime = performance.now();
      }

      this.currentSpriteName = spriteName;
      this.currentMode = mode;
      this.currentZIndex = zIndex;

      if (reload) this.destroySprites();

      this.spriteLayers = this.buildSpriteLayers(spriteName, mode, zIndex);

      this.foreachLayer((layer) => {
        if (!layer.parent) this.container.addChildAt(layer, 2);
      });

      this.emitterLayers = this.buildEmitterLayers(spriteName, mode, zIndex);
    }
  }

  fixLoadingTextureScales(): void {
    if (this.spriteLayers && this.spriteLayers.length) {
      for (let i = 0; i < this.spriteLayers.length; i++) {
        const layer = this.spriteLayers[i];
        if (layer && layer.textureDefinition) {
          layer.baseScale = calculateScaleWithHeight(
            layer.textureDefinition,
            layer.texture.height,
          );
        }
      }
    }
  }

  // ── Render pipeline entry points ───────────────────────────────────────────

  /**
   * Called once per render frame.  Resolves the interpolated position,
   * delegates all animation to `SpriteAnimator`, and advances particle emitters.
   */
  preRender(time: number, interpolator: Interpolator): void {
    this.fixLoadingTextureScales();
    if (this.body) {
      const newPosition = interpolator.projectObject(this.body, time);
      this._updatePositionDelta(newPosition);
      const ctx = this._buildAnimationContext();
      _animator.animate(ctx, newPosition, this.body.Size, performance.now());
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

  /**
   * Called when a new server snapshot arrives for this entity.
   * Updates body state, synchronises boost/invulnerability state with group
   * peers, computes bullet lifetime, and triggers sprite rebuilding if needed.
   */
  update(updateData: BodyState): void {
    this.body = updateData;

    const isBoostNow = (updateData.Mode & 1) !== 0;
    const groupID = updateData.Group || 0;
    const now = performance.now();
    pruneStaticState(now);

    // --- Boost state machine ---
    if (isBoostNow) {
      if (!this.isBoosting) {
        this.isBoosting = true;
        this.boostStartTime =
          groupID && groupBoostTimes[groupID] ? groupBoostTimes[groupID] : now;
        if (groupID && !groupBoostTimes[groupID]) {
          groupBoostTimes[groupID] = now;
        }
      }
    } else if (this.isBoosting) {
      this.isBoosting = false;
      this.boostStartTime = 0;
      if (groupID && groupBoostTimes[groupID]) {
        delete groupBoostTimes[groupID];
      }
    }

    // --- Invulnerability state machine ---
    const isInvulnerableNow = (updateData.Mode & 2) !== 0;
    if (isInvulnerableNow) {
      if (!this.isInvulnerable) {
        this.isInvulnerable = true;
        this.invulnerableStartTime =
          groupID && groupInvulnerableTimes[groupID]
            ? groupInvulnerableTimes[groupID]
            : now;
        if (groupID && !groupInvulnerableTimes[groupID]) {
          groupInvulnerableTimes[groupID] = now;
        }
      }
    } else if (this.isInvulnerable) {
      this.isInvulnerable = false;
      this.invulnerableStartTime = 0;
      if (groupID && groupInvulnerableTimes[groupID]) {
        delete groupInvulnerableTimes[groupID];
      }
    }

    // --- Bullet lifetime ---
    const spriteStr = String(this.body?.Sprite || this.currentSpriteName || "");
    if (spriteStr.startsWith("bullet") || spriteStr.startsWith("laser")) {
      const m = updateData.Momentum;
      if (m) {
        const speed =
          Math.sqrt(m.x * m.x + m.y * m.y) / WorldConfig.shotThrustScale;
        const shipCount = WorldConfig.getShipCountFromSpeed(speed);
        this.bulletLifetime =
          WorldConfig.bulletLifeTable[shipCount] ?? 1985 + 25 * shipCount;
      }

      if (groupID) {
        const existing = groupBulletData[groupID];
        if (existing && now - existing.spawnTime < 500) {
          this.spawnTime = existing.spawnTime;
          this.bulletLifetime = existing.lifetime;
        } else {
          groupBulletData[groupID] = {
            spawnTime: this.spawnTime,
            lifetime: this.bulletLifetime,
          };
        }
      }
    }

    this.setSprite(updateData.Sprite, updateData.Mode, updateData.zIndex ?? 0);
  }

  // ── Iteration helpers ──────────────────────────────────────────────────────

  foreachLayer(action: (layer: CustomSpriteLayer, i: number) => void): void {
    if (this.spriteLayers && this.spriteLayers.length) {
      for (let i = 0; i < this.spriteLayers.length; i++) {
        const layer = this.spriteLayers[i];
        if (layer) action(layer, i);
      }
    }
  }

  foreachEmitter(
    action: (emitter: particles.Emitter, i: number) => void,
  ): void {
    if (this.emitterLayers && this.emitterLayers.length) {
      for (let i = 0; i < this.emitterLayers.length; i++) {
        const emitter = this.emitterLayers[i];
        if (emitter) action(emitter, i);
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Computes positionDelta for particle lag-compensation. */
  private _updatePositionDelta(newPosition: ProjectedPoint): void {
    if (this.lastPosition.x !== 0 || this.lastPosition.y !== 0) {
      this.positionDelta.x = newPosition.x - this.lastPosition.x;
      this.positionDelta.y = newPosition.y - this.lastPosition.y;
    } else {
      this.positionDelta.x = 0;
      this.positionDelta.y = 0;
    }
    this.lastPosition.x = newPosition.x;
    this.lastPosition.y = newPosition.y;
  }

  /** Builds the `AnimationContext` snapshot passed to `SpriteAnimator`. */
  private _buildAnimationContext(): AnimationContext {
    return {
      spriteLayers: this.spriteLayers ?? false,
      emitterLayers: this.emitterLayers ?? false,
      body: this.body,
      isBoosting: this.isBoosting,
      boostStartTime: this.boostStartTime,
      isInvulnerable: this.isInvulnerable,
      invulnerableStartTime: this.invulnerableStartTime,
      isAbandoned: this.isAbandoned,
      abandonedStartTime: this.abandonedStartTime,
      spawnTime: this.spawnTime,
      bulletLifetime: this.bulletLifetime,
      positionDelta: this.positionDelta,
    };
  }
}

// ---------------------------------------------------------------------------
// Module-level re-exports for callers (tile.ts, ship.ts, controls.ts …)
// These are thin delegates to the module-level _loader singleton so callers
// can import named functions without reaching into the class.
// ---------------------------------------------------------------------------

export function getTextureDefinition(
  textureName: string,
): ReturnType<TextureLoader["getTextureDefinition"]> {
  return _loader.getTextureDefinition(textureName);
}

export function loadTexture(
  textureDefinition: Parameters<TextureLoader["loadTexture"]>[0],
  textureName: string,
): ReturnType<TextureLoader["loadTexture"]> {
  return _loader.loadTexture(textureDefinition, textureName);
}

export function getSpriteDefinition(
  spriteName: string,
  additional?: string[],
): ReturnType<TextureLoader["getSpriteDefinition"]> {
  return _loader.getSpriteDefinition(spriteName, additional);
}

export function getTextureImage(textureName: string): HTMLImageElement {
  return RenderedObject.getTextureImage(textureName);
}
