import * as PIXI from "pixi.js";
import { textureCache } from "../models/textureCache";
import type { ThemeRule } from "../parser/parseTheme";
import { queryProperties } from "../parser/parseTheme";
import { getDefaultTextureMapRules } from "../models/textureMap";
import { Settings } from "../ui/settings";

const rawImages = import.meta.glob(
  [
    "../../img/*.png",
    "../../img/*.webp",
    "../../img/*.jpg",
    "../../img/*.svg",
    "../../img/atlas/*.png",
    "../../img/main_menu/*.png",
    "../../img/main_menu/*.svg",
    "../../img/worlds/*.png",
  ],
  {
    eager: true,
    import: "default",
  },
) as Record<string, string>;

const rawAtlases = import.meta.glob("../../img/atlas/*.json", {
  eager: true,
  import: "default",
}) as Record<string, any>;

export const images: Record<string, string> = {};
for (const [path, url] of Object.entries(rawImages)) {
  const filenameWithExt = path.split("/").pop() || "";
  const filenameWithoutExt = filenameWithExt.replace(/\.[^/.]+$/, "");
  images[filenameWithExt] = url;
  images[filenameWithoutExt] = url;
  images[filenameWithExt.toLowerCase()] = url;
  images[filenameWithoutExt.toLowerCase()] = url;
}

export const baseTextureCache: Record<string, PIXI.BaseTexture> = {};

export function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if ("decode" in img && typeof img.decode === "function") {
        img
          .decode()
          .then(() => resolve(img))
          .catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => resolve(img);
    img.src = url;
  });
}

