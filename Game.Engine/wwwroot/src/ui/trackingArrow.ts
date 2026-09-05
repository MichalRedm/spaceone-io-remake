/**
 * @file Reusable viewport perimeter tracking arrow engine and edge raycasting projection math.
 * @module ui/trackingArrow
 */

import { Vector2 } from "../math/vector2";

/**
 * Configuration options for screen-edge tracking arrows.
 */
export interface TrackingArrowOptions {
  /** Rendered width of the arrow DOM element in pixels. Defaults to 48. */
  width?: number;
  /** Rendered height of the arrow DOM element in pixels. Defaults to 48. */
  height?: number;
  /** Inset padding margin in pixels from the viewport border. Defaults to 24. */
  edgePadding?: number;
  /** Distance in world units at which the arrow begins fading into view. Defaults to 600. */
  fadeZoneDist?: number;
  /** Width of the distance transition zone over which opacity scales to maximum. Defaults to 200. */
  fadeZoneWidth?: number;
  /** Maximum opacity when target is distant. Defaults to 0.85. */
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
 * inset viewport bounding box and applying distance-based opacity fading. Guarantees that
 * the indicator stays entirely within the screen boundaries.
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
  const width = options?.width ?? 48;
  const height = options?.height ?? 48;
  const padding = options?.edgePadding ?? 24;
  const fadeDist = options?.fadeZoneDist ?? 600;
  const fadeWidth = options?.fadeZoneWidth ?? 200;
  const maxOpacity = options?.defaultOpacity ?? 0.85;
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

  const baseAngle = Math.atan2(dy, dx);
  const angle = baseAngle + angularNudge;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Inset boundary box for the center of the arrow
  const halfWidth = Math.max(10, viewportWidth / 2 - padding - width / 2);
  const halfHeight = Math.max(10, viewportHeight / 2 - padding - height / 2);

  // Ray-box intersection from viewport center
  const tx = Math.abs(cos) > 1e-6 ? halfWidth / Math.abs(cos) : Infinity;
  const ty = Math.abs(sin) > 1e-6 ? halfHeight / Math.abs(sin) : Infinity;
  const t = Math.min(tx, ty);

  const centerX = viewportWidth / 2 + t * cos;
  const centerY = viewportHeight / 2 + t * sin;

  const screenX = centerX - width / 2;
  const screenY = centerY - height / 2;

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
 * Calculates symmetric angular nudges when two active off-screen tracking arrows lie along nearly identical bearings.
 *
 * If either target is close to the camera (e.g. in view, within fade zone, or carried by the local fleet),
 * that indicator is not rendered on the perimeter and cannot cause overlap, so no nudge is applied.
 *
 * @param posA - Target A world position.
 * @param posB - Target B world position.
 * @param cameraPos - Camera center world position.
 * @param minDistance - Minimum distance from camera required for both targets to participate in overlap resolution. Defaults to 600.
 * @param minSeparation - Desired angular separation threshold in radians. Defaults to 0.25 (~14 degrees).
 * @returns Tuple `[nudgeA, nudgeB]` in radians.
 */
export function resolveTrackingArrowOverlap(
  posA: { x: number; y: number } | null | undefined,
  posB: { x: number; y: number } | null | undefined,
  cameraPos: { x: number; y: number },
  minDistance = 600,
  minSeparation = 0.25,
): [number, number] {
  if (!posA || !posB) {
    return [0, 0];
  }

  const dxA = posA.x - cameraPos.x;
  const dyA = posA.y - cameraPos.y;
  const distSqA = dxA * dxA + dyA * dyA;

  const dxB = posB.x - cameraPos.x;
  const dyB = posB.y - cameraPos.y;
  const distSqB = dxB * dxB + dyB * dyB;

  // If either target is close to the camera (within fade zone or carried),
  // that arrow is faded/hidden on screen and will never collide with the other arrow.
  const minDistanceSq = minDistance * minDistance;
  if (distSqA < minDistanceSq || distSqB < minDistanceSq) {
    return [0, 0];
  }

  const angleA = Math.atan2(dyA, dxA);
  const angleB = Math.atan2(dyB, dxB);

  // Shortest angular difference between two bearings (-pi, pi]
  let diff = angleA - angleB;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  while (diff > Math.PI) diff -= 2 * Math.PI;

  const absDiff = Math.abs(diff);
  if (absDiff < minSeparation) {
    // Smoothly scale the nudge from 0 at the threshold to full separation at exact collision
    const halfDelta = (minSeparation - absDiff) / 2;
    if (diff >= 0) {
      return [halfDelta, -halfDelta];
    } else {
      return [-halfDelta, halfDelta];
    }
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
    this.hide();
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

    el.style.display = "block";
    el.style.opacity = `${projection.opacity}`;
    el.style.transform = `translate3d(${projection.screenX}px, ${projection.screenY}px, 0) rotate(${projection.rotation}rad)`;
    this.isCurrentlyVisible = true;
  }

  /**
   * Hides the tracking arrow element unconditionally.
   */
  public hide(): void {
    const el = this.getElement();
    if (el) {
      el.style.opacity = "0";
      el.style.display = "none";
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
