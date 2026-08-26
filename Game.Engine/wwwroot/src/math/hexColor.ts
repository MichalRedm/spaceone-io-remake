function isValidHex(hex: string): boolean {
  return /^#([A-Fa-f0-9]{3,4}){1,2}$/.test(hex);
}

function getChunksFromString(str: string, chunkSize: number): string[] | null {
  return str.match(new RegExp(`.{${chunkSize}}`, "g"));
}

function convertHexUnitTo256(hexStr: string): number {
  return parseInt(hexStr.repeat(2 / hexStr.length), 16);
}

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

export function hexToRGB(hex: string, alpha?: number): number[] {
  if (!isValidHex(hex)) {
    throw new Error("Invalid HEX");
  }
  const chunkSize = Math.floor((hex.length - 1) / 3);
  const hexArr = getChunksFromString(hex.slice(1), chunkSize) ?? [];
  const [r, g, b, a] = hexArr.map(convertHexUnitTo256);
  return [r ?? 0, g ?? 0, b ?? 0, getAlphafloat(a, alpha)];
}
