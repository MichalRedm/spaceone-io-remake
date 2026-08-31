/**
 * @file Debug overlay and Plotly visualization mount controller.
 * @module ui/overlay
 */

import { CustomContainer } from "../rendering/customContainer";

/**
 * Controller managing debug canvas overlays and Plotly visualization mounts.
 */
export class Overlay {
  /** Root PIXI container. */
  container: CustomContainer;
  /** Plotly instance reference. */
  plotly: any;
  /** Target HTML canvas element. */
  canvas: HTMLCanvasElement;
  /** Active custom overlay payload. */
  data: unknown;

  /**
   * Constructs an Overlay controller.
   *
   * @param container - Root game rendering container.
   * @param canvas - Target HTML canvas element.
   * @param plotly - Debug Plotly DOM container.
   */
  constructor(
    container: CustomContainer,
    canvas: HTMLCanvasElement,
    plotly: any,
  ) {
    this.container = container;
    this.plotly = plotly;
    this.canvas = canvas;
    this.data = false;
  }

  /**
   * Updates overlay data and manages Plotly container visibility.
   *
   * @param customData - Deserialized custom data payload from server.
   */
  update(customData: unknown): void {
    this.data = customData;

    if (this.plotly && this.plotly.used) {
      if (this.container.plotly)
        this.container.plotly.style.visibility = "visible";
    } else {
      if (this.container.plotly)
        this.container.plotly.style.visibility = "hidden";
    }
  }
}
