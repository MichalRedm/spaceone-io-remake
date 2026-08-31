/**
 * @file Hexadecimal color parser and RGB/RGBA conversion utilities.
 * @module math/hexColor
 */

/**
 * Validates whether a given string is a valid 3-, 4-, 6-, or 8-digit hexadecimal color string with leading `#`.
 *
 * @param hex - Candidate string (e.g. `#FFF`, `#FF00FF`, `#123456AA`).
 * @returns `true` if valid hex string format; otherwise `false`.
 */
function isValidHex(hex: string): boolean {
  return /^#([A-Fa-f0-9]{3,4}){1,2}$/.test(hex);
}

/**
 * Splits a hexadecimal color body into uniform character chunks corresponding to channel values.
 *
 * @param str - Hex string slice without `#`.
 * @param chunkSize - Length of each color channel chunk (1 for short hex, 2 for standard hex).
 * @returns Array of matched chunk strings or `null` if match fails.
 */
function getChunksFromString(str: string, chunkSize: number): string[] | null {
  return str.match(new RegExp(`.{${chunkSize}}`, "g"));
}

/**
 * Normalizes a hex chunk string to an integer channel value in the range $[0, 255]$.
 *
 * @param hexStr - Hex string chunk (1 or 2 hex digits).
 * @returns Integer value $[0, 255]$.
 */
function convertHexUnitTo256(hexStr: string): number {
  return parseInt(hexStr.repeat(2 / hexStr.length), 16);
}

/**
 * Computes a normalized float alpha channel in range $[0.0, 1.0]$.
 *
 * @param a - Raw alpha integer $[0, 256]$ parsed from 4/8-digit hex, if present.
 * @param alpha - Explicit caller override (either $[0, 1]$ float or $[1, 100]$ percentage).
 * @returns Normalized float $[0.0, 1.0]$.
 */
function getAlphafloat(a?: number, alpha?: number): number {
  if (a !== undefined) {
    return a / 256;
  }
  if (alpha !== undefined) {
    if (1 < alpha && alpha <= 100) {
      return alpha / 100;
    }
    if (0 <= alpha && alpha <= 1) {
      return alpha;
    }
  }
  return 1;
}

/**
 * Converts a hexadecimal color string (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`) into an RGBA numeric array.
 *
 * @remarks
 * Returns $[R, G, B, A]$ where $R, G, B \in [0, 255]$ and $A \in [0.0, 1.0]$.
 * Useful for Canvas and WebGL shader color manipulation.
 *
 * @param hex - Hexadecimal color string starting with `#`.
 * @param alpha - Optional override alpha value (percentage $1-100$ or float $0.0-1.0$).
 * @returns 4-element array `[red, green, blue, alpha]`.
 * @throws {Error} If `hex` is not a valid CSS hex color string.
 *
 * @example
 * ```typescript
 * const [r, g, b, a] = hexToRGB("#00ff00", 0.5); // [0, 255, 0, 0.5]
 * ```
 */
export function hexToRGB(hex: string, alpha?: number): number[] {
  if (!isValidHex(hex)) {
    throw new Error("Invalid HEX");
  }
  const chunkSize = Math.floor((hex.length - 1) / 3);
  const hexArr = getChunksFromString(hex.slice(1), chunkSize) ?? [];
  const [r, g, b, a] = hexArr.map(convertHexUnitTo256);
  return [r ?? 0, g ?? 0, b ?? 0, getAlphafloat(a, alpha)];
}
