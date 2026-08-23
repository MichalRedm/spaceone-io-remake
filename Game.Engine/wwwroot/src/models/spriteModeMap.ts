import { parseScssIntoRules } from "../parser/parseTheme.js";
import spriteModeMapLow from "./spriteModeMap_low.scss?raw";
import spriteModeMapMedium from "./spriteModeMap_medium.scss?raw";
import spriteModeMapHigh from "./spriteModeMap_high.scss?raw";

export function getDefaultSpriteModeMapRules(graphics) {
  switch (graphics) {
    case "low":
      return parseScssIntoRules(spriteModeMapLow);
    case "medium":
      return parseScssIntoRules(spriteModeMapMedium);
    default: // high
      return parseScssIntoRules(spriteModeMapHigh);
  }
}
export var spriteModeMapRules = [parseScssIntoRules(spriteModeMapHigh)];
