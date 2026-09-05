/**
 * @file Reusable viewport perimeter tracking arrow engine and edge raycasting projection math.
 * @module ui/trackingArrow
 */

import { Vector2 } from "../math/vector2";

/**
 * Configuration options for screen-edge tracking arrows.
 */
export interface TrackingArrowOptions {
  /** Rendered width of the arrow DOM element in pixels. Defaults to 40. */
  width?: number;
  /** Rendered height of the arrow DOM element in pixels. Defaults to 40. */
  height?: number;
  /** Edge offset margin or padding translation from window boundary. Defaults to 50. */
  edgeTranslate?: number;
  /** Distance in world units at which the arrow begins fading into view. Defaults to 600. */
  fadeZoneDist?: number;
  /** Width of the distance transition zone over which opacity scales to maximum. Defaults to 200. */
  fadeZoneWidth?: number;
  /** Maximum opacity when target is distant. Defaults to 0.7. */
  defaultOpacity?: number;
  /**
   * Intrinsic angular offset of the sprite asset in radians.
   * If the sprite graphic natively points UP (like `Leader_Arrow.png`), set to `Math.PI / 2`.
   * If the sprite graphic natively points RIGHT (like `ctf_arrow_blue.png`), set to `0`.
   * Defaults to 0.
   */
  baseAngleOffset?: number;
  /** Interpolation factor for smoothing target world coordinates (0 = instant snap, 0.15 = smooth lerp). Defaults to 0. */
  lerpFactor?: number;
}

/**
 * Calculated screen edge projection result for positioning and styling an indicator arrow.
 */
export interface TrackingProjectionResult {
  /** Screen X coordinate in pixels relative to viewport top-left. */
  screenX: number;
  /** Screen Y coordinate in pixels relative to viewport top-left. */
  screenY: number;
  /** Final CSS rotation angle in radians. */
  rotation: number;
  /** Opacity value between 0.0 and 1.0. */
  opacity: number;
  /** Distance in world units between target and camera. */
  distance: number;
  /** Direction bearing angle in radians [0, 2pi) relative to camera. */
  angle: number;
  /** Whether the target is sufficiently distant to be rendered. */
  isVisible: boolean;
}

/**
 * Computes the screen-edge projection for a world target relative to the camera center.
 *
 * Casts a ray from viewport center towards the target's bearing angle, intersecting the
 * viewport rectangle and applying edge insets and distance-based opacity fading.
 *
 * @param targetWorldPos - World coordinates of the target entity.
 * @param cameraWorldPos - World coordinates of the player camera.
 * @param viewportWidth - Current viewport width in pixels (`window.innerWidth`).
 * @param viewportHeight - Current viewport height in pixels (`window.innerHeight`).
 * @param options - Customization options for dimensions, insets, and fading.
 * @param angularNudge - Optional angular offset in radians for collision avoidance.
 * @returns Projected screen coordinates, rotation, opacity, and visibility status.
 */
export function computeScreenEdgeProjection(
  targetWorldPos: { x: number; y: number },
  cameraWorldPos: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  options?: TrackingArrowOptions,
  angularNudge = 0,
): TrackingProjectionResult {
  const width = options?.width ?? 40;
  const height = options?.height ?? 40;
  const translate = options?.edgeTranslate ?? 50;
  const fadeDist = options?.fadeZoneDist ?? 600;
  const fadeWidth = options?.fadeZoneWidth ?? 200;
  const maxOpacity = options?.defaultOpacity ?? 0.7;
  const baseAngleOffset = options?.baseAngleOffset ?? 0;

  const dx = targetWorldPos.x - cameraWorldPos.x;
  const dy = targetWorldPos.y - cameraWorldPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Proximity fade calculation
  let opacity = 0;
  if (distance > fadeDist + fadeWidth) {
    opacity = maxOpacity;
  } else if (distance >= fadeDist) {
    const fadeRatio = (distance - fadeDist) / fadeWidth;
    opacity = fadeRatio * maxOpacity;
  } else {
    return {
      screenX: 0,
      screenY: 0,
      rotation: 0,
      opacity: 0,
      distance,
      angle: Math.atan2(dy, dx),
      isVisible: false,
    };
  }

  let angle = Math.atan2(dy, dx) + angularNudge;
  // Normalize angle to [0, 2pi)
  angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  const criticalAngle = Math.atan2(viewportHeight, viewportWidth);
  let screenX = 0;
  let screenY = 0;

  if (angle > 2 * Math.PI - criticalAngle || angle <= criticalAngle) {
    // Right viewport edge
    screenX = viewportWidth + translate - width;
    screenY =
      (viewportHeight - height) / 2 +
      (viewportWidth / 2) *
        Math.tan(angle) *
        (1 - (height - 2 * translate) / viewportHeight);
  } else if (angle > criticalAngle && angle <= Math.PI - criticalAngle) {
    // Bottom viewport edge
    screenX =
      (viewportWidth - width) / 2 +
      (viewportHeight / 2 / Math.tan(angle)) *
        (1 - (width - 2 * translate) / viewportWidth);
    screenY = viewportHeight + translate - height;
  } else if (
    angle > Math.PI - criticalAngle &&
    angle <= Math.PI + criticalAngle
  ) {
    // Left viewport edge
    screenX = -translate;
    screenY =
      (viewportHeight - height) / 2 -
      (viewportWidth / 2) *
        Math.tan(angle) *
        (1 - (height - 2 * translate) / viewportHeight);
  } else {
    // Top viewport edge
    screenX =
      (viewportWidth - width) / 2 -
      (viewportHeight / 2 / Math.tan(angle)) *
        (1 - (width - 2 * translate) / viewportWidth);
    screenY = -translate;
  }

  const rotation = angle + baseAngleOffset;

  return {
    screenX,
    screenY,
    rotation,
    opacity,
    distance,
    angle,
    isVisible: true,
  };
}

