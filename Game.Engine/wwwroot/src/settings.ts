import Cookies from "js-cookie";
import JSZip from "jszip";
import { textureCache } from "./models/textureCache";
import { getDefaultTextureMapRules } from "./models/textureMap";
import { getDefaultSpriteModeMapRules } from "./models/spriteModeMap";
import { Controls } from "./controls";
import * as sass from "sass";
import { Buffer } from "buffer";

// in case your code is isomorphic
if (typeof window !== "undefined") (<any>window).Buffer = Buffer;

import { queryProperties, parseScssIntoRules } from "./parser/parseTheme.js";

export interface SettingsData {
  graphics: string;
  theme: string;
  themeCustom: string;
  mouseScale: number;
  font: string;
  leaderboardEnabled: boolean;
  hudEnabled: boolean;
  namesEnabled: boolean;
  bandwidth: number;
  showCooldown: boolean;
  logLength: number;
  displayMinimap: boolean;
  bigKillMessage: boolean;
  showKeyboardHints: boolean;
  showOwnName: boolean;
  allowDarkblueShips: boolean;
  showHints: boolean;
  nameSize: number;
  background: string;
  mipmapping: boolean;
  updatesVersion: number;
  mouseOneButton: number;
  [key: string]: string | number | boolean;
}

export const Settings: SettingsData = {
  graphics: "high",
  theme: "",
  themeCustom: "",
  mouseScale: 1.0,
  font: "Exo 2",
  leaderboardEnabled: true,
  hudEnabled: true,
  namesEnabled: true,
  bandwidth: 100,
  showCooldown: true,
  logLength: 4,
  displayMinimap: true,
  bigKillMessage: true,
  showKeyboardHints: true,
  showOwnName: true,
  allowDarkblueShips: true,
  showHints: true,
  nameSize: 14,
  background: "on",
  mipmapping: true,
  updatesVersion: 0,
  mouseOneButton: 0,
};

var spriteModeMapRules = [getDefaultSpriteModeMapRules(Settings.graphics)];
var textureMapRules = [getDefaultTextureMapRules(Settings.graphics)];
var textureMapRulesLen = textureMapRules[0].length;
var spriteModeMapRulesLen = spriteModeMapRules[0].length;

const themeSelector = <HTMLInputElement>(
  document.getElementById("settingsThemeSelector")
);
const themeSelectorCustom = <HTMLInputElement>(
  document.getElementById("settingsThemeSelectorCustom")
);
const mouseScale = <HTMLInputElement>(
  document.getElementById("settingsMouseScale")
);
const leaderboardEnabled = <HTMLInputElement>(
  document.getElementById("settingsLeaderboardEnabled")
);
const showHints = <HTMLInputElement>(
  document.getElementById("settingsShowHints")
);
const namesEnabled = <HTMLInputElement>(
  document.getElementById("settingsNamesEnabled")
);
const bandwidth = <HTMLInputElement>(
  document.getElementById("settingsBandwidth")
);
const hudEnabled = <HTMLInputElement>(
  document.getElementById("settingsHUDEnabled")
);
const showCooldown = <HTMLInputElement>(
  document.getElementById("settingsShowCooldown")
);
const logLength = <HTMLInputElement>document.getElementById("settingsLog");
const displayMinimap = <HTMLInputElement>(
  document.getElementById("settingsDisplayMinimap")
);
const mipmapping = <HTMLInputElement>(
  document.getElementById("settingsMipMapping")
);
const bigKillMessage = <HTMLInputElement>(
  document.getElementById("settingsBigKillMessage")
);
const showKeyboardHints = <HTMLInputElement>(
  document.getElementById("settingsShowKeyboardHints")
);
const showOwnName = <HTMLInputElement>(
  document.getElementById("settingsShowOwnName")
);
const allowDarkblueShips = <HTMLInputElement>(
  document.getElementById("settingsAllowDarkblueShips")
);
const nameSize = <HTMLInputElement>document.getElementById("settingsNameSize");
const background = <HTMLInputElement>(
  document.getElementById("settingsBackground")
);

const settingsText = document.getElementById("settings-text");
if (settingsText) {
  Array.from(settingsText.children).forEach((elem) => {
    elem.addEventListener("click", () => {
      Settings.graphics = elem.id.split("-")[1] ?? "high";
      Cookies.set("settings", JSON.stringify(Settings), { expires: 300 });
      window.location.reload();
    });
  });
}

