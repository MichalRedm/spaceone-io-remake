/**
 * @file Sprite mode mapping SCSS theme parser loader.
 * @module models/spriteModeMap
 */

import { parseScssIntoRules } from "../parser/parseTheme";
import type { ThemeRule } from "../parser/parseTheme";
import spriteModeMapLow from "./spriteModeMap_low.scss?raw";
import spriteModeMapMedium from "./spriteModeMap_medium.scss?raw";
import spriteModeMapHigh from "./spriteModeMap_high.scss?raw";

/**
 * Parses and returns the active sprite mode stylesheet rules based on the user's graphics quality setting.
 *
 * @param graphics - Graphics quality level (`"low"`, `"medium"`, or `"high"`).
 * @returns Array of parsed theme rules.
 */
export function getDefaultSpriteModeMapRules(graphics?: string): ThemeRule[] {
  switch (graphics) {
    case "low":
      return parseScssIntoRules(spriteModeMapLow);
    case "medium":
      return parseScssIntoRules(spriteModeMapMedium);
    default: // high
      return parseScssIntoRules(spriteModeMapHigh);
  }
}

/** Default sprite mode rules parsed at high quality. */
export const spriteModeMapRules = [parseScssIntoRules(spriteModeMapHigh)];
