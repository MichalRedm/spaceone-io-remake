import { CustomContainer } from "./CustomContainer";
import { Interpolator } from "./interpolator";
import { Cache, GroupState, BodyState } from "./cache";
import { FX } from "./models/fx";

export class Renderer {
  container: CustomContainer;
  constructor(container: CustomContainer) {
    this.container = container;
  }

  draw(
    cache: Cache,
    interpolator: Interpolator,
    currentTime: number,
    fleetID: number,
  ): void {
    FX.update();

    cache.foreach((body: BodyState) => {
      if (body.renderer) {
        body.renderer.preRender(currentTime, interpolator, fleetID);
      }
    }, this);

    cache.foreachGroup((group: GroupState) => {
      if (group.renderer) {
        group.renderer.preRender(currentTime, interpolator, fleetID);
      }
    }, this);
  }
}