function save() {
  const cookieOptions = { expires: 300 };
  let reload = false;

  if (Settings.theme != themeSelector.value) {
    Settings.theme = themeSelector.value;
    if (Settings.theme == "") reload = true;
    else theme(Settings.theme);
  }
  if (Settings.themeCustom != themeSelectorCustom.value) {
    Settings.themeCustom = themeSelectorCustom.value;
    theme(Settings.themeCustom);
  }

  if (Settings.mipmapping != mipmapping.checked) {
    Settings.mipmapping = mipmapping.checked;
    reload = true;
  }

  Settings.font = "Exo 2";
  Settings.mouseScale = Number(mouseScale.value);
  Settings.leaderboardEnabled = leaderboardEnabled.checked;
  Settings.showHints = showHints.checked;
  Settings.namesEnabled = namesEnabled.checked;
  Settings.bandwidth = Number(bandwidth.value);
  Settings.hudEnabled = hudEnabled.checked;
  Settings.showCooldown = showCooldown.checked;
  Settings.logLength = Number(logLength.value);
  Settings.displayMinimap = displayMinimap.checked;
  Settings.mipmapping = mipmapping.checked;
  Settings.bigKillMessage = bigKillMessage.checked;
  Settings.showKeyboardHints = showKeyboardHints.checked;
  Settings.showOwnName = showOwnName.checked;
  Settings.allowDarkblueShips = allowDarkblueShips.checked;
  // Settings.nameSize = Number(nameSize.value);
  Settings.background = background.value;

  Cookies.set("settings", JSON.stringify(Settings), cookieOptions);

  keyboardHints();
  shipBlue();

  if (reload) window.location.reload();
}

function reset() {
  Cookies.remove("settings");
}

function load() {
  let savedSettings: Record<string, any> | null = null;
  const cookie = Cookies.get("settings");
  if (cookie) {
    try {
      savedSettings = JSON.parse(cookie);
    } catch (e) {
      console.error("Failed to parse settings cookie:", e);
    }
  }

  if (savedSettings) {
    // copying value by value because cookies can be old versions
    // any values NOT in the cookie will remain defined with the new defaults
    for (const key in savedSettings) Settings[key] = savedSettings[key];

    // retro upgrades
    if (Settings.theme == "3ds2agh4z76feci") Settings.theme = "xn4t5ce2916uxbx";
    if (Settings.theme == "516mkwof6m4d4tg") Settings.theme = "xn4t5ce2916uxbx";
  }

  themeSelector.value = Settings.theme;
  themeSelectorCustom.value = Settings.themeCustom || "";

  mouseScale.value = String(Settings.mouseScale);
  leaderboardEnabled.checked = Settings.leaderboardEnabled;
  showHints.checked = Settings.showHints;
  mipmapping.checked = Settings.mipmapping;
  namesEnabled.checked = Settings.namesEnabled;
  bandwidth.value = String(Settings.bandwidth);
  hudEnabled.checked = Settings.hudEnabled;
  showCooldown.checked = Settings.showCooldown;
  logLength.value = String(Settings.logLength);
  displayMinimap.checked = Settings.displayMinimap;
  bigKillMessage.checked = Settings.bigKillMessage;
  showKeyboardHints.checked = Settings.showKeyboardHints;
  showOwnName.checked = Settings.showOwnName;
  allowDarkblueShips.checked = Settings.allowDarkblueShips;
  nameSize.value = String(Settings.nameSize);
  background.value = Settings.background;

  const graphicsElem = document.getElementById(`graphics-${Settings.graphics}`);
  graphicsElem?.classList.add("setting-selected");
}

function oldTextureKeyEntToNew(key: string, entry: any): [string, any][] {
  let newEntList: [string, any][] = [];
  if (key == "animationSpeed") {
    newEntList = [["animation-speed", entry]];
  } else if (key == "scale") {
    newEntList = [["size", parseFloat(entry) * 100 + "%"]];
  } else if (key == "tileSize") {
    newEntList = [["tile-size", entry]];
  } else if (key == "tileWidth") {
    newEntList = [["tile-width", entry]];
  } else if (key == "tileHeight") {
    newEntList = [["tile-height", entry]];
  } else if (key == "tileCount") {
    newEntList = [["tile-count", entry]];
  } else if (key == "imageWidth") {
    newEntList = [["image-width", entry]];
  } else if (key == "imageHeight") {
    newEntList = [["image-height", entry]];
  } else if (key == "tileSpaceHeight") {
    newEntList = [["tile-space-height", entry]];
  } else if (key == "tileSpaceWidth") {
    newEntList = [["tile-space-width", entry]];
  } else if (key == "offset" && entry && typeof entry === "object") {
    newEntList = [
      ["offset-x", (entry as { x?: number; y?: number }).x],
      ["offset-y", (entry as { x?: number; y?: number }).y],
    ];
  } else {
    newEntList = [[key, entry]];
  }
  return newEntList;
}

