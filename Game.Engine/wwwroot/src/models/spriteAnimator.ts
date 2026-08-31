/**
 * @file Entity sprite animation service for per-frame alpha, scaling, and boost/invulnerability transitions.
 * @module models/spriteAnimator
 *
 * @remarks
 * Service responsible for all per-frame visual animation applied to the PIXI
 * display objects owned by a `RenderedObject`. This is where all boost-phase
 * state machines, invulnerability blink logic, abandoned-ship fades, and
 * per-layer alpha/visibility curves live.
 *
 * All client-side visual constants are parameterized in `ANIMATION_CONSTANTS`.
 */

import * as PIXI from "pixi.js";
import * as particles from "pixi-particles";
import { WorldConfig } from "./worldConfig";
import type { CustomSpriteLayer } from "./renderedObject";
import type { BodyState } from "./cache";
import type { ProjectedPoint } from "../rendering/interpolator";

/**
 * Client-side visual animation constants.
 * Server-driven timing values (boost duration, invulnerability period, bullet lifetime) live in WorldConfig.
 */
export const ANIMATION_CONSTANTS = {
  /** Alpha applied to the ship body/aura during an invulnerability blink-off period while also boosting. */
  INVULN_BLINK_DIM_ALPHA: 0.25,

  /** Bullet and laser trail fade-in ramp duration in milliseconds (original 8-tick threshold ~180ms). */
  BULLET_FADE_IN_MS: 180,

  /** Bullet and laser trail fade-out ramp duration in milliseconds (original 8-tick threshold ~180ms). */
  BULLET_FADE_OUT_MS: 180,

  /** Laser trail fade-in ramp duration in milliseconds. */
  LASER_TRAIL_FADE_IN_MS: 180,

  /** Laser trail fade-out ramp duration in milliseconds. */
  LASER_TRAIL_FADE_OUT_MS: 180,

  /** Base opacity for the dash trail flame. */
  DASH_TRAIL_BASE_ALPHA: 1.0,

  /** Dash trail fade-out ramp duration in milliseconds (phase-3 expiry). */
  DASH_TRAIL_FADE_OUT_MS: 450,

  /** Invulnerability cycle duration in milliseconds (full blink-on + blink-off period). */
  INVULN_CYCLE_MS: 100,

  /** Fraction of `INVULN_CYCLE_MS` during which the ship is in the dimmed state. */
  INVULN_DIM_FRACTION: 0.5,

  /** Alpha applied to the ship body during the dimmed phase of an invulnerability cycle. */
  INVULN_BLINK_ALPHA: 0.5,

  /** Ship abandonment fade-out duration in milliseconds. */
  ABANDON_FADE_MS: 1000,

  /** Duration (ms) over which a dead/abandoned ship texture fades in. */
  DEAD_SHIP_FADE_IN_MS: 2000,

  /** Duration (ms) over which a live ship texture fades out when abandoned. */
  LIVE_SHIP_FADE_OUT_MS: 2000,

  /** Duration (ms) for the glow effect fade-in on spawn. */
  GLOW_SPAWN_FADE_IN_MS: 1000,

  /** Duration (ms) for the food/fish sprite fade-in on spawn. */
  FOOD_SPAWN_FADE_IN_MS: 1000,

  /** Boost emitter begins emitting this many milliseconds into the boost (phase-2 start). */
  BOOST_EMITTER_START_MS: 160,
} as const;

/**
 * Maps fleet group IDs to the timestamp when that group first started boosting.
 * Used to synchronise the boost start time across all ships in the same fleet.
 */
export const groupBoostTimes: Record<number, number> = {};

/**
 * Maps fleet group IDs to the timestamp when that group first became invulnerable.
 */
export const groupInvulnerableTimes: Record<number, number> = {};

/**
 * Maps fleet group IDs to the spawn time and lifetime of their most recent
 * projectile, so all bullets fired at the same tick share the same fade clock.
 */
