/**
 * @file Boost trail and projectile particle controller with group lag compensation and lifetime fading.
 * @module models/groupParticle
 *
 * @remarks
 * Custom `particles.Particle` subclass that synchronizes position with the owning `RenderedObject`
 * (for boost trail lag compensation) and applies lifecycle alpha corrections for boost and bullet fade-in/fade-out curves.
 */

import * as particles from "pixi-particles";
import { WorldConfig } from "./worldConfig";
import type { RenderedObject } from "./renderedObject";

/** Time window in milliseconds over which a bullet/laser particle fades in at spawn. */
const BULLET_FADE_IN_MS = 180;
/** Time window in milliseconds over which a bullet/laser particle fades out before expiry. */
const BULLET_FADE_OUT_MS = 180;

/**
 * Group-aware particle controller.
 *
 * @remarks
 * Boost particles lag-compensate their position with the parent ship's frame delta (`positionDelta`),
 * and bullet/laser particles apply a smooth fade-in + fade-out alpha curve based on the projectile's remaining lifetime.
 */
export class GroupParticle extends particles.Particle {
  /** Optional reference to server body state for size scaling. */
  body: unknown;
  /** Owning visual controller instance. */
  renderedObject?: RenderedObject;
  /** Whether this particle belongs to an active thruster/boost emitter. */
  isBoostParticle: boolean;

  /**
   * Constructs a GroupParticle instance and attaches it to the appropriate display layer.
   *
   * @param emitter - Parent Pixi particle emitter.
   */
  constructor(emitter: particles.Emitter) {
    super(emitter);
    // Inherit the display layer group from the emitter's parent or the
    // owning RenderedObject's container.
    this.parentGroup =
      emitter.parent?.parentGroup ||
      (emitter as unknown as { renderedObject?: RenderedObject }).renderedObject
        ?.container?.bodyGroup;

    const emitterAny = emitter as unknown as {
      renderedObject?: RenderedObject;
      textureDefinition?: { emitter?: string };
    };
    this.body = emitterAny.renderedObject?.body;
    this.renderedObject = emitterAny.renderedObject;

    const texDef = emitterAny.textureDefinition;
    const emitterKey = String(texDef?.emitter || "");
    this.isBoostParticle = emitterKey.startsWith("boost");
  }

  /**
   * Updates particle kinematic position, boost lag compensation, and lifetime alpha modulation.
   *
   * @param delta - Frame elapsed time factor in seconds.
   * @returns Normalized particle age ratio $[0.0, 1.0]$.
   */
  override update(delta: number): number {
    // --- Boost trail position lag compensation ---
    if (this.isBoostParticle && this.renderedObject?.positionDelta) {
      this.position.x += this.renderedObject.positionDelta.x;
      this.position.y += this.renderedObject.positionDelta.y;
    }

    const ret = super.update(delta);

    // --- Boost particle phase-3 alpha fade ---
    if (this.isBoostParticle && this.renderedObject) {
      const now = performance.now();
      if (!this.renderedObject.isBoosting) {
        this.alpha = 0.0;
      } else {
        const boostElapsed = now - this.renderedObject.boostStartTime;
        if (boostElapsed >= WorldConfig.boostPhase2BurnMs) {
          const phase3Elapsed = boostElapsed - WorldConfig.boostPhase2BurnMs;
          const phase3Progress = Math.min(
            1.0,
            Math.max(0.0, phase3Elapsed / WorldConfig.boostPhase3DurationMs),
          );
          this.alpha *= 1.0 - phase3Progress;
        }
      }
    }

    // --- Body-size scale multiplier ---
    const spriteStr = String((this.body as { Sprite?: string })?.Sprite || "");
    const isBulletOrLaser =
      spriteStr.startsWith("bullet") || spriteStr.startsWith("laser");
    const bodySize = (this.body as { Size?: number })?.Size;

    if (this.body && bodySize && !isBulletOrLaser) {
      this.scaleMultiplier = Math.max(0.5, bodySize / 50.0);
    } else {
      this.scaleMultiplier = 1.0;
    }

    // --- Bullet/laser fade-in + fade-out alpha curve ---
    if (this.renderedObject && isBulletOrLaser) {
      const now = performance.now();
      const age = now - this.renderedObject.spawnTime;
      const remaining = this.renderedObject.bulletLifetime - age;
      const fadeIn = Math.min(1.0, age / BULLET_FADE_IN_MS);
      const fadeOut =
        remaining < BULLET_FADE_OUT_MS
          ? Math.max(0.0, remaining / BULLET_FADE_OUT_MS)
          : 1.0;
      this.alpha *= fadeIn * fadeOut;
    }

    return ret;
  }
}