function oldTextureEntryToNew(
  entry: Record<string, any>,
): Record<string, string[]> {
  const newEnt: Record<string, string[]> = {};
  for (const mapKey in entry) {
    const toMake = oldTextureKeyEntToNew(mapKey, entry[mapKey]);
    for (let i = 0; i < toMake.length; i++) {
      const item = toMake[i];
      if (!item) continue;
      newEnt[item[0]] = [JSON.stringify(item[1])];
      if (item[0] == "size") {
        newEnt[item[0]] = [item[1]];
      }
    }
  }
  return newEnt;
}

const debug = true;

async function theme(v?: string) {
  const themeStyles = document.getElementById("theme-styles");
  if (themeStyles) themeStyles.replaceChildren();
  if (v) v = v.toLowerCase();
  const link = `https://dl.dropboxusercontent.com/s/${v}/daudmod.zip`;
  const zip = await fetch(link)
    .then((response) => response.blob())
    .then(JSZip.loadAsync);
  const baseFiles: string[] = [];
  const folder = zip.folder("daudmod");
  if (folder) {
    folder.forEach((_relativePath, file) => {
      if (!file.dir) {
        baseFiles.push(file.name);
      }
    });
  }
  const hasInfo = baseFiles.includes("daudmod/info.json");
  const hasSpriteModeMap = baseFiles.includes("daudmod/spriteModeMap.scss");
  const hasTextureMap = baseFiles.includes("daudmod/textureMap.scss");
  const hasStylesScss = baseFiles.includes("daudmod/styles.scss");
  if (hasStylesScss && hasSpriteModeMap && hasTextureMap) {
    // new theme
    const spriteModeFile = zip.file("daudmod/spriteModeMap.scss");
    const textureMapFile = zip.file("daudmod/textureMap.scss");
    const stylesFile = zip.file("daudmod/styles.scss");

    if (spriteModeFile && textureMapFile && stylesFile) {
      spriteModeFile.async("string").then((text) => {
        textureMapFile.async("string").then((text2) => {
          stylesFile.async("string").then((text3) => {
            if (textureMapRules[0]) {
              textureMapRules[0] = textureMapRules[0].slice(
                0,
                textureMapRulesLen,
              );
            }
            if (spriteModeMapRules[0]) {
              spriteModeMapRules[0] = spriteModeMapRules[0].slice(
                0,
                spriteModeMapRulesLen,
              );
            }

            if (text && spriteModeMapRules[0]) {
              const spriteModeMapR = parseScssIntoRules(text);
              spriteModeMapRules[0] =
                spriteModeMapRules[0].concat(spriteModeMapR);
            }

            if (text2 && textureMapRules[0]) {
              const textureMapR = parseScssIntoRules(text2);
              const promises: Promise<void>[] = [];

              for (const entry of textureMapR) {
                if (entry.obj.file) {
                  const file = JSON.parse(entry.obj.file[0] ?? '""') + "";
                  const f = zip.file(`daudmod/${file}.png`);
                  if (f) {
                    promises.push(
                      f.async("arraybuffer").then((ab) => {
                        const key = entry.selector + "";
                        const arrayBufferView = new Uint8Array(ab);
                        const blob = new Blob([arrayBufferView], {
                          type: "image/png",
                        });
                        const urlCreator = window.URL;
                        const url = urlCreator.createObjectURL(blob);

                        if (key === "shield") {
                          entry.obj.flag = ["true"];
                        }

                        if (debug)
                          console.log(
                            `textureMap.${key}.url: set to blob for file ${file}`,
                          );
                        entry.obj.url = [`"${url}"`];
                      }),
                    );
                  }
                }

                if (entry.obj.emitter) {
                  const emitter = JSON.parse(entry.obj.emitter[0] ?? '""') + "";
                  const f = zip.file(`daudmod/${emitter}.json`);
                  if (f) {
                    promises.push(
                      f.async("string").then((json) => {
                        entry.obj.emitter = [JSON.parse(json)];
                      }),
                    );
                  }
                }
              }
              textureMapRules[0] = textureMapRules[0].concat(textureMapR);

              if (text3) {
                try {
                  const ab = sass
                    .renderSync({ data: text3 })
                    .css.toString("utf8");
                  const imagePromises: Promise<void>[] = [];
                  let cleansed = ab;
                  const images: string[] =
                    ab.match(/url\("\.\/?(.*?\.png)"\)/g) ?? [];
                  const fixed: string[] = [];
                  const fixedMap: string[] = [];
                  const replacePairs: [string, number][] = [];

                  for (let imagen = 0; imagen < images.length; imagen++) {
                    const imocc = images[imagen];
                    if (!imocc) continue;
                    const m = /url\("\.\/?(.*?\.png)"\)/g.exec(imocc);
                    const imgurl = (m && m[1] ? m[1] : "") + "";
                    if (debug) console.log(`theme css imagesss ${imgurl}`);
                    if (fixed.indexOf(imgurl) > 0) {
                      replacePairs.push([imocc, fixed.indexOf(imgurl)]);
                    } else {
                      fixed.push(imgurl);
                      fixedMap.push("");
                      replacePairs.push([imocc, fixed.indexOf(imgurl)]);
                      const imgFile = zip.file(`daudmod/${imgurl}`);
                      if (imgFile) {
                        imagePromises.push(
                          imgFile.async("arraybuffer").then((abData) => {
                            const arrayBufferView = new Uint8Array(abData);
                            const blob = new Blob([arrayBufferView], {
                              type: "image/png",
                            });
                            const urlCreator = window.URL;
                            const url = urlCreator.createObjectURL(blob);
                            fixedMap[fixed.indexOf(imgurl)] = url;

                            if (debug)
                              console.log(
                                `theme css image ${imgurl}: set to blob url ${url}`,
                              );
                          }),
                        );
                      }
                    }
                  }
                  Promise.all(imagePromises).then(() => {
                    for (let k = 0; k < replacePairs.length; k++) {
                      const pair = replacePairs[k];
                      if (!pair) continue;
                      cleansed = cleansed.replace(
                        pair[0],
                        "url(" + (fixedMap[pair[1]] ?? "") + ")",
                      );
                    }
                    const blob = new Blob([cleansed], { type: "text/css" });
                    const urlCreator = window.URL;
                    const url = urlCreator.createObjectURL(blob);

                    const linkEl = document.createElement("link");
                    linkEl.setAttribute("rel", "stylesheet");
                    linkEl.setAttribute("type", "text/css");
                    linkEl.setAttribute("href", url);

                    const currentThemeStyles =
                      document.getElementById("theme-styles");
                    if (currentThemeStyles) {
                      currentThemeStyles.replaceChildren(linkEl);
                    }
                  });
                } catch (e) {
                  console.log("ERROR IN CUSTOM THEME STYLES (STEP 3):", e);
                }
              }

              Promise.all(promises).then(() => {
                if (window.Game && window.Game.cache) {
                  if (debug) console.log(`theme loading complete`);
                  (<any>window).textureMapRules = textureMapRules;
                  (<any>window).spriteModeMapRules = spriteModeMapRules;
                  textureCache.clear();
                  window.Game.cache.refreshSprites();
                  window.Game.reinitializeWorld();
                }
              });
            }
          });
        });
      });
    }
  } else if (hasInfo) {
    // old theme
    const infoFile = zip.file("daudmod/info.json");
    if (infoFile) {
      infoFile.async("string").then((text) => {
        const promises: Promise<void>[] = [];
        const info = JSON.parse(text);

        if (textureMapRules[0]) {
          textureMapRules[0] = textureMapRules[0].slice(0, textureMapRulesLen);
        }
        if (spriteModeMapRules[0]) {
          spriteModeMapRules[0] = spriteModeMapRules[0].slice(
            0,
            spriteModeMapRulesLen,
          );
        }

        if (info.spriteModeMap && spriteModeMapRules[0]) {
          for (const key in info.spriteModeMap) {
            const modeMap = info.spriteModeMap[key];
            const baseSelector = key.split("_").join(".") + "";
            const baseRuleObj: Record<string, string[]> = {};
            for (const mapKey in modeMap) {
              if (mapKey !== "modes") {
                baseRuleObj[mapKey] = [JSON.stringify(modeMap[mapKey])];
              }
            }
            const moreRules: Array<{
              selector: string;
              obj: Record<string, string[]>;
            }> = [];
            if (modeMap.modes) {
              if (modeMap.modes["default"]) {
                baseRuleObj["textures"] = [`"${modeMap.modes["default"][0]}"`];
              }
              for (const mapKey in modeMap.modes) {
                if (mapKey !== "default") {
                  moreRules.push({
                    selector: baseSelector + "." + mapKey,
                    obj: {
                      textures: ["inherit", `"${modeMap.modes[mapKey][0]}"`],
                    },
                  });
                }
              }
              const spriteModeMapR = [
                { selector: baseSelector, obj: baseRuleObj },
              ].concat(moreRules);
              spriteModeMapRules[0] =
                spriteModeMapRules[0].concat(spriteModeMapR);
            }
          }
        }
        if (info.textureMap && textureMapRules[0]) {
          const textureMapR: Array<{
            selector: string;
            obj: Record<string, string[]>;
          }> = [];
          for (const key in info.textureMap) {
            const map = info.textureMap[key];
            textureMapR.push({
              selector: key + "",
              obj: oldTextureEntryToNew(map),
            });
          }

          for (const entry of textureMapR) {
            if (entry.obj["file"]) {
              let file = "";
              try {
                file = JSON.parse(entry.obj["file"][0] ?? '""') + "";
              } catch (e) {
                console.log("parse error", e, entry.obj["file"]);
              }

              const f = zip.file(`daudmod/${file}.png`);
              if (f) {
                promises.push(
                  f.async("arraybuffer").then((ab) => {
                    const key = entry.selector + "";
                    const arrayBufferView = new Uint8Array(ab);
                    const blob = new Blob([arrayBufferView], {
                      type: "image/png",
                    });
                    const urlCreator = window.URL;
                    const url = urlCreator.createObjectURL(blob);

                    if (key === "shield") {
                      entry.obj["flag"] = ["true"];
                    }

                    if (debug)
                      console.log(
                        `OLD textureMap.${key}.url: set to blob for file ${file},BLOB:${url}`,
                      );
                    entry.obj["url"] = [url];
                  }),
                );
              }
            }
          }
          textureMapRules[0] = textureMapRules[0].concat(textureMapR);
        }
        if (info.styles) {
          const currentThemeStyles = document.getElementById("theme-styles");
          if (currentThemeStyles) currentThemeStyles.replaceChildren();

          for (let i = 0; i < info.styles.length; i++) {
            const css = info.styles[i];
            const cssFile = zip.file(`daudmod/${css}`);
            if (cssFile) {
              promises.push(
                cssFile.async("string").then((ab) => {
                  const imagePromises: Promise<void>[] = [];
                  let cleansed = ab;
                  const images: string[] =
                    ab.match(/url\("\.\/?(.*?\.png)"\)/g) ?? [];
                  const fixed: string[] = [];
                  const fixedMap: string[] = [];
                  const replacePairs: [string, number][] = [];

                  for (let imagen = 0; imagen < images.length; imagen++) {
                    const imocc = images[imagen];
                    if (!imocc) continue;
                    const m = /url\("\.\/?(.*?\.png)"\)/g.exec(imocc);
                    const imgurl = (m && m[1] ? m[1] : "") + "";
                    if (debug) console.log(`theme css imagesss ${imgurl}`);
                    if (fixed.indexOf(imgurl) > 0) {
                      replacePairs.push([imocc, fixed.indexOf(imgurl)]);
                    } else {
                      fixed.push(imgurl);
                      fixedMap.push("");
                      replacePairs.push([imocc, fixed.indexOf(imgurl)]);
                      const imgFile = zip.file(`daudmod/${imgurl}`);
                      if (imgFile) {
                        imagePromises.push(
                          imgFile.async("arraybuffer").then((abData) => {
                            const arrayBufferView = new Uint8Array(abData);
                            const blob = new Blob([arrayBufferView], {
                              type: "image/png",
                            });
                            const urlCreator = window.URL;
                            const url = urlCreator.createObjectURL(blob);
                            fixedMap[fixed.indexOf(imgurl)] = url;

                            if (debug)
                              console.log(
                                `theme css image ${imgurl}: set to blob url ${url}`,
                              );
                          }),
                        );
                      }
                    }
                  }
                  Promise.all(imagePromises).then(() => {
                    for (let k = 0; k < replacePairs.length; k++) {
                      const pair = replacePairs[k];
                      if (!pair) continue;
                      cleansed = cleansed.replace(
                        pair[0],
                        "url(" + (fixedMap[pair[1]] ?? "") + ")",
                      );
                    }
                    const blob = new Blob([cleansed], { type: "text/css" });
                    const urlCreator = window.URL;
                    const url = urlCreator.createObjectURL(blob);

                    const linkEl = document.createElement("link");
                    linkEl.setAttribute("rel", "stylesheet");
                    linkEl.setAttribute("type", "text/css");
                    linkEl.setAttribute("href", url);

                    const themeStylesEl =
                      document.getElementById("theme-styles");
                    if (themeStylesEl) {
                      themeStylesEl.appendChild(linkEl);
                    }
                  });
                }),
              );
            }
          }
        }
        Promise.all(promises).then(() => {
          if (window.Game && window.Game.cache) {
            (<any>window).textureMapRules = textureMapRules;
            (<any>window).spriteModeMapRules = spriteModeMapRules;
            if (debug) console.log(`old theme loading complete`);
            textureCache.clear();
            window.Game.cache.refreshSprites();
            window.Game.reinitializeWorld();
          }
        });
      });
    }
  }
}
(<any>window).getTextureMapRules = function () {
  return textureMapRules;
};
(<any>window).getModeMapRules = function () {
  return spriteModeMapRules;
};
load();

