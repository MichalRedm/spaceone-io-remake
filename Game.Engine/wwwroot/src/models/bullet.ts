/**
 * @file Projectile / bullet entity visual controller.
 * @module models/bullet
 */

import { RenderedObject } from "./renderedObject";
import type { CustomContainer } from "../rendering/customContainer";
import type { Cache } from "./cache";

/**
 * Visual entity controller for bullets and laser projectiles.
 *
 * @remarks
 * Extends `RenderedObject` with bullet-specific z-ordering, projectile spawn tracking,
 * and laser trail lifetime curves handled by `SpriteAnimator`.
 */
export class Bullet extends RenderedObject {
  /**
   * Constructs a Bullet visual controller.
   *
   * @param container - Root game rendering container.
   * @param _cache - Optional entity cache reference.
   */
  constructor(container: CustomContainer, _cache?: Cache) {
    super(container);
  }
}
