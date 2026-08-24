import * as PIXI from "pixi.js";
import { textureCache } from "./models/textureCache";

const rawImages = import.meta.glob(["../img/*.png", "../img/atlas/*.png"], {
  eager: true,
  import: "default",
}) as Record<string, string>;

const rawAtlases = import.meta.glob("../img/atlas/*.json", {
  eager: true,
  import: "default",
}) as Record<string, any>;

const images: Record<string, string> = {};
for (const [path, url] of Object.entries(rawImages)) {
  const filenameWithExt = path.split("/").pop() || "";
  const filenameWithoutExt = filenameWithExt.replace(/\.[^/.]+$/, "");
  images[filenameWithExt] = url;
  images[filenameWithoutExt] = url;
  images[filenameWithExt.toLowerCase()] = url;
  images[filenameWithoutExt.toLowerCase()] = url;
}

export function initializeAtlasTextures(enableMipmapping = false): void {
  for (const [atlasPath, atlasData] of Object.entries(rawAtlases)) {
    if (!atlasData || !atlasData.frames || !atlasData.meta) continue;
    const atlasImageFile = atlasData.meta.image;
    const imgUrl =
      images[atlasImageFile] || images[atlasImageFile.toLowerCase()];
    if (!imgUrl) {
      continue;
    }

    const img = new Image();
    img.src = imgUrl;
    const baseTexture = PIXI.BaseTexture.from(img);
    baseTexture.mipmap = enableMipmapping
      ? PIXI.MIPMAP_MODES.ON
      : PIXI.MIPMAP_MODES.OFF;

    for (const [frameName, frameData] of Object.entries<any>(
      atlasData.frames,
    )) {
      const f = frameData.frame;
      if (!f) continue;
      const rect = new PIXI.Rectangle(f.x, f.y, f.w, f.h);
      const texture = new PIXI.Texture(
        baseTexture,
        rect,
        null,
        null,
        frameData.rotated ? 2 : 0,
      );
      (texture as any).daudScale = 1.0;

      const cleanName = frameName.replace(/\.[^/.]+$/, "");
      const cleanLower = cleanName.toLowerCase();
      const frameLower = frameName.toLowerCase();

      textureCache[frameName] = [texture];
      textureCache[cleanName] = [texture];
      textureCache[cleanLower] = [texture];
      textureCache[frameLower] = [texture];
    }
  }
}
