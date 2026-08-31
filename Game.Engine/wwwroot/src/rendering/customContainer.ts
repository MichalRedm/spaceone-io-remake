/**
 * @file PixiJS root scene container subclass with layered display groups.
 * @module rendering/customContainer
 */

import { Container } from "pixi.js";

/**
 * Root PIXI container subclass with specialized layer groups and sub-containers.
 *
 * @remarks
 * Houses display groups from `pixi-layers` for z-ordering (`bodyGroup`, `backgroundGroup`),
 * composite tilemap layer (`tiles`), particle emitters (`emitterContainer`), and debug canvas (`plotly`).
 */
export class CustomContainer extends Container {
  /** Display group for game entities (ships, bullets, particles, text). */
  bodyGroup: any;
  /** HTML element container for debug Plotly graph canvas. */
  plotly: any;
  /** CompositeRectTileLayer for single-pass background map tile rendering. */
  tiles: any;
  /** Display group for background tiles and boundary borders. */
  backgroundGroup: any;
  /** PIXI container holding pooled transient visual effect particles. */
  emitterContainer: any;
}
