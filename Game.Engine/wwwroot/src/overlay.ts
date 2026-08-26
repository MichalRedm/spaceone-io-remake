import Plotly from "./plotly-subset";
import { CustomContainer } from "./CustomContainer";

export class Overlay {
  container: CustomContainer;
  plotly: any;
  canvas: HTMLCanvasElement;
  data: unknown;

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
