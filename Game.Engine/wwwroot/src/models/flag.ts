/**
 * @file Capture The Flag (CTF) flag entity visual controller.
 * @module models/flag
 */

import { RenderedObject } from "./renderedObject";
import { CustomContainer } from "../rendering/customContainer";
import type { Cache, BodyState } from "./cache";
import type { Interpolator, ProjectedPoint } from "../rendering/interpolator";
import type { Fleet } from "./fleet";
import { Leaderboard } from "../ui/leaderboard";

/**
 * Visual entity controller for CTF flags (red and blue team flags).
 *
 * @remarks
 * Overrides `computePosition` to lock directly onto the carrier fleet's visual centroid
 * during gameplay, eliminating 40ms network snapshot drift and jitter. When dropped or
 * returning to base, applies smooth exponential position filtering to prevent snapping.
 *
 * Enforces an effective z-order of at least 300 to ensure the flag is always rendered
 * on top of player and bot ships (z-order 200).
 */
export class Flag extends RenderedObject {
  /** Last calculated world position of the blue CTF flag. */
  public static blueFlagPosition: { x: number; y: number } | null = null;
  /** Last calculated world position of the red CTF flag. */
  public static redFlagPosition: { x: number; y: number } | null = null;

  /** Entity cache reference for resolving carrier fleet ships. */
  private cache: Cache;
  /** Active carrier fleet reference when being carried. */
  private carrierFleet: Fleet | null = null;
  /** Smoothly filtered render position in World coordinates. */
  private renderedPosition: { x: number; y: number } | null = null;

  /**
   * Constructs a Flag visual controller.
   *
   * @param container - Root game rendering container.
   * @param cache - Spatial entity and group cache.
   */
  constructor(container: CustomContainer, cache: Cache) {
    super(container);
    this.cache = cache;
    this.currentZIndex = 300;
  }

  /**
   * Synchronizes kinematic state and ensures z-index priority.
   *
   * @param updateData - Updated server body state.
   */
  override update(updateData: BodyState): void {
    super.update(updateData);
    this.currentZIndex = 300;
    this.foreachLayer((layer, i) => {
      layer.zOrder = 300 + i;
    });
  }

  /**
   * Sets sprite textures and enforces top-layer z-ordering.
   */
  override setSprite(
    spriteName: string | false,
    mode: number,
    zIndex: number,
    reload = false,
  ): void {
    super.setSprite(spriteName, mode, Math.max(zIndex, 300), reload);
    this.foreachLayer((layer, i) => {
      layer.zOrder = 300 + i;
    });
  }