// override settins from querystring values
const qs = new URLSearchParams(window.location.search);
if (qs.has("themeCustom")) Settings.themeCustom = qs.get("themeCustom") ?? "";
if (qs.has("leaderboardEnabled"))
  Settings.leaderboardEnabled = qs.get("leaderboardEnabled") === "true";
if (qs.has("hudEnabled")) Settings.hudEnabled = qs.get("hudEnabled") === "true";
if (qs.has("namesEnabled"))
  Settings.namesEnabled = qs.get("namesEnabled") === "true";
if (qs.has("bandwidth")) Settings.bandwidth = Number(qs.get("bandwidth"));

if (Settings.themeCustom) {
  theme(Settings.themeCustom);
} else if (Settings.theme) {
  theme(Settings.theme);
} // no good way to reset to default :(

const gear = document.getElementById("gear");
document.getElementById("settings")?.addEventListener("click", () => {
  gear?.classList.remove("closed");
});

document.getElementById("settingsCancel")?.addEventListener("click", () => {
  gear?.classList.add("closed");
});

document.getElementById("settingsSave")?.addEventListener("click", () => {
  save();
  load();
  gear?.classList.add("closed");
});

document.getElementById("settingsReset")?.addEventListener("click", () => {
  reset();
  window.location.reload();
});

