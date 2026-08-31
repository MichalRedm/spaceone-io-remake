/**
 * @file Master render orchestrator coordinating entity and group pre-render passes.
 * @module rendering/renderer
 */

import { CustomContainer } from "./customContainer";
import { Interpolator } from "./interpolator";
import { Cache, GroupState, BodyState } from "../models/cache";
import { FX } from "../models/fx";
import type { Camera } from "./camera";

/**
 * Top-level render loop coordinator.
 *
 * @remarks
 * Advances transient particle effects (`FX.update()`), iterates all alive bodies in `Cache` to compute
 * dead-reckoned positions and transform display objects (`body.renderer.preRender`), and computes
 * fleet nametag centroid positions (`group.renderer.preRender`).
 */
export class Renderer {
  /** Root PIXI container. */
  container: CustomContainer;
  /** Active camera instance for viewport frustum culling. */
  camera?: Camera;

  /**
   * Constructs a Renderer instance bound to a container and camera.
   *
   * @param container - Root game rendering container.
   * @param camera - Optional camera controller for frustum culling.
   */
  constructor(container: CustomContainer, camera?: Camera) {
    this.container = container;
    this.camera = camera;
  }

  /**
   * Executes a single frame render pass across all cached bodies and groups.
   *
   * @param cache - Spatial entity and group cache.
   * @param interpolator - Kinematic dead-reckoning interpolator.
   * @param currentTime - Authoritative frame timestamp in milliseconds.
   * @param fleetID - Local player's fleet group ID.
   * @param isSpectating - Whether client is currently spectating.
   */
  draw(
    cache: Cache,
    interpolator: Interpolator,
    currentTime: number,
    fleetID: number,
    isSpectating: boolean,
  ): void {
    FX.update();

    const cam = this.camera;

    cache.foreach((body: BodyState) => {
      if (body.renderer) {
        body.renderer.preRender(currentTime, interpolator, fleetID, cam);
      }
    }, this);

    cache.foreachGroup((group: GroupState) => {
      if (group.renderer) {
        group.renderer.preRender(
          currentTime,
          interpolator,
          fleetID,
          isSpectating,
          cam,
        );
      }
    }, this);
  }
}
