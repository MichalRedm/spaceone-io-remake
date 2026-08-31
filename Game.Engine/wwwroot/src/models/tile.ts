/**
 * @file Background grid and map tile visual controller.
 * @module models/tile
 */

import { RenderedObject } from "./renderedObject";
import { getTextureDefinition, loadTexture } from "./renderedObject";
import type { CustomContainer } from "../rendering/customContainer";
import type { Cache, BodyState } from "./cache";
import type { Interpolator } from "../rendering/interpolator";
import { parseMapKey } from "./textureUtils";

/**
 * Visual entity controller for static background map tiles rendered via `PIXI.tilemap`.
 *
 * @remarks
 * Batches static tile quads into `CustomContainer.tiles` (CompositeRectTileLayer) to achieve
 * high-performance single-pass background grid rendering.
 */
export class Tile extends RenderedObject {
  /**
   * Constructs a Tile display controller and marks the tilemap layer as dirty.
   *
   * @param container - Root rendering container.
   * @param _cache - Optional entity cache reference.
   */
  constructor(container: CustomContainer, _cache?: Cache) {
    super(container);
    this.container.tiles.isDirty = true;
  }

  /**
   * Cleans up tile resources and flags the composite tile layer for re-batching.
   */
  override destroy(): void {
    this.container.tiles.isDirty = true;
    super.destroy();
  }

  /**
   * Ingests updated body state data from the server snapshot.
   *
   * @param updateData - Updated kinematic and sprite state.
   */
  override update(updateData: BodyState): void {
    this.body = updateData;
  }

  /**
   * Submits tile texture quad coordinates to the tilemap layer during refresh passes.
   *
   * @param _currentTime - Authoritative render timestamp in milliseconds.
   * @param _interpolator - Kinematic interpolation service.
   */
  override preRender(_currentTime: number, _interpolator: Interpolator): void {
    if (!this.body) return;

    if (this.container.tiles.isRefreshing) {
      const tiles = this.container.tiles;
      const spriteName = this.body.Sprite || "";
      const mapKey = parseMapKey(spriteName);

      if (!mapKey) {
        console.log(
          `non-map key used to reference map texture: ${this.body.Sprite}`,
        );
      } else {
        const textureDefinition = getTextureDefinition(spriteName);
        if (!textureDefinition) return;
        const textures = loadTexture(textureDefinition, mapKey.name);
        if (!textures) return;
        const texture = textures[mapKey.mapID];
        const tileWidth = Number(textureDefinition["tile-width"] ?? 1);
        const tileHeight = Number(textureDefinition["tile-height"] ?? 1);

        if (texture) {
          tiles.addFrame(
            texture,
            (this.body.OriginalPosition.x / (this.body.Size * 2)) * tileWidth -
              tileWidth / 2,
            (this.body.OriginalPosition.y / (this.body.Size * 2)) * tileHeight -
              tileHeight / 2,
          );
        }

        tiles.scale.x = (this.body.Size * 2) / tileWidth;
        tiles.scale.y = (this.body.Size * 2) / tileHeight;
      }
    }
  }
}