export const groupBulletData: Record<
  number,
  { spawnTime: number; lifetime: number }
> = {};

/** Timestamp of the last time stale entries were pruned from the group maps. */
let lastPruneTime = 0;

/**
 * Removes stale entries from the group-state maps older than 5 seconds.
 * Called once per network update cycle (not per frame) to amortise cost.
 */
export function pruneStaticState(now: number): void {
  if (now - lastPruneTime < 5000) return;
  lastPruneTime = now;

  for (const id in groupBulletData) {
    const entry = groupBulletData[id as unknown as number];
    if (entry && now - entry.spawnTime > 5000) {
      delete groupBulletData[id as unknown as number];
    }
  }
  for (const id in groupBoostTimes) {
    const t = groupBoostTimes[id as unknown as number];
    if (t && now - t > 5000) {
      delete groupBoostTimes[id as unknown as number];
    }
  }
  for (const id in groupInvulnerableTimes) {
    const t = groupInvulnerableTimes[id as unknown as number];
    if (t && now - t > 5000) {
      delete groupInvulnerableTimes[id as unknown as number];
    }
  }
}

/**
 * Data contract passed from `RenderedObject` to `SpriteAnimator.animate()`.
 * Contains all the state the animator needs to compute alpha, visibility, and
 * position without coupling to the full `RenderedObject` class.
 */
export interface AnimationContext {
  spriteLayers: CustomSpriteLayer[] | false;
  emitterLayers: particles.Emitter[] | false;
  body: BodyState | null | undefined;
  isBoosting: boolean;
  boostStartTime: number;
  isInvulnerable: boolean;
  invulnerableStartTime: number;
  isAbandoned: boolean;
  abandonedStartTime: number;
  spawnTime: number;
  bulletLifetime: number;
  positionDelta: { x: number; y: number };
}

/**
 * Stateless per-frame animation service for game entities.
 *
 * Call `animate()` once per render frame for each entity.  The method mutates
 * PIXI display object properties (`alpha`, `visible`, `position`, `rotation`,
 * `scale`) but does NOT own them — `RenderedObject` retains ownership.
 */
