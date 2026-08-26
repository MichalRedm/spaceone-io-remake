import { parseScssIntoRules } from "../parser/parseTheme";
import textureMapLow from "./textureMap_low.scss?raw";
import textureMapMedium from "./textureMap_medium.scss?raw";
import textureMapHigh from "./textureMap_high.scss?raw";

export function getDefaultTextureMapRules(
  graphics?: string,
): Array<{ selector: string; obj: Record<string, string[]> }> {
  switch (graphics) {
    case "low":
      return parseScssIntoRules(textureMapLow);
    case "medium":
      return parseScssIntoRules(textureMapMedium);
    default: // high
      return parseScssIntoRules(textureMapHigh);
  }
}
export const textureMapRules = [parseScssIntoRules(textureMapHigh)];
