/**
 * @file Ship entity visual controller and mode decoder.
 * @module models/ship
 */

import {
  RenderedObject,
  getSpriteDefinition,
  getTextureImage,
} from "./renderedObject";
import { Fleet } from "./fleet";
import { CustomContainer } from "../rendering/customContainer";
import type { BodyState } from "./cache";

/**
 * Visual entity controller representing an individual player or bot starship.
 *
 * @remarks
 * Handles ship-specific mode decoding (upgrades, shields, boost, invulnerability) and manages
 * membership within a parent `Fleet` aggregate container.
 */
export class Ship extends RenderedObject {
  /** Owning fleet grouping controller, or `null` if abandoned. */
  fleet?: Fleet | null;

  /**
   * Constructs a Ship display controller.
   *
   * @param container - Root game rendering container.
   */
  constructor(container: CustomContainer) {
    super(container);
    this.fleet = null;
  }

  /**
   * Decodes server bitmask flags into CSS-like modifier class names for theme rule matching.
   *
   * @param mode - Numeric bitmask from server `NetBody.mode()`.
   * @returns Array of mode class strings (e.g. `['defenseupgrade', 'default', 'boost', 'shield']`).
   */
  decodeModes(mode: number): string[] {
    const modes: string[] = [];

    if ((mode & 4) !== 0) modes.push("defenseupgrade");
    if ((mode & 8) !== 0) modes.push("offenseupgrade");
    if ((mode & 32) !== 0) modes.push("upgrade1");
    if ((mode & 64) !== 0) modes.push("upgrade2");
    if ((mode & 128) !== 0) modes.push("upgrade3");

    modes.push("default");

    if ((mode & 1) !== 0) modes.push("boost");
    if ((mode & 2) !== 0) modes.push("invulnerable");
    if ((mode & 16) !== 0) modes.push("shield");

    return modes;
  }

  /**
   * Retrieves the thumbnail image element for ship selection UI based on a sprite name.
   *
   * @param spriteName - Symbolic ship sprite key (e.g. `'ship_red'`).
   * @returns Loaded `HTMLImageElement` or `false` if not found.
   */
  static getSelectorImage(spriteName: string): HTMLImageElement | false {
    const spriteDefinition = getSpriteDefinition(spriteName);

    if (spriteDefinition?.selector)
      return getTextureImage(String(spriteDefinition.selector));
    else return false;
  }

  /**
   * Cleans up ship display objects and detaches from parent fleet.
   */
  override destroy(): void {
    if (this.fleet) this.fleet.removeShip(this);

    super.destroy();
  }

  /**
   * Synchronizes kinematic state and handles fleet detachment if ship was abandoned.
   *
   * @param updateData - Updated server body state.
   */
  override update(updateData: BodyState): void {
    super.update(updateData);

    // when a ship is abandoned, the ship lives on
    // but it's disconnected from its group
    if (this.fleet && this.body && this.body.Group !== this.fleet.ID) {
      this.fleet.removeShip(this);
      this.fleet = null;
    }
  }
}
