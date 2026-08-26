import * as PIXI from "pixi.js";
import type { CustomContainer } from "./CustomContainer";
import { RenderedObject } from "./models/renderedObject";
import { hexToRGB } from "./hexColor";

export class Border extends RenderedObject {
  graphics: PIXI.Graphics;
  worldSize = 6000;

  constructor(container: CustomContainer) {
    super(container);

    this.graphics = new PIXI.Graphics();
    this.graphics.parentGroup = this.container.backgroundGroup;

    this.updateWorldSize(6000);
    this.container.addChild(this.graphics);
  }

  updateWorldSize(size: number): void {
    const edgeWidth = 4000;
    this.graphics.clear();
    const v = hexToRGB("#200000", 1);
    this.graphics.beginFill(v[0] * 256 * 256 + v[1] * 256 + v[2], v[3]);
    this.graphics.drawRect(
      -size - edgeWidth,
      -size - edgeWidth,
      2 * size + 2 * edgeWidth,
      edgeWidth,
    );
    this.graphics.drawRect(-size - edgeWidth, -size, edgeWidth, 2 * size);
    this.graphics.drawRect(+size, -size, edgeWidth, 2 * size);
    this.graphics.drawRect(
      -size - edgeWidth,
      +size,
      2 * size + 2 * edgeWidth,
      edgeWidth,
    );
    this.graphics.endFill();
    const v2 = hexToRGB("#ff0000", 1);
    this.graphics.lineStyle(3, v2[0] * 256 * 256 + v2[1] * 256 + v2[2], v2[3]);
    this.graphics.drawRect(-size, -size, size * 2, size * 2);

    this.worldSize = size;
  }
}
