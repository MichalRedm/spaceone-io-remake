/**
 * @file Global PixiJS texture frame cache registry.
 * @module models/textureCache
 */

/**
 * Shared registry storing preloaded and parsed `PIXI.Texture` arrays keyed by sprite/texture name.
 */
export const textureCache: Record<string, any> = {
  /** Optional callback invoked to re-initialize and preload sprite sheet atlases. */
  initAtlases: null as (() => void) | null,
  /**
   * Evicts all cached textures from memory and re-executes `initAtlases` if registered.
   */
  clear: function () {
    for (const key in textureCache) {
      if (key !== "clear" && key !== "initAtlases") {
        delete textureCache[key];
      }
    }
    if (typeof textureCache.initAtlases === "function") {
      textureCache.initAtlases();
    }
  },
};
