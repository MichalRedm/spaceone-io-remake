/**
 * @file 2D projective game camera, viewport frustum, and coordinate transformer.
 * @module rendering/camera
 *
 * @remarks
 * Maintains viewport boundaries, distance zoom scaling, and provides bidirectional transformation
 * between Screen-space pixels and World-space simulation coordinates.
 */

import { Vector2 } from "../math/vector2";
import type { Dimension2 } from "../math/dimension2";

/**
 * Camera initialization options.
 */
export interface CameraSettings {
  /** Field of view angle in radians (default: $\pi / 4.0$). */
  fieldOfView?: number;
}

/**
 * Viewport camera controller managing projection matrices and screen-to-world conversion.
 */
export class Camera {
  /** Camera distance / elevation from the 2D plane in world units (controls zoom). */
  distance: number;
  /** Current world look-at focus point `[x, y]`. */
  lookat: number[];
  /** Canvas viewport dimensions in screen pixels. */
  size: Dimension2;
  /** Field of view angle in radians. */
  fieldOfView: number;
  /** Calculated viewport boundaries in world units. */
  viewport: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    scale: number[];
  };
  /** Viewport aspect ratio (width / height). */
  aspectRatio = 1.0;

  /**
   * Constructs a Camera instance with initial screen dimensions and settings.
   *
   * @param size - Canvas screen pixel dimensions.
   * @param settings - Optional camera configuration.
   */
  constructor(size: Dimension2, settings: CameraSettings = {}) {
    this.distance = 1500.0;
    this.lookat = [0, 0];
    this.size = size;
    this.fieldOfView = settings.fieldOfView || Math.PI / 4.0;
    this.viewport = {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
      scale: [1.0, 1.0],
    };
    this.updateViewport();
  }

  /**
   * Recalculates bounding frustum edges and zoom scale ratios based on current distance and aspect ratio.
   */
  updateViewport(): void {
    this.aspectRatio = this.size.width / this.size.height;
    this.viewport.width = this.distance * Math.tan(this.fieldOfView);
    this.viewport.height = this.viewport.width / this.aspectRatio;
    this.viewport.left = this.lookat[0] - this.viewport.width / 2.0;
    this.viewport.top = this.lookat[1] - this.viewport.height / 2.0;
    this.viewport.right = this.viewport.left + this.viewport.width;
    this.viewport.bottom = this.viewport.top + this.viewport.height;
    this.viewport.scale[0] = this.size.width / this.viewport.width;
    this.viewport.scale[1] = this.size.height / this.viewport.height;
  }

  /**
   * Adjusts camera zoom distance and recalculates viewport.
   *
   * @param z - Target camera distance in world units.
   */
  zoomTo(z: number): void {
    this.distance = z;
    this.updateViewport();
  }

  /**
   * Shifts camera look-at center to a new world position.
   *
   * @param position - Target world position vector.
   */
  moveTo(position: Vector2): void {
    this.lookat[0] = position.x;
    this.lookat[1] = position.y;
    this.updateViewport();
  }

  /**
   * Transforms Screen-space pixel coordinates into World-space simulation coordinates.
   *
   * @param pos - Input Screen-space coordinate in pixels.
   * @param obj - Optional output vector to reuse.
   * @returns Output vector in World units.
   */
  screenToWorld(pos: Vector2, obj: Vector2 = new Vector2(0, 0)): Vector2 {
    const scaleX = this.viewport.scale[0] || 1;
    const scaleY = this.viewport.scale[1] || 1;
    obj.x = pos.x / scaleX + this.viewport.left;
    obj.y = pos.y / scaleY + this.viewport.top;
    return obj;
  }
}
