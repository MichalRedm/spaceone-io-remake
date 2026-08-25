import * as PIXI from "pixi.js";
import { textureCache } from "./textureCache";
import type { CustomContainer } from "../CustomContainer";
import { Settings } from "../settings";

/**
 * Global FX Configuration Parameters
 * Easily tunable to match visual reference.
 */
export const FX_CONFIG = {
  bulletExplosion: {
    particleCount: 2,
    durationMs: 500,
    baseScale: 0.7,
    scaleVariation: 0.2,
    alphaStart: 1.0,
    alphaEnd: 1.0,
    driftSpeedMin: 10,
    driftSpeedMax: 25,
  },
  foodExplosion: {
    particleCount: 2,
    durationMs: 500,
    baseScale: 0.8,
    scaleVariation: 0.2,
    alphaStart: 1.0,
    alphaEnd: 1.0,
    driftSpeedMin: 10,
    driftSpeedMax: 25,
  },
  shipExplosion: {
    minParticles: 1,
    maxParticles: 2,
    durationMs: 500,
    maxScaleRatio: 1.0, // Up to 100% of ship sprite size
    scaleVariation: 0.15,
    alphaStart: 1.0,
    alphaEnd: 1.0,
    rotationDeltaRad: Math.PI / 6, // +30 degrees clockwise
    driftSpeedMin: 15,
    driftSpeedMax: 35,
  },
};

interface ActiveParticle {
  sprite: PIXI.Sprite;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  startScale: number;
  startAlpha: number;
  endAlpha: number;
  startRotation: number;
  rotationDelta: number;
  startTime: number;
  durationMs: number;
  active: boolean;
}

class FXManager {
  private container: PIXI.Container | null = null;
  private particlePool: PIXI.Sprite[] = [];
  private activeParticles: ActiveParticle[] = [];

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

  private getSprite(texture: PIXI.Texture): PIXI.Sprite {
    let sprite: PIXI.Sprite;
    if (this.particlePool.length > 0) {
      sprite = this.particlePool.pop()!;
      sprite.texture = texture;
      sprite.visible = true;
    } else {
      sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
    }

    if (this.container && !sprite.parent) {
      this.container.addChild(sprite);
    }
    return sprite;
  }

  private releaseSprite(sprite: PIXI.Sprite): void {
    sprite.visible = false;
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }
    this.particlePool.push(sprite);
  }

  private getTexture(name: string): PIXI.Texture | null {
    const clean = name.toLowerCase().replace(/\.[^/.]+$/, "");
    const cached = textureCache[clean] || textureCache[name];
    if (cached && cached.length > 0) {
      return cached[0];
    }
    return null;
  }

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

      this.activeParticles.push({
        sprite,
        startX: x,
        startY: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        startScale: scale,
        startAlpha: cfg.alphaStart ?? 1.0,
        endAlpha: cfg.alphaEnd ?? 1.0,
        startRotation: sprite.rotation,
        rotationDelta: 0,
        startTime: now,
        durationMs: cfg.durationMs,
        active: true,
      });
    }
  }

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

      this.activeParticles.push({
        sprite,
        startX: x,
        startY: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        startScale: scale,
        startAlpha: cfg.alphaStart ?? 1.0,
        endAlpha: cfg.alphaEnd ?? 1.0,
        startRotation: sprite.rotation,
        rotationDelta: 0,
        startTime: now,
        durationMs: cfg.durationMs,
        active: true,
      });
    }
  }

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
    const count =
      Math.floor(Math.random() * (cfg.maxParticles - cfg.minParticles + 1)) +
      cfg.minParticles;
    const now = performance.now();

    // Max particle size is ~75% of ship sprite (ship render scale is ~ (shipSize / 121) * 3.1)
    const baseShipScale = (shipSize / 121.0) * 3.1;
    const particleMaxScale = baseShipScale * cfg.maxScaleRatio;

    for (let i = 0; i < count; i++) {
      const sprite = this.getSprite(tex);
      const angle = Math.random() * Math.PI * 2;
      const speed =
        cfg.driftSpeedMin +
        Math.random() * (cfg.driftSpeedMax - cfg.driftSpeedMin);
      const scale =
        particleMaxScale * (0.8 + Math.random() * cfg.scaleVariation);
      const initRotation = Math.random() * Math.PI * 2;

      sprite.x = x;
      sprite.y = y;
      sprite.scale.set(scale, scale);
      sprite.alpha = cfg.alphaStart ?? 1.0;
      sprite.rotation = initRotation;

      this.activeParticles.push({
        sprite,
        startX: x,
        startY: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        startScale: scale,
        startAlpha: cfg.alphaStart ?? 1.0,
        endAlpha: cfg.alphaEnd ?? 1.0,
        startRotation: initRotation,
        rotationDelta: cfg.rotationDeltaRad, // +30 degrees clockwise
        startTime: now,
        durationMs: cfg.durationMs,
        active: true,
      });
    }
  }

  public update(): void {
    if (this.activeParticles.length === 0) return;
    const now = performance.now();

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      const elapsed = now - p.startTime;
      const progress = elapsed / p.durationMs;

      if (progress >= 1.0) {
        this.releaseSprite(p.sprite);
        this.activeParticles.splice(i, 1);
        continue;
      }

      // Linear easing for shrink and opacity transition
      const invProgress = 1.0 - progress;
      const currentScale = p.startScale * invProgress;
      p.sprite.scale.set(currentScale, currentScale);
      p.sprite.alpha = p.startAlpha + (p.endAlpha - p.startAlpha) * progress;
      p.sprite.rotation = p.startRotation + p.rotationDelta * progress;

      const dtSec = elapsed * 0.001;
      p.sprite.x = p.startX + p.vx * dtSec;
      p.sprite.y = p.startY + p.vy * dtSec;
    }
  }

  public clear(): void {
    for (const p of this.activeParticles) {
      this.releaseSprite(p.sprite);
    }
    this.activeParticles = [];
  }
}

export const FX = new FXManager();