let minimapChanged = false;
window.addEventListener("keydown", function (e) {
  if (
    e.keyCode == 77 &&
    !minimapChanged &&
    (document.body.classList.contains("alive") ||
      document.body.classList.contains("spectating"))
  ) {
    Settings.displayMinimap = !Settings.displayMinimap;
    minimapChanged = true;
  }
});

window.addEventListener("keyup", function (e) {
  if (e.keyCode == 77) minimapChanged = false;
});

keyboardHints();

function keyboardHints() {
  /*if (Settings.showKeyboardHints) {
        document.getElementById("minimapTip").style.display = "block";
        document.getElementById("autofireContainer").style.display = "block";
    } else {
        document.getElementById("minimapTip").style.display = "none";
        document.getElementById("autofireContainer").style.display = "none";
    }*/
}

shipBlue();

function shipBlue() {
  if (!Settings.allowDarkblueShips) {
    //spriteModeMap.ship_blue.modes.default = ["ship_cyan"];
    //spriteModeMap.ship_blue.modes.boost = ["thruster_cyan"];
    //spriteModeMap.bullet_blue.modes.default = ["bullet_cyan"];
  } else {
    //spriteModeMap.ship_blue.modes.default = ["ship_blue"];
    //spriteModeMap.ship_blue.modes.boost = ["thruster_blue"];
    //spriteModeMap.bullet_blue.modes.default = ["bullet_blue"];
  }
}
