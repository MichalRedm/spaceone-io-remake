/**
 * @file Ambient TypeScript declarations for static asset imports, third-party libraries, and global browser augmentations.
 * @module declaration
 */

/// <reference types="vite/client" />

/** Ambient declaration for image PNG asset imports bundled via Vite. */
declare module "*.png" {
  const value: string;
  export default value;
}

/** Ambient declaration for world thumbnail PNG image imports. */
declare module "img/worlds/*.png" {
  const value: string;
  export default value;
}

/** Ambient declaration for raw text asset imports via Vite `?raw` suffix. */
declare module "*?raw" {
  const content: string;
  export default content;
}

/**
 * Type declarations for the `js-cookie` library used for client settings and token persistence.
 */
declare module "js-cookie" {
  /** Configuration options for browser cookie persistence. */
  interface CookieAttributes {
    /** Expiration date or number of days until expiration. */
    expires?: number | Date;
    /** URL path for cookie scope. */
    path?: string;
    /** Domain name scope. */
    domain?: string;
    /** Whether cookie is only transmitted over HTTPS. */
    secure?: boolean;
    /** SameSite cookie policy to mitigate CSRF. */
    sameSite?: "strict" | "lax" | "none";
  }

  /** Static cookie read/write/remove API interface. */
  interface CookiesStatic {
    /** Retrieves the value of a specific cookie by key. */
    get(name: string): string | undefined;
    /** Retrieves all accessible cookies as a key-value record. */
    get(): Record<string, string>;
    /** Sets a cookie with optional attributes. */
    set(
      name: string,
      value: string | number | boolean | object,
      options?: CookieAttributes,
    ): string | undefined;
    /** Removes an existing cookie by key. */
    remove(name: string, options?: CookieAttributes): void;
  }
  const Cookies: CookiesStatic;
  export default Cookies;
}

/** Ambient declaration for raw JSON imports. */
declare module "*.json" {
  const value: any;
  export default value;
}

/**
 * Type declarations for `dat.gui` used in the physics and rendering parameter tuner panel.
 */
declare module "dat.gui" {
  /** Interactive GUI controller panel. */
  export class GUI {
    constructor(options?: {
      width?: number;
      autoPlace?: boolean;
      hideable?: boolean;
      closed?: boolean;
      closeOnTop?: boolean;
    });
    add(
      target: object,
      propName: string,
      min?: number,
      max?: number,
      step?: number,
    ): GUIController;
    addColor(target: object, propName: string): GUIController;
    open(): void;
    close(): void;
    destroy(): void;
  }

  /** Single property controller binding within dat.gui. */
  export interface GUIController {
    onChange(fn: (value: any) => void): GUIController;
    onFinishChange(fn: (value: any) => void): GUIController;
    listen(): GUIController;
    name(name: string): GUIController;
    step(step: number): GUIController;
    min(min: number): GUIController;
    max(max: number): GUIController;
  }
}

/** Ambient declaration for `nipplejs` virtual joystick library on mobile/touch screens. */
declare module "nipplejs" {
  const nipplejs: any;
  export default nipplejs;
}

/** Ambient declaration for core Plotly charting library. */
declare module "plotly.js/lib/core" {
  const Plotly: any;
  export default Plotly;
}

/** Ambient declaration for Plotly bar-polar chart trace type. */
declare module "plotly.js/lib/barpolar" {
  const barpolar: any;
  export default barpolar;
}

/**
 * Global `window` interface augmentation providing access to the game runtime singletons and polyfills.
 */
interface Window {
  /** Global game client singleton and subsystem registry. */
  Game: any;
  /** Discord OAuth authentication payload. */
  discordData: any;
  /** Global PixiJS namespace reference. */
  PIXI: any;
  /** Node.js Buffer polyfill for FlatBuffers compatibility in browser. */
  Buffer: any;
  /** Node.js process polyfill. */
  process: any;
  /** Node.js global polyfill. */
  global: any;
  /** Whether a UI modal popup is currently visible. */
  popupShowing?: boolean;
}

/** Fullscreen API extension declarations on `HTMLElement`. */
interface HTMLElement {
  mozRequestFullScreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

/** Fullscreen API extension declarations on `Document`. */
interface Document {
  mozCancelFullScreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}
