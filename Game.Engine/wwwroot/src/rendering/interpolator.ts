/**
 * @file Kinematic interpolation and angular dead-reckoning projection service.
 * @module rendering/interpolator
 *
 * @remarks
 * Performs authoritative dead reckoning between network snapshot intervals:
 * - Computes forward linear motion from momentum: $\mathbf{x}(t) = \mathbf{x}_0 + \mathbf{v} \cdot \Delta t$.
 * - Computes forward rotational angle: $\theta(t) = \theta_0 + \omega \cdot \Delta t$.
 * - Applies shortest-arc angle spherical interpolation (slerp) for smooth turns.
 */

import { Vector2 } from "../math/vector2";

/**
 * Projected 2D spatial point with heading angle in radians.
 */
export interface ProjectedPoint {
  /** Projected X coordinate in World pixels. */
  x: number;
  /** Projected Y coordinate in World pixels. */
  y: number;
  /** Projected heading angle in radians. */
  Angle: number;
}

/**
 * Contract for entity state objects that can undergo kinematic dead-reckoning.
 */
export interface InterpolableObject {
  /** Timestamp when kinematic parameters were defined in milliseconds. */
  DefinitionTime: number;
  /** Heading angle at definition time in radians. */
  OriginalAngle: number;
  /** Angular velocity in radians per millisecond. */
  AngularVelocity: number;
  /** Position at definition time in World units. */
  OriginalPosition: { x: number; y: number };
  /** Velocity vector in World units per millisecond. */
  Momentum: { x: number; y: number };
  /** Current interpolated angle in radians. */
  Angle?: number;
  /** Current interpolated position vector. */
  Position?: Vector2 | { x: number; y: number };
  /** Reused projection container. */
  projectedPoint?: ProjectedPoint;
  /** Previous frame snapshot for smoothing. */
  previous?:
    | {
        Position?: Vector2 | { x: number; y: number };
        Angle?: number;
        obsolete?: number;
      }
    | false;
}

/**
 * Dead-reckoning and interpolation projection calculator.
 */
export class Interpolator {
  /**
   * Constructs an Interpolator service.
   *
   * @param _settings - Optional interpolator configuration settings.
   */
  constructor(_settings: Record<string, unknown> = {}) {}

  /**
   * Computes the signed shortest angular distance between two radian angles.
   *
   * @param a0 - Source angle in radians.
   * @param a1 - Target angle in radians.
   * @returns Shortest signed angular displacement in radians $[-\pi, \pi]$.
   */
  shortAngleDist(a0: number, a1: number): number {
    const max = Math.PI * 2;
    const da = (a1 - a0) % max;
    return ((2 * da) % max) - da;
  }

  /**
   * Performs shortest-arc linear interpolation between two angles in radians.
   *
   * @param a0 - Source angle in radians.
   * @param a1 - Target angle in radians.
   * @param t - Interpolation alpha factor $[0.0, 1.0]$.
   * @returns Interpolated angle in radians.
   */
  angleLerp(a0: number, a1: number, t: number): number {
    return a0 + this.shortAngleDist(a0, a1) * t;
  }

  /**
   * Standard linear interpolation between two scalar numbers clamped to $[0.0, 1.0]$.
   *
   * @param value1 - Start scalar.
   * @param value2 - End scalar.
   * @param amount - Interpolation factor.
   * @returns Interpolated scalar.
   */
  lerp(value1: number, value2: number, amount: number): number {
    amount = amount < 0 ? 0 : amount;
    amount = amount > 1 ? 1 : amount;
    return value1 + (value2 - value1) * amount;
  }

  /**
   * Projects an entity forward in time from its definition timestamp using linear momentum and angular velocity.
   *
   * @param object - Kinematic entity data model.
   * @param time - Authoritative render timestamp in milliseconds.
   * @returns Projected world coordinate and angle.
   */
  projectObject(object: InterpolableObject, time: number): ProjectedPoint {
    const timeShift = time - object.DefinitionTime;
    object.Angle = object.OriginalAngle + timeShift * object.AngularVelocity;

    const posX = object.OriginalPosition.x + timeShift * object.Momentum.x;
    const posY = object.OriginalPosition.y + timeShift * object.Momentum.y;

    if (object.Position) {
      object.Position.x = posX;
      object.Position.y = posY;
    } else {
      object.Position = new Vector2(posX, posY);
    }

    if (!object.projectedPoint) {
      object.projectedPoint = { x: 0, y: 0, Angle: 0 };
    }

    if (object.previous && object.previous.Position) {
      const lerpAmount = 0.7;

      // disable position lerping
      object.previous.Position.x = posX;
      object.previous.Position.y = posY;

      object.previous.Angle = this.angleLerp(
        object.previous.Angle ?? object.Angle,
        object.Angle,
        lerpAmount,
      );

      object.projectedPoint.x = object.previous.Position.x;
      object.projectedPoint.y = object.previous.Position.y;
      object.projectedPoint.Angle = object.previous.Angle;
      return object.projectedPoint;
    } else {
      object.projectedPoint.x = posX;
      object.projectedPoint.y = posY;
      object.projectedPoint.Angle = object.Angle;
      return object.projectedPoint;
    }
  }
}
