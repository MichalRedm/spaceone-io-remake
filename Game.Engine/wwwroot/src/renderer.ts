import process from "process";

window.process = process;
window.global = window as any;

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
    const groupsUsed: GroupState[] = [];

    cache.foreach((body: BodyState) => {
      if (body.Group) {
        const group = cache.getGroup(body.Group);
        if (group && groupsUsed.indexOf(group) === -1) groupsUsed.push(group);
      }

      if (body.renderer)
        body.renderer.preRender(currentTime, interpolator, fleetID);
    }, this);

    const ids: string[] = [];

    for (const group of groupsUsed) {
      if (group) {
        ids.push(`g-${group.ID}`);

        if (group.renderer)
          group.renderer.preRender(currentTime, interpolator, fleetID);
      }
    }
  }
}