export function getCoreGameImageUrls(): string[] {
  const urls = new Set<string>();
  for (const [, atlasData] of Object.entries(rawAtlases)) {
    if (atlasData?.meta?.image) {
      const file = atlasData.meta.image;
      const url = images[file] ?? images[file.toLowerCase()];
      if (url) urls.add(url);
    }
  }
  try {
    const rules = getDefaultTextureMapRules(Settings?.graphics ?? "high");
    for (const rule of rules) {
      if (rule?.obj?.file) {
        const file = String(rule.obj.file[0] ?? "").replace(/['"]/g, "");
        const url = images[file] ?? images[file.toLowerCase()];
        if (url) urls.add(url);
      }
    }
  } catch {}
  return Array.from(urls);
}

export function preloadAllImages(): Promise<void> {
  const urls = getCoreGameImageUrls();
  return Promise.all(urls.map((url) => preloadImage(url))).then(() => {});
}

export function getBaseTexture(
  fileOrUrl: string,
  enableMipmapping = false,
): PIXI.BaseTexture | null {
  if (!fileOrUrl) return null;
  const clean = fileOrUrl.toLowerCase().replace(/\.[^/.]+$/, "");
  if (baseTextureCache[clean]) return baseTextureCache[clean];
  if (baseTextureCache[fileOrUrl]) return baseTextureCache[fileOrUrl];

  const url =
    images[fileOrUrl] ??
    images[clean] ??
    (fileOrUrl.startsWith("data:") ||
    fileOrUrl.startsWith("http") ||
    fileOrUrl.startsWith("blob:")
      ? fileOrUrl
      : null);
  if (!url) return null;

  const img = new Image();
  img.src = url;
  const baseTexture = PIXI.BaseTexture.from(img);
  baseTexture.mipmap = enableMipmapping
    ? PIXI.MIPMAP_MODES.ON
    : PIXI.MIPMAP_MODES.OFF;
  baseTextureCache[fileOrUrl] = baseTexture;
  baseTextureCache[clean] = baseTexture;
  return baseTexture;
}

export function calculateScaleWithHeight(
  textureDefinition: any,
  height: number,
): number {
  let spriteSize = 1;
  if (textureDefinition?.size !== undefined) {
    const sizeVal = textureDefinition.size;
    const spriteSizeIsPercent =
      typeof sizeVal === "string" && sizeVal.endsWith("%");
    spriteSize = spriteSizeIsPercent
      ? parseFloat(sizeVal.slice(0, -1)) / 100
      : parseFloat(sizeVal) / (height > 0 ? height : 128);
  }
  if (textureDefinition?.scale !== undefined) {
    spriteSize = parseFloat(textureDefinition.scale);
  }
  return Number.isFinite(spriteSize) ? spriteSize : 1.0;
}

export function createTextureFromDefinition(
  textureDefinition: any,
  textureName: string,
  enableMipmapping = false,
): PIXI.Texture[] | null {
  if (!textureName || !textureDefinition) return null;
  const cleanName = String(textureName);
  const cleanLower = cleanName.toLowerCase();
  const fileKey = textureDefinition.file ? String(textureDefinition.file) : "";
  const fileLower = fileKey.toLowerCase();

  if (textureCache[cleanName]) return textureCache[cleanName];
  if (textureCache[cleanLower]) return textureCache[cleanLower];
  if (fileKey && textureCache[fileKey]) return textureCache[fileKey];
  if (fileLower && textureCache[fileLower]) return textureCache[fileLower];

  if (textureDefinition.emitter) {
    return null;
  }

  const targetFile = textureDefinition.file || textureDefinition.url;
  if (!targetFile) return null;

  const baseTexture = getBaseTexture(targetFile, enableMipmapping);
  if (!baseTexture) return null;

  const textures: PIXI.Texture[] = [];

  if (textureDefinition.animated) {
    const tileSize =
      textureDefinition["tile-size"] ?? textureDefinition.tile?.size ?? 32;
    const totalTiles =
      textureDefinition["tile-count"] ?? textureDefinition.tile?.count ?? 1;

    for (let tileIndex = 0; tileIndex < totalTiles; tileIndex++) {
      const sx = tileSize * (tileIndex % totalTiles);
      const sy = 0;
      const sw = tileSize;
      const sh = tileSize;
      const tex = new PIXI.Texture(
        baseTexture,
        new PIXI.Rectangle(sx, sy, sw, sh),
        undefined,
        undefined,
        textureDefinition.rotate || 0,
      );
      (tex as any).daudScale = calculateScaleWithHeight(
        textureDefinition,
        tileSize,
      );
      textures.push(tex);
    }
  } else if (textureDefinition.map) {
    const imageWidth = textureDefinition["image-width"] ?? 512;
    const imageHeight = textureDefinition["image-height"] ?? 512;
    const tileWidth =
      textureDefinition["tile-width"] ?? textureDefinition.tile?.width ?? 16;
    const tileHeight =
      textureDefinition["tile-height"] ?? textureDefinition.tile?.height ?? 16;

    const tilesWide = Math.floor(imageWidth / tileWidth);
    const tilesHigh = Math.floor(imageHeight / tileHeight);

    for (let row = 0; row < tilesHigh; row++) {
      for (let col = 0; col < tilesWide; col++) {
        const x = Math.floor(col * tileWidth);
        const y = Math.floor(row * tileHeight);

        const texture = new PIXI.Texture(
          baseTexture,
          new PIXI.Rectangle(x, y, tileWidth, tileHeight),
        );
        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        (texture as any).daudScale = calculateScaleWithHeight(
          textureDefinition,
          tileHeight,
        );
        textures.push(texture);
      }
    }
  } else {
    const texture = new PIXI.Texture(baseTexture);
    const h = baseTexture.realHeight > 0 ? baseTexture.realHeight : 128;
    (texture as any).daudScale = calculateScaleWithHeight(textureDefinition, h);
    if (!baseTexture.valid) {
      baseTexture.once("loaded", () => {
        (texture as any).daudScale = calculateScaleWithHeight(
          textureDefinition,
          baseTexture.realHeight,
        );
      });
    }
    textures.push(texture);
  }

  if (textures.length > 0) {
    textureCache[cleanName] = textures;
    textureCache[cleanLower] = textures;
    if (fileKey) {
      textureCache[fileKey] = textures;
      textureCache[fileLower] = textures;
    }
  }

  return textures;
}

export function initializeAtlasTextures(enableMipmapping = false): void {
  for (const [atlasPath, atlasData] of Object.entries(rawAtlases)) {
    if (!atlasData || !atlasData.frames || !atlasData.meta) continue;
    const atlasImageFile = atlasData.meta.image;
    const baseTexture = getBaseTexture(atlasImageFile, enableMipmapping);
    if (!baseTexture) continue;

    for (const [frameName, frameData] of Object.entries<any>(
      atlasData.frames,
    )) {
      const f = frameData.frame;
      if (!f) continue;
      const rect = new PIXI.Rectangle(f.x, f.y, f.w, f.h);
      const texture = new PIXI.Texture(
        baseTexture,
        rect,
        undefined,
        undefined,
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

export function preloadAllGameTextures(
  rules?: ThemeRule[],
  enableMipmapping = false,
): void {
  initializeAtlasTextures(enableMipmapping);

  let activeRules = rules;
  if (!activeRules || !Array.isArray(activeRules) || activeRules.length === 0) {
    activeRules = getDefaultTextureMapRules(Settings?.graphics ?? "high");
  }
  if (!activeRules || !Array.isArray(activeRules)) return;
  for (const rule of activeRules) {
    if (!rule || !rule.selector || !rule.obj) continue;
    const selector = rule.selector;
    const cleanLower = selector.toLowerCase();
    if (textureCache[selector] || textureCache[cleanLower]) continue;

    try {
      const processedDef: Record<string, any> = {};
      for (const prop in rule.obj) {
        const valArr = rule.obj[prop] ?? [];
        const mapped = valArr.map((x: string) => {
          try {
            return JSON.parse(x);
          } catch {
            return x;
          }
        });
        processedDef[prop] = mapped.length === 1 ? mapped[0] : mapped;
      }
      createTextureFromDefinition(processedDef, selector, enableMipmapping);
    } catch (e) {
      console.warn(`Failed to preload texture definition for ${selector}:`, e);
    }
  }
}

export function uploadTexturesToGPU(renderer?: PIXI.Renderer | any): void {
  if (!renderer || !renderer.plugins?.prepare) return;
  try {
    const baseTexturesToUpload: PIXI.BaseTexture[] =
      Object.values(baseTextureCache);
    if (baseTexturesToUpload.length > 0) {
      renderer.plugins.prepare.upload(baseTexturesToUpload, () => {});
    }
  } catch (e) {
    console.warn("GPU texture upload skipped:", e);
  }
}

export async function preloadAllAssets(
  app?: PIXI.Application,
  enableMipmapping = false,
): Promise<void> {
  try {
    await preloadAllImages();
    preloadAllGameTextures(undefined, enableMipmapping);
    if (app?.renderer) {
      uploadTexturesToGPU(app.renderer);
    }
  } catch (e) {
    console.warn("Asset preloading encountered an error:", e);
  }
}
