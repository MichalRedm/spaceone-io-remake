/**
 * @file PixiJS global namespace polyfill and ESM mutable bridge.
 * @module core/bootstrap
 *
 * @remarks
 * In ECMAScript Modules (ESM), imported module namespace objects are sealed and non-extensible.
 * Legacy PixiJS plugins such as `pixi-layers` and `pixi-tilemap` dynamically attach sub-namespaces
 * (`PIXI.display`, `PIXI.tilemap`) to `window.PIXI` and `globalThis.PIXI`.
 *
 * This bootstrap module constructs an extensible mutable proxy object containing all PIXI exports
 * and installs it onto the global scope before any rendering or UI subsystems load.
 */

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

if (typeof window !== "undefined") {
  (window as any).PIXI = mutablePIXI;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).PIXI = mutablePIXI;
}
if (typeof (global as any) !== "undefined") {
  (global as any).PIXI = mutablePIXI;
}

export default mutablePIXI;
export { mutablePIXI as PIXI };