/**
 * Calculates symmetric angular nudges when two active tracking arrows lie along nearly identical bearings.
 *
 * Prevents overlapping screen-edge indicators from occluding each other.
 *
 * @param posA - Target A world position.
 * @param posB - Target B world position.
 * @param cameraPos - Camera center world position.
 * @param minSeparation - Minimum angular separation in radians. Defaults to 0.25 (~14 degrees).
 * @param nudgeDelta - Angular offset applied to each arrow when overlapping. Defaults to 0.12 (~7 degrees).
 * @returns Tuple `[nudgeA, nudgeB]` in radians.
 */
export function resolveTrackingArrowOverlap(
  posA: { x: number; y: number } | null | undefined,
  posB: { x: number; y: number } | null | undefined,
  cameraPos: { x: number; y: number },
  minSeparation = 0.25,
  nudgeDelta = 0.12,
): [number, number] {
  if (!posA || !posB) {
    return [0, 0];
  }

  const angleA = Math.atan2(posA.y - cameraPos.y, posA.x - cameraPos.x);
  const angleB = Math.atan2(posB.y - cameraPos.y, posB.x - cameraPos.x);

  // Shortest angular difference between two bearings
  let diff = angleA - angleB;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  while (diff > Math.PI) diff -= 2 * Math.PI;

  if (Math.abs(diff) < minSeparation) {
    // If diff >= 0, A is counterclockwise of B; separate them further
    return diff >= 0 ? [nudgeDelta, -nudgeDelta] : [-nudgeDelta, nudgeDelta];
  }

  return [0, 0];
}

/**
 * Reusable controller for a screen-edge tracking arrow DOM element.
 */
export class TrackingArrow {
  private element: HTMLElement | null = null;
  private readonly elementId: string | null = null;
  private readonly options: TrackingArrowOptions;
  private currentPosition: Vector2 | null = null;
  private isCurrentlyVisible = false;

  /**
   * Initializes a tracking arrow controller bound to a DOM element or element ID.
   *
   * @param elementOrId - The HTML element or element ID string.
   * @param options - Configuration parameters for dimensions, insets, and fading.
   */
  public constructor(
    elementOrId: HTMLElement | string | null,
    options: TrackingArrowOptions = {},
  ) {
    if (typeof elementOrId === "string") {
      this.elementId = elementOrId;
    } else {
      this.element = elementOrId;
    }
    this.options = options;
  }

  private getElement(): HTMLElement | null {
    if (!this.element && this.elementId) {
      this.element = document.getElementById(this.elementId);
    }
    return this.element;
  }

  /**
   * Updates the indicator's screen-edge position, rotation, and opacity for the current frame.
   *
   * @param targetWorldPos - Target coordinate in world space, or null to hide.
   * @param cameraWorldPos - Camera center coordinate in world space.
   * @param angularNudge - Optional angular offset in radians for collision avoidance.
   */
  public update(
    targetWorldPos: { x: number; y: number } | null | undefined,
    cameraWorldPos: { x: number; y: number },
    angularNudge = 0,
  ): void {
    const el = this.getElement();
    if (!el || !targetWorldPos) {
      this.hide();
      return;
    }

    // Smoothly lerp target position if configured
    const lerpFactor = this.options.lerpFactor ?? 0;
    if (lerpFactor > 0) {
      if (!this.currentPosition) {
        this.currentPosition = new Vector2(targetWorldPos.x, targetWorldPos.y);
      } else {
        this.currentPosition.x +=
          (targetWorldPos.x - this.currentPosition.x) * lerpFactor;
        this.currentPosition.y +=
          (targetWorldPos.y - this.currentPosition.y) * lerpFactor;
      }
    } else {
      this.currentPosition = new Vector2(targetWorldPos.x, targetWorldPos.y);
    }

    const projection = computeScreenEdgeProjection(
      this.currentPosition,
      cameraWorldPos,
      window.innerWidth,
      window.innerHeight,
      this.options,
      angularNudge,
    );

    if (!projection.isVisible) {
      this.hide();
      return;
    }

    el.style.opacity = `${projection.opacity}`;
    el.style.transform = `translate3d(${projection.screenX}px, ${projection.screenY}px, 0) rotate(${projection.rotation}rad)`;
    this.isCurrentlyVisible = true;
  }

  /**
   * Hides the tracking arrow element.
   */
  public hide(): void {
    const el = this.getElement();
    if (el && this.isCurrentlyVisible) {
      el.style.opacity = "0";
      this.isCurrentlyVisible = false;
    }
  }

  /**
   * Resets internal position smoothing state and hides the element.
   */
  public reset(): void {
    this.currentPosition = null;
    this.hide();
  }
}
