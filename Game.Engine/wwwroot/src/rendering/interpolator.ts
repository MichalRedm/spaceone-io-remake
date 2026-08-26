import { Vector2 } from "../math/vector2";

export interface ProjectedPoint {
  x: number;
  y: number;
  Angle: number;
}

export interface InterpolableObject {
  DefinitionTime: number;
  OriginalAngle: number;
  AngularVelocity: number;
  OriginalPosition: { x: number; y: number };
  Momentum: { x: number; y: number };
  Angle?: number;
  Position?: Vector2 | { x: number; y: number };
  projectedPoint?: ProjectedPoint;
  previous?:
    | {
        Position?: Vector2 | { x: number; y: number };
        Angle?: number;
        obsolete?: number;
      }
    | false;
}

export class Interpolator {
  constructor(_settings: Record<string, unknown> = {}) {}

  shortAngleDist(a0: number, a1: number): number {
    const max = Math.PI * 2;
    const da = (a1 - a0) % max;
    return ((2 * da) % max) - da;
  }

  angleLerp(a0: number, a1: number, t: number): number {
    return a0 + this.shortAngleDist(a0, a1) * t;
  }

  lerp(value1: number, value2: number, amount: number): number {
    amount = amount < 0 ? 0 : amount;
    amount = amount > 1 ? 1 : amount;
    return value1 + (value2 - value1) * amount;
  }

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
