/**
 * @file Lazy dynamic importer for Plotly.js core and polar bar charting subset.
 * @module ui/plotlySubset
 */

let plotlyInstance: any = null;
let plotlyPromise: Promise<any> | null = null;

/**
 * Lazily loads the minimal Plotly.js charting bundle required for physics kinematics telemetry.
 *
 * @returns Promise resolving to the registered Plotly instance.
 */
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
