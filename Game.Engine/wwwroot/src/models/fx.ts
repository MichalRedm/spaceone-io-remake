/**
 * @file Particle and explosion visual effects manager.
 * @module models/fx
 *
 * @remarks
 * Manages object pools of transient explosion particles for ship deaths, bullet impacts, and food collection.
 * Particles feature drift kinematics, linear size shrinking, rotation offsets, and alpha fade transitions.
 */

import * as PIXI from "pixi.js";
import { textureCache } from "./textureCache";
import type { CustomContainer } from "../rendering/customContainer";
import { Settings } from "../ui/settings";

/**
 * Global FX configuration parameters controlling particle counts, durations, drift speeds, and scaling factors.
 */
export const FX_CONFIG = {
  /** Bullet explosion configuration on obstacle/laser impact. */
  bulletExplosion: {
    particleCount: 2,
    durationMs: 500,
    baseScale: 0.62, // Scaled to ~25px initial width (2.5x bullet width matching original GameNetworking.cpp:540)
    scaleVariation: 0.1,
    alphaStart: 1.0,
    alphaEnd: 1.0,
    driftSpeedMin: 25,
    driftSpeedMax: 50,
  },
  /** Food / fish pickup explosion configuration. */
  foodExplosion: {
    particleCount: 2,
    durationMs: 500,
    baseScale: 0.37, // Scaled to ~16px initial width (2.27x food width matching original GameNetworking.cpp:534)
    scaleVariation: 0.08,
    alphaStart: 1.0,
    alphaEnd: 1.0,
    driftSpeedMin: 25,
    driftSpeedMax: 50,
  },
  /** Ship destruction explosion configuration. */
  shipExplosion: {
    particleCount: 2,
    durationMs: 500,
    minScaleRatio: 0.5, // 50% of ship size (original ParticleSystem.cpp:38)
    maxScaleRatio: 1.0, // 100% of ship size (original ParticleSystem.cpp:38)
    alphaStart: 1.0,
    alphaEnd: 1.0,
    angularVelocity: 0.05, // Continuous spin +0.05 rad/frame (original Particle.cpp:97)
    driftSpeedMin: 30,
    driftSpeedMax: 65,
  },
};

/**
 * Kinematic and visual state for an active transient explosion particle.
 */
interface ActiveParticle {
  /** Underlying PixiJS Sprite instance. */
  sprite: PIXI.Sprite;
  /** Origin X coordinate in world pixels. */
  startX: number;
  /** Origin Y coordinate in world pixels. */
  startY: number;
  /** Horizontal drift velocity in world pixels per second. */
  vx: number;
  /** Vertical drift velocity in world pixels per second. */
  vy: number;
  /** Initial uniform scale. */
  startScale: number;
  /** Initial alpha opacity $[0.0, 1.0]$. */
  startAlpha: number;
  /** Final alpha opacity $[0.0, 1.0]$ at expiry. */
  endAlpha: number;
  /** Initial rotation in radians. */
  startRotation: number;
  /** Total rotation displacement applied across lifetime in radians (if angularVelocity is not set). */
  rotationDelta: number;
  /** Continuous per-frame rotation increment in radians (e.g. +0.05 rad/frame for ship debris). */
  angularVelocity?: number;
  /** Timestamp when particle spawned from `performance.now()`. */
  startTime: number;
  /** Total particle lifetime in milliseconds. */
  durationMs: number;
  /** Whether particle is currently active and animating. */
  active: boolean;
}

/**
 * High-performance pooled particle effects manager.
 */
class FXManager {
  private container: PIXI.Container | null = null;
  private particlePool: PIXI.Sprite[] = [];
  private particleObjectPool: ActiveParticle[] = [];
  private activeParticles: ActiveParticle[] = [];

  /**
   * Initializes the FX manager and attaches the emitter container to the Pixi stage.
   *
   * @param container - Root game rendering container.
   */
  public init(container: CustomContainer): void {
    if (!container.emitterContainer) {
      container.emitterContainer = new PIXI.Container();
      if (container.bodyGroup) {
        container.emitterContainer.parentGroup = container.bodyGroup;
      }
      container.addChild(container.emitterContainer);
    }
    this.container = container.emitterContainer;
  }

  /**
   * Obtains a recycled `PIXI.Sprite` from the internal pool or instantiates a new one.
   *
   * @param texture - Texture to assign to the sprite.
   * @returns Recycled or newly created sprite with additive blending.
   */
  private getSprite(texture: PIXI.Texture): PIXI.Sprite {
    let sprite: PIXI.Sprite;
    if (this.particlePool.length > 0) {
      sprite = this.particlePool.pop()!;
      sprite.texture = texture;
      sprite.visible = true;
      sprite.renderable = true;
    } else {
      sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      if (this.container) {
        this.container.addChild(sprite);
      }
    }
    return sprite;
  }

