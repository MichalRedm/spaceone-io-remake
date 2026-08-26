import { RenderedObject } from "./renderedObject";
import { Fleet } from "./fleet";
import { CustomContainer } from "../rendering/customContainer";

export class Ship extends RenderedObject {
  fleet?: Fleet | null;
  constructor(container: CustomContainer) {
    super(container);
    this.fleet = null;
  }

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

  static getSelectorImage(spriteName: string): any {
    const spriteDefinition = RenderedObject.getSpriteDefinition(spriteName);

    if (spriteDefinition?.selector)
      return RenderedObject.getTextureImage(spriteDefinition.selector);
    else return false;
  }

  override destroy(): void {
    if (this.fleet) this.fleet.removeShip(this);

    super.destroy();
  }

  override update(updateData: any): void {
    super.update(updateData);

    // when a ship is abandoned, the ship lives on
    // but it's disconnected from its group
    if (this.fleet && this.body && this.body.Group !== this.fleet.ID) {
      this.fleet.removeShip(this);
      this.fleet = null;
    }
  }
}