  /**
   * Computes the visual position of the flag in World coordinates.
   *
   * @param time - Authoritative render timestamp in milliseconds.
   * @param interpolator - Dead-reckoning kinematic interpolator.
   * @returns Projected 2D spatial point with heading angle in radians.
   */
  override computePosition(
    time: number,
    interpolator: Interpolator,
  ): ProjectedPoint {
    if (!this.body) {
      return { x: 0, y: 0, Angle: 0 };
    }

    const rawPos = interpolator.projectObject(this.body, time);

    // Check if the flag is in motion (server speed > 0.2 when carried; 0.1 when oob drifting)
    const momentum = this.body.Momentum;
    const speedSq = momentum
      ? momentum.x * momentum.x + momentum.y * momentum.y
      : 0;
    const isMoving = speedSq > 0.04;

    // Check carrier fleet ID from CTF leaderboard
    const spriteName = String(this.body.Sprite || this.currentSpriteName || "");
    const carrierID = Leaderboard.getFlagCarrierFleetID(spriteName);

    let activeCarrier: Fleet | null = null;

    if (carrierID > 0) {
      const group = this.cache.getGroup(carrierID);
      if (group?.renderer?.ships && group.renderer.ships.length > 0) {
        activeCarrier = group.renderer;
      }
    }

    // If leaderboard carrier is not yet updated, probe cache fleets within proximity
    if (!activeCarrier && isMoving) {
      if (
        this.carrierFleet &&
        this.carrierFleet.ships &&
        this.carrierFleet.ships.length > 0
      ) {
        // Retain current carrier if still valid and within reasonable distance
        const center = this.getFleetCentroid(
          this.carrierFleet,
          time,
          interpolator,
        );
        const distSq = (center.x - rawPos.x) ** 2 + (center.y - rawPos.y) ** 2;
        if (distSq < 600 * 600) {
          activeCarrier = this.carrierFleet;
        }
      }

      if (!activeCarrier) {
        activeCarrier = this.findNearestFleet(rawPos, time, interpolator);
      }
    }

    // When flag is stationary, clear carrier
    if (!isMoving && carrierID === 0) {
      activeCarrier = null;
    }

    this.carrierFleet = activeCarrier;

    if (activeCarrier) {
      const centroid = this.getFleetCentroid(activeCarrier, time, interpolator);
      this.renderedPosition = { x: centroid.x, y: centroid.y };
      if (spriteName.includes("blue")) {
        Flag.blueFlagPosition = this.renderedPosition;
      } else if (spriteName.includes("red")) {
        Flag.redFlagPosition = this.renderedPosition;
      }
      return { x: centroid.x, y: centroid.y, Angle: 0 };
    }

    // Flag is dropped, at base, or drifting back into bounds
    if (!this.renderedPosition) {
      this.renderedPosition = { x: rawPos.x, y: rawPos.y };
    } else {
      const dx = rawPos.x - this.renderedPosition.x;
      const dy = rawPos.y - this.renderedPosition.y;
      const distSq = dx * dx + dy * dy;

      if (distSq > 500 * 500) {
        // Returned to base or teleported: snap immediately
        this.renderedPosition.x = rawPos.x;
        this.renderedPosition.y = rawPos.y;
      } else {
        // Smooth exponential moving average to eliminate packet snaps
        const alpha = 0.3;
        this.renderedPosition.x += dx * alpha;
        this.renderedPosition.y += dy * alpha;
      }
    }

    if (spriteName.includes("blue")) {
      Flag.blueFlagPosition = this.renderedPosition;
    } else if (spriteName.includes("red")) {
      Flag.redFlagPosition = this.renderedPosition;
    }

    return {
      x: this.renderedPosition.x,
      y: this.renderedPosition.y,
      Angle: 0,
    };
  }

  /**
   * Computes the visual centroid of all alive ships in a fleet at the specified render time.
   */
  private getFleetCentroid(
    fleet: Fleet,
    time: number,
    interpolator: Interpolator,
  ): { x: number; y: number } {
    let accX = 0;
    let accY = 0;
    let count = 0;

    for (let i = 0; i < fleet.ships.length; i++) {
      const ship = fleet.ships[i];
      if (ship?.body) {
        const p = interpolator.projectObject(ship.body, time);
        accX += p.x;
        accY += p.y;
        count++;
      }
    }

    if (count > 0) {
      return { x: accX / count, y: accY / count };
    }

    return { x: 0, y: 0 };
  }

  /**
   * Finds the closest alive fleet in cache within pickup/carrying proximity (300 units).
   */
  private findNearestFleet(
    rawPos: { x: number; y: number },
    time: number,
    interpolator: Interpolator,
  ): Fleet | null {
    let closestFleet: Fleet | null = null;
    let closestDistSq = 300 * 300;

    this.cache.foreachGroup((group) => {
      const fleet = group.renderer;
      if (fleet?.ships && fleet.ships.length > 0) {
        const centroid = this.getFleetCentroid(fleet, time, interpolator);
        const distSq =
          (centroid.x - rawPos.x) ** 2 + (centroid.y - rawPos.y) ** 2;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestFleet = fleet;
        }
      }
    });

    return closestFleet;
  }
}
