/// <reference types="vite/client" />

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "img/worlds/*.png" {
  const value: string;
  export default value;
}

declare module "*?raw" {
  const content: string;
  export default content;
}

declare module "*.json" {
  const value: any;
  export default value;
}

declare module "dat.gui" {
  export class GUI {
    constructor(options?: { width?: number; autoPlace?: boolean; hideable?: boolean; closed?: boolean; closeOnTop?: boolean });
    add(target: object, propName: string, min?: number, max?: number, step?: number): GUIController;
    addColor(target: object, propName: string): GUIController;
    open(): void;
    close(): void;
    destroy(): void;
  }
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

declare module "nipplejs" {
  const nipplejs: any;
  export default nipplejs;
}

declare module "emoji-mart" {
  export const Picker: any;
  export const NimblePicker: any;
  export const Emoji: any;
}

interface Window {
  Game: any;
  discordData: any;
  PIXI: any;
  Buffer: any;
  process: any;
  global: any;
  popupShowing?: boolean;
}

interface HTMLElement {
  mozRequestFullScreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface Document {
  mozCancelFullScreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

declare const $: any;
declare const jQuery: any;
