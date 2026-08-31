/**
 * @file Base texture mapping SCSS theme parser loader.
 * @module models/textureMap
 */

import { parseScssIntoRules } from "../parser/parseTheme";
import type { ThemeRule } from "../parser/parseTheme";
import textureMapLow from "./textureMap_low.scss?raw";
import textureMapMedium from "./textureMap_medium.scss?raw";
import textureMapHigh from "./textureMap_high.scss?raw";

/**
 * Parses and returns the active texture mapping stylesheet rules based on graphics quality.
 *
 * @param graphics - Graphics quality level (`"low"`, `"medium"`, or `"high"`).
 * @returns Array of parsed theme rules.
 */
export function getDefaultTextureMapRules(graphics?: string): ThemeRule[] {
  switch (graphics) {
    case "low":
      return parseScssIntoRules(textureMapLow);
    case "medium":
      return parseScssIntoRules(textureMapMedium);
    default: // high
      return parseScssIntoRules(textureMapHigh);
  }
}

/** Default texture map rules parsed at high quality. */
export const textureMapRules = [parseScssIntoRules(textureMapHigh)];