  /**
   * Returns an active sprite back to the pool without detaching from container.
   *
   * @param sprite - Sprite to recycle.
   */
  private releaseSprite(sprite: PIXI.Sprite): void {
    sprite.visible = false;
    sprite.renderable = false;
    this.particlePool.push(sprite);
  }

  /**
   * Obtains a recycled `ActiveParticle` descriptor or allocates a new one.
   */
  private getParticle(
    sprite: PIXI.Sprite,
    startX: number,
    startY: number,
    vx: number,
    vy: number,
    startScale: number,
    startAlpha: number,
    endAlpha: number,
    startRotation: number,
    rotationDelta: number,
    startTime: number,
    durationMs: number,
    angularVelocity?: number,
  ): ActiveParticle {
    const p = this.particleObjectPool.pop();
    if (p) {
      p.sprite = sprite;
      p.startX = startX;
      p.startY = startY;
      p.vx = vx;
      p.vy = vy;
      p.startScale = startScale;
      p.startAlpha = startAlpha;
      p.endAlpha = endAlpha;
      p.startRotation = startRotation;
      p.rotationDelta = rotationDelta;
      p.angularVelocity = angularVelocity;
      p.startTime = startTime;
      p.durationMs = durationMs;
      p.active = true;
      return p;
    }
    return {
      sprite,
      startX,
      startY,
      vx,
      vy,
      startScale,
      startAlpha,
      endAlpha,
      startRotation,
      rotationDelta,
      angularVelocity,
      startTime,
      durationMs,
      active: true,
    };
  }

  /**
   * Recycles an active particle descriptor and its sprite.
   */
  private releaseParticle(p: ActiveParticle): void {
    this.releaseSprite(p.sprite);
    p.active = false;
    this.particleObjectPool.push(p);
  }

  /**
   * Retrieves a cached texture frame by name.
   *
   * @param name - Symbolic texture or frame name.
   * @returns Texture instance or `null` if not found.
   */
  private getTexture(name: string): PIXI.Texture | null {
    const clean = name.toLowerCase().replace(/\.[^/.]+$/, "");
    const cached = textureCache[clean] || textureCache[name];
    if (cached && cached.length > 0) {
      return cached[0];
    }
    return null;
  }

  /**
   * Spawns an impact explosion effect when a bullet or laser collides.
   *
   * @param color - Bullet color theme (e.g. `'red'`, `'cyan'`).
   * @param x - World X position of impact.
   * @param y - World Y position of impact.
   */
  public spawnBulletExplosion(color: string, x: number, y: number): void {
    if (Settings.graphics !== "high") return;
    const texName = `particle_${color.toLowerCase()}`;
    const tex = this.getTexture(texName) || this.getTexture("particle_cyan");
    if (!tex) return;

    const cfg = FX_CONFIG.bulletExplosion;
    const now = performance.now();

    for (let i = 0; i < cfg.particleCount; i++) {
      const sprite = this.getSprite(tex);
      const angle = Math.random() * Math.PI * 2;
      const speed =
        cfg.driftSpeedMin +
        Math.random() * (cfg.driftSpeedMax - cfg.driftSpeedMin);
      const scale = cfg.baseScale + (Math.random() - 0.5) * cfg.scaleVariation;

      sprite.x = x;
      sprite.y = y;
      sprite.scale.set(scale, scale);
      sprite.alpha = cfg.alphaStart ?? 1.0;
      sprite.rotation = Math.random() * Math.PI * 2;

      this.activeParticles.push(
        this.getParticle(
          sprite,
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          scale,
          cfg.alphaStart ?? 1.0,
          cfg.alphaEnd ?? 1.0,
          sprite.rotation,
          0,
          now,
          cfg.durationMs,
        ),
      );
    }
  }

