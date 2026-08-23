export const textureCache: Record<string, any> = {
  initAtlases: null as (() => void) | null,
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
