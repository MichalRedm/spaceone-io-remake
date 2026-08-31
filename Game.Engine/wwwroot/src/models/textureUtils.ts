/**
 * @file Canonical TextureDefinition contract and pure texture math utilities.
 * @module models/textureUtils
 *
 * @remarks
 * Encapsulates the parsed SCSS theme rule contract (`TextureDefinition`) and provides pure,
 * stateless helper functions for sprite name parsing (`parseMapKey`), scaling factor calculations
 * (`getScaleWithHeight`), and bitmask mode decoding (`decodeModes`).
 */

// ---------------------------------------------------------------------------
// TextureDefinition — Rule 10 canonical shape
// ---------------------------------------------------------------------------

/**
 * Normalized texture and animation definition parsed from SCSS theme stylesheets.
 *
 * @remarks
 * Properties map directly to SCSS properties defined in `textureMap_*.scss` and `spriteModeMap_*.scss`.
 * Evaluated at runtime by `TextureLoader` to configure PixiJS sprites and emitters.
 */
export interface TextureDefinition {
  /** Relative filename or atlas sprite frame key. */
  file?: string;
  /** Direct URL to external image asset. */
  url?: string;
  /** Whether the texture should be instantiated as a multi-frame `PIXI.AnimatedSprite`. */
  animated?: boolean;
  /** Whether animation loop repeats indefinitely. */
  loop?: boolean;
  /** Either a named key into `emitters.json` or a raw emitter config object. */
  emitter?: string | Record<string, unknown>;
  /** Particle texture name override used for emitters. */
  particle?: string;
  /** Whether texture represents a static tilemap texture. */
  map?: boolean;
  /** Color tint hex integer or string applied to sprite. */
  tint?: string | number;
  /** Base opacity channel $[0.0, 1.0]$. */
  alpha?: number;
  /** PixiJS blend mode integer constant. */
  blendMode?: number;
  /** Render size string (e.g. `"50%"` or numeric pixel radius). */
  size?: string | number;
  /** Explicit uniform scale multiplier. */
  scale?: string | number;
  /** Base rotation offset in radians or degrees (e.g. `"90deg"`). */
  rotate?: string | number;
  /** Pivot offset vector in normalized sprite coordinates. */
  offset?: { x: number; y: number };
  /** Horizontal pivot offset in pixels. */
  "offset-x"?: number;
  /** Vertical pivot offset in pixels. */
  "offset-y"?: number;
  /** Playback speed multiplier for animated sprites. */
  "animation-speed"?: number;
  /** Tile grid size in pixels. */
  "tile-size"?: number;
  /** Number of tiles across atlas sheet. */
  "tile-count"?: number;
  /** Source image width in pixels. */
  "image-width"?: number;
  /** Source image height in pixels. */
  "image-height"?: number;
  /** Sub-tile frame width in pixels. */
  "tile-width"?: number;
  /** Sub-tile frame height in pixels. */
  "tile-height"?: number;
  /** Allow arbitrary extra SCSS-parsed properties. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Sprite map key parsing
// ---------------------------------------------------------------------------

/**
 * Parses a texture/sprite name that optionally contains an atlas map index in `"name[N]"` format.
 *
 * @param mapKey - String candidate (e.g. `"map[3]"` or `"ship_red"`).
 * @returns Object with base `name` and integer `mapID`, or `false` if not a map index format.
 *
 * @example
 * ```typescript
 * parseMapKey("map[3]") // { name: "map", mapID: 3 }
 * parseMapKey("ship_red") // false
 * ```
 */
export function parseMapKey(
  mapKey: string,
): { name: string; mapID: number } | false {
  if (!mapKey) return false;
  const mapKeyMatches = mapKey.match(/^(.*)\[(\d*)\]/);
  if (mapKeyMatches && mapKeyMatches[1] && mapKeyMatches[2]) {
    return {
      name: mapKeyMatches[1],
      mapID: parseInt(mapKeyMatches[2], 10),
    };
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scale calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the display scale factor for a sprite given its texture pixel height.
 *
 * @remarks
 * Handles percentage-based (`"50%"`) and pixel-absolute size values as well as explicit `scale` overrides.
 *
 * @param textureDefinition - Parsed SCSS definition object.
 * @param height - Raw pixel height of the source texture.
 * @returns Computed uniform scale multiplier.
 * @deprecated Prefer `calculateScaleWithHeight` from `../rendering/atlasLoader`.
 */
export function getScaleWithHeight(
  textureDefinition: TextureDefinition,
  height: number,
): number {
  let spriteSize = 1;
  if (textureDefinition["size"] !== undefined) {
    const sizeVal = textureDefinition["size"];
    const isPercent = typeof sizeVal === "string" && sizeVal.endsWith("%");
    spriteSize = isPercent
      ? parseFloat((sizeVal as string).slice(0, -1)) / 100
      : parseFloat(String(sizeVal)) / (height > 0 ? height : 1);
  }
  if (textureDefinition["scale"] !== undefined) {
    spriteSize = parseFloat(String(textureDefinition["scale"]));
  }
  return Number.isFinite(spriteSize) ? spriteSize : 1.0;
}

// ---------------------------------------------------------------------------
// Mode decoding
// ---------------------------------------------------------------------------

/** Ordered color names mapped to boom explosion sprite modes. */
const BOOM_COLORS = [
  "cyan",
  "blue",
  "cyan",
  "green",
  "orange",
  "pink",
  "red",
  "yellow",
] as const;

/**
 * Decodes a numeric mode bitmask into an array of mode class strings for SCSS query matching.
 *
 * @param mode - Numeric mode bitmask received from server.
 * @param spriteName - Optional sprite name prefix used to detect explosion sprites.
 * @returns Array of mode class names (e.g. `['default', 'boost']`).
 */
export function decodeModes(mode: number, spriteName?: string): string[] {
  const modes: string[] = [];
  const spriteStr = String(spriteName || "");
  if (spriteStr.startsWith("boom")) {
    if (mode >= 1 && mode < BOOM_COLORS.length) {
      modes.push(BOOM_COLORS[mode]);
    } else {
      modes.push("cyan");
    }
  }
  modes.push("default");
  if ((mode & 1) !== 0) modes.push("boost");
  return modes;
}