  /**
   * Spawns a collection burst effect when a food/fish particle is collected.
   *
   * @param color - Food color name.
   * @param x - World X position.
   * @param y - World Y position.
   */
  public spawnFoodExplosion(color: string, x: number, y: number): void {
    if (Settings.graphics !== "high") return;
    const texName = `particle_food_${color.toLowerCase()}`;
    const tex =
      this.getTexture(texName) ||
      this.getTexture(`particle_${color.toLowerCase()}`) ||
      this.getTexture("particle_cyan");
    if (!tex) return;

    const cfg = FX_CONFIG.foodExplosion;
    const now = performance.now();

    for (let i = 0; i < cfg.particleCount; i++) {
      const sprite = this.getSprite(tex);
      const angle = Math.random() * Math.PI * 2;
      const speed =
        cfg.driftSpeedMin +
        Math.random() * (cfg.driftSpeedMax - cfg.driftSpeedMin);
      const scale = cfg.baseScale + (Math.random() - 0.5) * cfg.scaleVariation;

      sprite.x = x;
      sprite.y = y;
      sprite.scale.set(scale, scale);
      sprite.alpha = cfg.alphaStart ?? 1.0;
      sprite.rotation = Math.random() * Math.PI * 2;

      this.activeParticles.push(
        this.getParticle(
          sprite,
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          scale,
          cfg.alphaStart ?? 1.0,
          cfg.alphaEnd ?? 1.0,
          sprite.rotation,
          0,
          now,
          cfg.durationMs,
        ),
      );
    }
  }

  /**
   * Spawns a major ship destruction explosion effect scaled to ship radius.
   *
   * @param color - Ship skin color theme.
   * @param x - World X position.
   * @param y - World Y position.
   * @param shipSize - Ship collision size radius in world units.
   */
  public spawnShipExplosion(
    color: string,
    x: number,
    y: number,
    shipSize = 50,
  ): void {
    if (Settings.graphics !== "high") return;
    const texName = `particle_ship_${color.toLowerCase()}`;
    const tex =
      this.getTexture(texName) ||
      this.getTexture(`particle_${color.toLowerCase()}`) ||
      this.getTexture("particle_cyan");
    if (!tex) return;

    const cfg = FX_CONFIG.shipExplosion;
    const count = cfg.particleCount;
    const now = performance.now();

    // Ship particle size is 50% to 100% of ship sprite size (matching original ParticleSystem.cpp:38)
    const baseShipScale = (shipSize / 121.0) * 3.1;

    for (let i = 0; i < count; i++) {
      const sprite = this.getSprite(tex);
      const angle = Math.random() * Math.PI * 2;
      const speed =
        cfg.driftSpeedMin +
        Math.random() * (cfg.driftSpeedMax - cfg.driftSpeedMin);
      const scaleRatio =
        cfg.minScaleRatio +
        Math.random() * (cfg.maxScaleRatio - cfg.minScaleRatio);
      const scale = baseShipScale * scaleRatio;
      const initRotation = Math.random() * Math.PI * 2;

      sprite.x = x;
      sprite.y = y;
      sprite.scale.set(scale, scale);
      sprite.alpha = cfg.alphaStart ?? 1.0;
      sprite.rotation = initRotation;

      this.activeParticles.push(
        this.getParticle(
          sprite,
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          scale,
          cfg.alphaStart ?? 1.0,
          cfg.alphaEnd ?? 1.0,
          initRotation,
          0,
          now,
          cfg.durationMs,
          cfg.angularVelocity,
        ),
      );
    }
  }

  /**
   * Advances active particle simulation by one frame, applying drift, shrink, and fading.
   */
  public update(): void {
    if (this.activeParticles.length === 0) return;
    const now = performance.now();

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      if (!p) continue;
      const elapsed = now - p.startTime;
      const progress = elapsed / p.durationMs;

      if (progress >= 1.0) {
        this.releaseParticle(p);
        const last = this.activeParticles.pop()!;
        if (i < this.activeParticles.length) {
          this.activeParticles[i] = last;
        }
        continue;
      }

      // Linear easing for shrink and opacity transition
      const invProgress = 1.0 - progress;
      const currentScale = p.startScale * invProgress;
      p.sprite.scale.set(currentScale, currentScale);
      p.sprite.alpha = p.startAlpha + (p.endAlpha - p.startAlpha) * progress;

      // Continuous angular velocity (e.g. ship shards) or fixed rotation delta
      if (p.angularVelocity !== undefined) {
        p.sprite.rotation += p.angularVelocity;
      } else {
        p.sprite.rotation = p.startRotation + p.rotationDelta * progress;
      }

      const dtSec = elapsed * 0.001;
      p.sprite.x = p.startX + p.vx * dtSec;
      p.sprite.y = p.startY + p.vy * dtSec;
    }
  }

  /**
   * Recycles all currently active explosion particles and clears the active list.
   */
  public clear(): void {
    for (let i = 0; i < this.activeParticles.length; i++) {
      const p = this.activeParticles[i];
      if (p) this.releaseParticle(p);
    }
    this.activeParticles.length = 0;
  }
}

/** Global particle effects manager singleton instance. */
export const FX = new FXManager();
