import { RenderedObject } from "./renderedObject";
import type { CustomContainer } from "../rendering/customContainer";
import type { Cache } from "./cache";

export class Bullet extends RenderedObject {
  constructor(container: CustomContainer, _cache?: Cache) {
    super(container);
  }
}