export class SpriteAnimator {
  /**
   * Applies all per-frame position, rotation, scale, alpha, and visibility
   * updates to the sprite and emitter layers of an entity.
   *
   * @param ctx      Mutable animation context from the owning `RenderedObject`.
   * @param position The interpolated world position for this frame.
   * @param size     The entity's logical size (radius in world units).
   * @param now      Current wall-clock time from `performance.now()`.
   */
  animate(
    ctx: AnimationContext,
    position: ProjectedPoint,
    size: number,
    now: number,
  ): void {
    const angle = position.Angle;
    const AC = ANIMATION_CONSTANTS;

    // -----------------------------------------------------------------------
    // Sprite layers
    // -----------------------------------------------------------------------

    if (ctx.spriteLayers && ctx.spriteLayers.length) {
      for (let i = 0; i < ctx.spriteLayers.length; i++) {
        const layer = ctx.spriteLayers[i];
        if (!layer) continue;

        // --- Geometry ---
        layer.pivot.x = layer.texture.width / 2;
        layer.pivot.y = layer.texture.height / 2;

        const scale = size * (layer.baseScale ?? 1);
        layer.scale.set(scale, scale);

        const offX = (layer.baseOffset?.x ?? 0) * scale;
        const offY = (layer.baseOffset?.y ?? 0) * scale;

        layer.position.x =
          position.x + offX * Math.cos(angle) - offY * Math.sin(angle);
        layer.position.y =
          position.y + offY * Math.cos(angle) + offX * Math.sin(angle);

        const rotationOffset =
          layer.baseRotation !== undefined
            ? layer.baseRotation
            : layer.textureDefinition?.rotate !== undefined
              ? Number(layer.textureDefinition.rotate)
              : Math.PI / 2;

        layer.rotation = angle + rotationOffset;

        const fileStr = String(
          layer.textureDefinition?.file ?? "",
        ).toLowerCase();

        // --- Invulnerability blink ---
        let isBlinkDimmed = false;
        if (ctx.isInvulnerable && !ctx.isAbandoned) {
          const invulnElapsed = now - ctx.invulnerableStartTime;
          if (invulnElapsed < WorldConfig.spawnInvulnerabilityDurationMs) {
            const periodIndex =
              Math.floor(
                invulnElapsed / WorldConfig.invulnerabilityBlinkPeriodMs,
              ) + 1;
            const isBlinkVisible = periodIndex % 2 === 1;
            if (!isBlinkVisible) {
              if (ctx.isBoosting) {
                // Dash trail stays continuous; body/aura dims to ghostly translucent
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

        // --- Per-texture-type alpha curves ---
        this._applyLayerAlpha(
          layer,
          ctx,
          fileStr,
          scale,
          angle,
          now,
          isBlinkDimmed,
          AC,
        );

        // --- One-shot AnimatedSprite guard ---
        // Hide a finished one-shot sprite so the frozen last frame is not visible.
        if (
          layer instanceof PIXI.AnimatedSprite &&
          !layer.loop &&
          !layer.playing
        ) {
          layer.alpha = 0;
          layer.visible = false;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Emitter layers
    // -----------------------------------------------------------------------

    if (ctx.emitterLayers && ctx.emitterLayers.length) {
      for (let i = 0; i < ctx.emitterLayers.length; i++) {
        const emitter = ctx.emitterLayers[i];
        if (!emitter) continue;

        const texDef = (
          emitter as unknown as { textureDefinition?: { emitter?: string } }
        ).textureDefinition;
        const emitterKey = String(texDef?.emitter ?? "");
        const isBoostEmitter = emitterKey.startsWith("boost");

        if (isBoostEmitter) {
          if (ctx.isBoosting) {
            const boostElapsed = now - ctx.boostStartTime;
            emitter.emit = boostElapsed >= AC.BOOST_EMITTER_START_MS;
          } else {
            emitter.emit = false;
          }

          // Align emitter to the rear nozzle
          const trailAngleDeg = ((angle + Math.PI) * 180) / Math.PI;
          emitter.rotate(trailAngleDeg);
          const rearX = position.x - Math.cos(angle) * (size * 0.45);
          const rearY = position.y - Math.sin(angle) * (size * 0.45);
          emitter.updateOwnerPos(rearX, rearY);
        } else {
          emitter.updateOwnerPos(position.x, position.y);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Applies the correct alpha/visibility curve for a single sprite layer based on its texture file name. */
  private _applyLayerAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    fileStr: string,
    scale: number,
    angle: number,
    now: number,
    isBlinkDimmed: boolean,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    const bodyID = ctx.body?.ID ?? 0;

    if (fileStr.startsWith("dash_trail")) {
      this._applyDashTrailAlpha(layer, ctx, scale, now, bodyID, AC);
    } else if (fileStr.startsWith("dead_ship")) {
      this._applyDeadShipAlpha(layer, ctx, now, AC);
    } else if (
      fileStr.startsWith("particle_ship") ||
      fileStr.includes("_boost")
    ) {
      this._applyBoostOverlayAlpha(layer, ctx, now, isBlinkDimmed, AC);
    } else if (fileStr.startsWith("ship") && !fileStr.startsWith("ship_ab")) {
      this._applyLiveShipAlpha(layer, ctx, now, isBlinkDimmed, AC);
    } else if (fileStr.includes("glow")) {
      this._applyGlowAlpha(layer, ctx, now, AC);
    } else if (fileStr.startsWith("food") || fileStr.startsWith("fish")) {
      this._applyFoodAlpha(layer, ctx, now, AC);
    } else if (fileStr.includes("laser") && fileStr.includes("trail")) {
      this._applyLaserTrailAlpha(layer, ctx, position, angle, scale, now, AC);
    } else if (fileStr.startsWith("laser") || fileStr.startsWith("bullet")) {
      this._applyBulletAlpha(layer, ctx, now, AC);
    }
    // No else: textures that don't match any pattern keep their definition alpha.
  }

  private _applyDashTrailAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    scale: number,
    now: number,
    _bodyID: number,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    if (!ctx.isBoosting) {
      layer.alpha = 0.0;
      layer.visible = false;
      return;
    }
    const boostElapsed = now - ctx.boostStartTime;
    const totalBoostMs = WorldConfig.boostDurationMs || 1250;
    const accelEndMs = totalBoostMs * 0.2; // 0..5 ticks (first 20%)
    const decelEndMs = totalBoostMs; // 5..25 ticks (remaining 80%)

    if (boostElapsed < accelEndMs) {
      // Phase 1 (0..5 ticks / Acceleration Surge): flame ignites, alpha ramps 0 -> 1 locked to engine nozzle
      const progress = Math.min(1.0, Math.max(0.0, boostElapsed / accelEndMs));
      layer.scale.set(scale, scale);
      layer.alpha = progress * AC.DASH_TRAIL_BASE_ALPHA;
      layer.visible = layer.alpha > 0.01;
    } else if (boostElapsed < decelEndMs) {
      // Phase 2 & 3 (5..25 ticks / Deceleration & Decay): flame burns out, alpha fades 1 -> 0 locked to engine nozzle
      const progress = Math.min(
        1.0,
        Math.max(0.0, (boostElapsed - accelEndMs) / (decelEndMs - accelEndMs)),
      );
      const fadeAlpha = 1.0 - progress;
      layer.scale.set(scale, scale);
      layer.alpha = fadeAlpha * AC.DASH_TRAIL_BASE_ALPHA;
      layer.visible = layer.alpha > 0.01;
    } else {
      layer.alpha = 0.0;
      layer.visible = false;
    }
  }

  private _applyDeadShipAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    now: number,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    if (!ctx.isAbandoned) {
      layer.alpha = 0.0;
      layer.visible = false;
    } else {
      const abElapsed = now - ctx.abandonedStartTime;
      const abProgress = Math.min(1.0, abElapsed / AC.DEAD_SHIP_FADE_IN_MS);
      layer.alpha = abProgress;
      layer.visible = layer.alpha > 0.01;
    }
  }

  private _applyBoostOverlayAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    now: number,
    isBlinkDimmed: boolean,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    let boostAlpha = 0.0;
    if (ctx.isBoosting) {
      const boostElapsed = now - ctx.boostStartTime;
      if (boostElapsed < WorldConfig.boostPhase2BurnMs) {
        boostAlpha = 1.0;
      } else if (boostElapsed < WorldConfig.boostDurationMs) {
        const phase3Elapsed = boostElapsed - WorldConfig.boostPhase2BurnMs;
        const phase3Progress = Math.min(
          1.0,
          Math.max(0.0, phase3Elapsed / WorldConfig.boostPhase3DurationMs),
        );
        boostAlpha = Math.max(0.0, 1.0 - phase3Progress);
      }
    }

    let invulnAlpha = 0.0;
    if (ctx.isInvulnerable) {
      const invulnElapsed = now - ctx.invulnerableStartTime;
      if (invulnElapsed < WorldConfig.spawnInvulnerabilityDurationMs) {
        const invulnProgress = Math.min(
          1.0,
          invulnElapsed / WorldConfig.spawnInvulnerabilityDurationMs,
        );
        invulnAlpha = Math.max(0.0, 1.0 - invulnProgress);
      }
    }

    let combinedAlpha = Math.max(boostAlpha, invulnAlpha);
    if (isBlinkDimmed) combinedAlpha *= AC.INVULN_BLINK_DIM_ALPHA;

    layer.alpha = combinedAlpha;
    layer.visible = layer.alpha > 0.01;
  }

  private _applyLiveShipAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    now: number,
    isBlinkDimmed: boolean,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    if (ctx.isAbandoned) {
      const abElapsed = now - ctx.abandonedStartTime;
      const abProgress = Math.min(1.0, abElapsed / AC.LIVE_SHIP_FADE_OUT_MS);
      layer.alpha = Math.max(0.0, 1.0 - abProgress);
      layer.visible = layer.alpha > 0.01;
    } else {
      layer.alpha = isBlinkDimmed ? AC.INVULN_BLINK_DIM_ALPHA : 1.0;
      layer.visible = layer.alpha > 0.01;
    }
  }

  private _applyGlowAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    now: number,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    const spawnAge = now - ctx.spawnTime;
    const spawnAlpha = Math.min(1.0, spawnAge / AC.GLOW_SPAWN_FADE_IN_MS);
    const glowPulse =
      0.4 + 0.6 * (0.5 + 0.5 * Math.sin((now / 1000) * 2 * Math.PI));
    layer.alpha = spawnAlpha * glowPulse;
    layer.visible = true;
  }

  private _applyFoodAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    now: number,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    const spawnAge = now - ctx.spawnTime;
    layer.alpha = Math.min(1.0, spawnAge / AC.FOOD_SPAWN_FADE_IN_MS);
    layer.visible = true;
  }

  private _applyLaserTrailAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    position: ProjectedPoint,
    angle: number,
    scale: number,
    now: number,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    const age = now - ctx.spawnTime;
    const remaining = ctx.bulletLifetime - age;
    const normLife = Math.min(1.0, Math.max(0.0, age / ctx.bulletLifetime));

    // Parabolic length factor matching original Cell.cpp:459-462:
    // Starts at 0 upon firing, grows to full length mid-flight, contracts back to 0 at expiry
    const rawLength = 4.0 * normLife * (1.0 - normLife);
    const lengthFactor = Math.min(1.0, rawLength);

    // Scale along the length axis
    layer.scale.set(scale, scale * Math.max(0.05, lengthFactor));

    // Shift position so front tip remains locked to bullet origin (0, 0)
    const baseOffX = (layer.baseOffset?.x ?? -93) * scale;
    const offX = baseOffX * lengthFactor;
    const offY = (layer.baseOffset?.y ?? 0) * scale;

    layer.position.x =
      position.x + offX * Math.cos(angle) - offY * Math.sin(angle);
    layer.position.y =
      position.y + offY * Math.cos(angle) + offX * Math.sin(angle);

    const fadeIn = Math.min(1.0, age / AC.LASER_TRAIL_FADE_IN_MS);
    const fadeOut =
      remaining < AC.LASER_TRAIL_FADE_OUT_MS
        ? Math.max(0.0, remaining / AC.LASER_TRAIL_FADE_OUT_MS)
        : 1.0;
    layer.alpha = fadeIn * fadeOut;
    layer.visible = layer.alpha > 0.01 && lengthFactor > 0.01;
  }

  private _applyBulletAlpha(
    layer: CustomSpriteLayer,
    ctx: AnimationContext,
    now: number,
    AC: typeof ANIMATION_CONSTANTS,
  ): void {
    const age = now - ctx.spawnTime;
    const remaining = ctx.bulletLifetime - age;
    const fadeIn = Math.min(1.0, age / AC.BULLET_FADE_IN_MS);
    const fadeOut =
      remaining < AC.BULLET_FADE_OUT_MS
        ? Math.max(0.0, remaining / AC.BULLET_FADE_OUT_MS)
        : 1.0;
    let alpha = fadeIn * fadeOut;

    // Bullet head dissolves 8x faster when alpha drops below 0.5 (original Cell.cpp:490)
    if (alpha < 0.5) {
      alpha /= 8.0;
    }

    layer.alpha = alpha;
    layer.visible = layer.alpha > 0.01;
  }
}
