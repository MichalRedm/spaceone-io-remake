/**
 * textureUtils.ts
 *
 * Canonical `TextureDefinition` interface and pure stateless utility functions
 * for texture/sprite name parsing and scale calculation.
 *
 * These were previously static methods on `RenderedObject` that had no
 * dependency on class state. Extracting them here satisfies Rule 13 of the
 * TypeScript standards (single-responsibility, no pure statics on classes).
 */

// ---------------------------------------------------------------------------
// TextureDefinition — Rule 10 canonical shape
// ---------------------------------------------------------------------------

/**
 * Shape of a texture definition object parsed from SCSS theme rules by
 * `queryProperties()`. All fields are optional because the SCSS parser
 * returns only the properties declared for a given selector.
 */
export interface TextureDefinition {
  file?: string;
  url?: string;
  animated?: boolean;
  loop?: boolean;
  /** Either a named key into `emitters.json` or a raw emitter config object. */
  emitter?: string | Record<string, unknown>;
  particle?: string;
  map?: boolean;
  tint?: string | number;
  alpha?: number;
  blendMode?: number;
  size?: string | number;
  scale?: string | number;
  rotate?: string | number;
  offset?: { x: number; y: number };
  "offset-x"?: number;
  "offset-y"?: number;
  "animation-speed"?: number;
  "tile-size"?: number;
  "tile-count"?: number;
  "image-width"?: number;
  "image-height"?: number;
  "tile-width"?: number;
  "tile-height"?: number;
}

// ---------------------------------------------------------------------------
// Sprite map key parsing
// ---------------------------------------------------------------------------

/**
 * Parses a texture/sprite name that optionally contains an atlas map index
 * in the format `"name[N]"`.
 *
 * @returns `{ name, mapID }` if the format matches, `false` otherwise.
 *
 * @example
 * parseMapKey("ship_red[3]") // → { name: "ship_red", mapID: 3 }
 * parseMapKey("ship_red")    // → false
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
//
// `calculateScaleWithHeight` in atlasLoader.ts is the single canonical
// implementation. `getScaleWithHeight` below is a thin re-export shim kept
// for backward compatibility during the transition period; callers should
// migrate to the atlasLoader import directly.
// ---------------------------------------------------------------------------

/**
 * Calculates the display scale factor for a sprite given its texture height.
 *
 * Handles both percentage-based (`"50%"`) and pixel-absolute size values
 * as well as explicit `scale` overrides.
 *
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

/** The ordered colour names mapped to boom-type sprite modes. */
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
 * Decodes a numeric mode bitmask (and optional sprite name) into an array of
 * mode class strings used by `queryProperties` to select the sprite definition.
 *
 * Previously a non-static instance method on `RenderedObject` despite having
 * no dependency on `this`. Now a pure function.
 *
 * @param mode       The numeric mode bitmask from the server.
 * @param spriteName The current sprite name (used to detect boom-type sprites).
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
