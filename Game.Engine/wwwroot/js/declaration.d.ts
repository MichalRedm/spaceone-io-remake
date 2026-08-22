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

interface Window {
  Game: any;
  discordData: any;
  PIXI: any;
  Buffer: any;
  process: any;
  global: any;
}
