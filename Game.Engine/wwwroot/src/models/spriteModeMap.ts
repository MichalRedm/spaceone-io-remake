import { parseScssIntoRules } from "../parser/parseTheme.js";
import spriteModeMapLow from "./spriteModeMap_low.scss?raw";
import spriteModeMapMedium from "./spriteModeMap_medium.scss?raw";
import spriteModeMapHigh from "./spriteModeMap_high.scss?raw";

export function getDefaultSpriteModeMapRules(
  graphics?: string,
): Array<{ selector: string; obj: Record<string, string[]> }> {
  switch (graphics) {
    case "low":
      return parseScssIntoRules(spriteModeMapLow);
    case "medium":
      return parseScssIntoRules(spriteModeMapMedium);
    default: // high
      return parseScssIntoRules(spriteModeMapHigh);
  }
}
export const spriteModeMapRules = [parseScssIntoRules(spriteModeMapHigh)];
