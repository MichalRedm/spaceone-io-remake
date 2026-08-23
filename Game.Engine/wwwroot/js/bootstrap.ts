import * as pixiModule from "pixi.js";

// In ESM, module namespace objects are sealed and non-extensible.
// We assign all properties into a mutable object on window.PIXI and globalThis.PIXI
// so legacy plugins (pixi-layers, pixi-tilemap) can attach PIXI.display and PIXI.tilemap.
const mutablePIXI: any = {};
for (const key of Object.getOwnPropertyNames(pixiModule)) {
  try {
    mutablePIXI[key] = (pixiModule as any)[key];
  } catch {}
}
for (const key of Object.keys(pixiModule)) {
  try {
    mutablePIXI[key] = (pixiModule as any)[key];
  } catch {}
}

(window as any).PIXI = mutablePIXI;
(globalThis as any).PIXI = mutablePIXI;

export default mutablePIXI;
export { mutablePIXI as PIXI };
