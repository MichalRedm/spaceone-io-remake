let plotlyInstance: any = null;
let plotlyPromise: Promise<any> | null = null;

export async function getPlotly(): Promise<any> {
  if (plotlyInstance) return plotlyInstance;
  if (!plotlyPromise) {
    plotlyPromise = (async () => {
      const Plotly = (await import("plotly.js/lib/core")).default;
      const barpolar = (await import("plotly.js/lib/barpolar")).default;
      Plotly.register([barpolar]);
      plotlyInstance = Plotly;
      return Plotly;
    })();
  }
  return plotlyPromise;
}
