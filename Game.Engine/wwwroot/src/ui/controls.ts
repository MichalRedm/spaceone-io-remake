import Cookies from "js-cookie";
import nipplejs from "nipplejs";
import { Settings } from "./settings";
import { Ship } from "../models/ship";
import { fadeIn } from "./domUtils";
const DEFAULT_EMOJIS = [
  "👋",
  "🚀",
  "🔥",
  "💥",
  "⚡",
  "👑",
  "💀",
  "👽",
  "👾",
  "🛸",
  "🎯",
  "🛡️",
  "💎",
  "🌟",
  "⚔️",
  "🏆",
  "🤖",
  "🎃",
  "👻",
  "🍕",
  "🍔",
  "🐱",
  "🐶",
  "🦄",
  "🐉",
  "💯",
  "🏴‍☠️",
  "🎮",
  "🕹️",
  "⚓",
  "🚩",
  "🦾",
  "🩸",
  "✨",
  "💣",
  "🕶️",
  "😈",
  "🤠",
  "🥳",
  "🤩",
  "😎",
  "😱",
  "🥶",
  "🥵",
  "🤯",
  "💫",
  "❤️",
  "👍",
  "👎",
  "💩",
  "🧠",
  "👀",
  "💪",
  "🌈",
  "⭐",
  "🎉",
  "🍿",
  "☕",
  "🍺",
  "🧊",
];

const emojiContainer = document.getElementById("emoji-container");
const emojiTrigger = document.getElementById("emoji-trigger");

if (emojiContainer) {
  const panel = document.createElement("div");
  panel.className = "emoji-picker-panel";

  const grid = document.createElement("div");
  grid.className = "emoji-grid";

  for (const emoji of DEFAULT_EMOJIS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-item";
    btn.innerText = emoji;
    btn.title = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      Cookies.set("emoji", emoji);
      if (emojiTrigger) emojiTrigger.innerText = emoji;
      Controls.emoji = emoji;
      emojiContainer.classList.remove("open");
    });
    grid.appendChild(btn);
  }

  panel.appendChild(grid);
  emojiContainer.replaceChildren(panel);
}

if (emojiTrigger && emojiContainer) {
  emojiTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    emojiContainer.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (
      !emojiContainer.contains(e.target as Node) &&
      e.target !== emojiTrigger
    ) {
      emojiContainer.classList.remove("open");
    }
  });
}

const secretShips = ["ship_secret", "ship_zed"];

const autofCon = document.getElementById("autofireContainer");
const autofTgg = document.getElementById("autofireToggle");
const selector = document.getElementById("shipSelectorSwitch");
var colors = [
  "ship_blue",
  "ship_cyan",
  "ship_green",
  "ship_yellow",
  "ship_orange",
  "ship_red",
  "ship_pink",
]; // to fix secret ships bug

const nippleZone = document.getElementById("nipple-zone");
export const nipple = nippleZone
  ? nipplejs.create({
      zone: nippleZone,
      restJoystick: false,
    })
  : (null as any);
const isMobile = "ontouchstart" in document.documentElement;
if (!isMobile && nipple) {
  nipple.destroy();
  const nc = document.getElementById("nipple-controls");
  if (nc) nc.style.display = "none";
}

const shipSelectorSwitch = document.getElementById("shipSelectorSwitch");

const refreshSelectedStyle = function () {
  const switchEl = document.getElementById("shipSelectorSwitch");
  const container = document.getElementById("selection-container");
  if (!switchEl) return;
  const options = Array.from(switchEl.children) as HTMLElement[];

  const isOdd = colors.length % 2 !== 0;
  if (container) {
    if (colors.length >= 7) {
      container.style.maxWidth = "854px";
    } else {
      const targetWidth = Math.min(
        854,
        Math.max(380, colors.length * 84 + 266),
      );
      container.style.maxWidth = `${targetWidth}px`;
    }
  }

  let selectedEl: HTMLElement | null = null;
  for (const option of options) {
    if (option.getAttribute("data-color") === Controls.ship) {
      option.classList.add("selected");
      selectedEl = option;
    } else {
      option.classList.remove("selected");
    }
  }

  const selectionIndicator = document.getElementById("selection");
  if (selectionIndicator) {
    if (isOdd) {
      selectionIndicator.style.transform = "translateX(0px)";
    } else if (selectedEl) {
      const switchRect = switchEl.getBoundingClientRect();
      const selectedRect = selectedEl.getBoundingClientRect();
      if (switchRect.width > 0 && selectedRect.width > 0) {
        const offset =
          selectedRect.left +
          selectedRect.width / 2 -
          (switchRect.left + switchRect.width / 2);
        selectionIndicator.style.transform = `translateX(${Math.round(offset)}px)`;
      } else {
        const selectedIdx = colors.indexOf(Controls.ship);
        const offset = (selectedIdx - (colors.length - 1) / 2) * 84;
        selectionIndicator.style.transform = `translateX(${Math.round(offset)}px)`;
      }
    }
  }

  Controls.addSecretShips(window.discordData);
};

window.addEventListener("resize", () => {
  refreshSelectedStyle();
});

const leftArrow = document.getElementById("left-arrow");
if (leftArrow) {
  leftArrow.addEventListener("click", function () {
    if (colors.length === 0) return;
    const isOdd = colors.length % 2 !== 0;
    if (isOdd) {
      const centerIdx = Math.floor(colors.length / 2);
      const prevIdx = (centerIdx - 1 + colors.length) % colors.length;
      Controls.ship = colors[prevIdx];
      drawColorSelector();
    } else {
      const curIdx = colors.indexOf(Controls.ship);
      const prevIdx = (curIdx - 1 + colors.length) % colors.length;
      Controls.ship = colors[prevIdx] ?? colors[0];
      refreshSelectedStyle();
      save();
    }
  });
}

const rightArrow = document.getElementById("right-arrow");
if (rightArrow) {
  rightArrow.addEventListener("click", function () {
    if (colors.length === 0) return;
    const isOdd = colors.length % 2 !== 0;
    if (isOdd) {
      const centerIdx = Math.floor(colors.length / 2);
      const nextIdx = (centerIdx + 1) % colors.length;
      Controls.ship = colors[nextIdx];
      drawColorSelector();
    } else {
      const curIdx = colors.indexOf(Controls.ship);
      const nextIdx = (curIdx + 1) % colors.length;
      Controls.ship = colors[nextIdx] ?? colors[0];
      refreshSelectedStyle();
      save();
    }
  });
}

const nick: HTMLInputElement | null = document.querySelector("#nick");
if (nick) {
  nick.addEventListener("input", (e) => {
    Controls.nick = nick.value;
    if (Controls && Controls.canvas) Controls.canvas.focus();
    save();
  });
}

function unicode(e: string): string {
  return e
    .split("-")
    .reduce(
      (total: string, x: string) =>
        total + (getUnicodeCharacter(parseInt(x, 16)) || ""),
      "",
    );
}
function getUnicodeCharacter(cp: number): string {
  if ((cp >= 0 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xffff)) {
    return String.fromCharCode(cp);
  } else if (cp >= 0x10000 && cp <= 0x10ffff) {
    // we substract 0x10000 from cp to get a 20-bits number
    // in the range 0..0xFFFF
    cp -= 0x10000;

    // we add 0xD800 to the number formed by the first 10 bits
    // to give the first byte
    const first = ((0xffc00 & cp) >> 10) + 0xd800;

    // we add 0xDC00 to the number formed by the low 10 bits
    // to give the second byte
    const second = (0x3ff & cp) + 0xdc00;

    return String.fromCharCode(first) + String.fromCharCode(second);
  }
  return "";
}

export interface ControlsType {
  emoji: string;
  nick: string;
  left: boolean;
  up: boolean;
  right: boolean;
  down: boolean;
  numUp: boolean;
  numUpRight: boolean;
  numRight: boolean;
  numDownRight: boolean;
  numDown: boolean;
  numDownLeft: boolean;
  numLeft: boolean;
  numUpLeft: boolean;
  boost: boolean;
  shoot: boolean;
  autofire: boolean;
  downSince: number | false;
  customData: any;
  mouseX: number;
  mouseY: number;
  angle: number;
  canvas: HTMLCanvasElement | null;
  color: string | null;
  ship: string;
  registerCanvas(canvas: HTMLCanvasElement): void;
  initializeWorld(world?: any): void;
  addSecretShips(discord?: any): void;
}

export const Controls: ControlsType = {
  emoji: "👋",
  nick: "",
  left: false,
  up: false,
  right: false,
  down: false,
  numUp: false,
  numUpRight: false,
  numRight: false,
  numDownRight: false,
  numDown: false,
  numDownLeft: false,
  numLeft: false,
  numUpLeft: false,
  boost: false,
  shoot: false,
  autofire: false,
  downSince: false,
  customData: false,
  mouseX: 0,
  mouseY: 0,
  angle: 0,
  canvas: null,
  color: null,
  ship: "ship_green",

  registerCanvas(canvas: HTMLCanvasElement): void {
    const getMousePos = (
      c: HTMLCanvasElement,
      { clientX, clientY }: MouseEvent,
    ) => {
      const rect = c.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };
    if (isMobile && nipple) {
      nipple.on("move", (_e: any, { angle, force }: any) => {
        Controls.angle = angle.radian;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        Controls.mouseX =
          Math.cos(angle.radian) * force * window.innerHeight + cx;
        Controls.mouseY =
          Math.sin(-angle.radian) * force * window.innerHeight + cy;
      });
      document.getElementById("shoot")?.addEventListener("touchstart", () => {
        Controls.shoot = true;
      });
      document.getElementById("shoot")?.addEventListener("touchend", () => {
        if (!Controls.autofire) {
          Controls.shoot = false;
        }
      });
      document.getElementById("boost")?.addEventListener("touchstart", () => {
        Controls.boost = true;
      });
      document.getElementById("boost")?.addEventListener("touchend", () => {
        Controls.boost = false;
      });
    } else {
      window.addEventListener("mousemove", (e) => {
        const pos = getMousePos(canvas, e);
        Controls.mouseX = pos.x;
        Controls.mouseY = pos.y;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const dy = pos.y - cy;
        const dx = pos.x - cx;

        Controls.angle = Math.atan2(dy, dx);
      });
      window.addEventListener("mousedown", ({ button }) => {
        if (button === 2)
          // right click
          Controls.boost = true;
        else {
          if (Settings.mouseOneButton > 0) {
            Controls.downSince = new Date().getTime();
          } else {
            Controls.shoot = true;
          }
        }
      });

      window.addEventListener("mouseup", ({ button }) => {
        if (button === 2)
          // right click
          Controls.boost = false;
        else {
          if (Settings.mouseOneButton > 0) {
            const timeDelta =
              Controls.downSince !== false
                ? new Date().getTime() - Controls.downSince
                : 0;
            Controls.downSince = false;
            if (timeDelta < Settings.mouseOneButton) {
              Controls.shoot = true;
              setTimeout(function () {
                if (!Controls.autofire) {
                  Controls.shoot = false;
                }
              }, 100);
            } else {
              Controls.boost = true;
              setTimeout(function () {
                Controls.boost = false;
              }, 100);
            }
          } else {
            if (!Controls.autofire) {
              Controls.shoot = false;
            }
          }
        }
      });
      document
        .getElementById("gameArea")
        ?.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          return false;
        });
    }
    Controls.canvas = canvas;
  },

  initializeWorld: function (world?: any): void {
    const allowed = world?.allowedColors ?? world?.AllowedColors;
    if (Array.isArray(allowed) && allowed.length > 0) {
      colors = shuffle([...allowed]);
    } else {
      colors = shuffle([
        "ship_blue",
        "ship_cyan",
        "ship_green",
        "ship_yellow",
        "ship_orange",
        "ship_red",
        "ship_pink",
      ]);
    }
    const centerIdx = Math.floor(colors.length / 2);
    if (!colors.includes(Controls.ship)) {
      Controls.ship = colors[centerIdx] ?? colors[0] ?? "ship_green";
    }
    drawColorSelector();
  },

  addSecretShips: function (discord?: any): void {
    try {
      if (discord && discord.data && discord.data.roles) {
        if (discord.data.roles.includes("Player")) {
          if (shipSelectorSwitch) {
            const ship = shipSelectorSwitch.querySelector(
              "[data-color=ship_secret]",
            );
            if (ship) (ship as HTMLElement).style.display = "inline-block";
          }
        }
        if (discord.data.roles.includes("Old Guard")) {
          if (shipSelectorSwitch) {
            const ship = shipSelectorSwitch.querySelector(
              "[data-color=ship_zed]",
            );
            if (ship) (ship as HTMLElement).style.display = "inline-block";
          }
        }
      }
    } catch (e) {
      console.log("error adding secret ships", e);
    }
  },
};

window.addEventListener(
  "keydown",
  ({ keyCode }) => {
    switch (keyCode) {
      case 37: // left arrow
        Controls.left = true;
        break;
      case 38: // up arrow
        Controls.up = true;
        break;
      case 39: // right arrow
        Controls.right = true;
        break;
      case 40: // down arrow
        Controls.down = true;
        break;
      case 104: // numpad 8
        Controls.numUp = true;
        break;
      case 105: // numpad 9
        Controls.numUpRight = true;
        break;
      case 102: // numpad 6
        Controls.numRight = true;
        break;
      case 99: // numpad 3
        Controls.numDownRight = true;
        break;
      case 98: // numpad 2
        Controls.numDown = true;
        break;
      case 97: // numpad 1
        Controls.numDownLeft = true;
        break;
      case 100: // numpad 4
        Controls.numLeft = true;
        break;
      case 103: // numpad 7
        Controls.numUpLeft = true;
        break;
      case 83: // s
        Controls.boost = true;
        break;
      case 32: // space
        Controls.shoot = true;
        break;
      case 69: // e
        // Autofire
        if (!document.body.classList.contains("alive")) {
          break;
        } else if (!Controls.autofire) {
          Controls.autofire = true;
          Controls.shoot = true;
          if (autofTgg) autofTgg.textContent = "ON";
          if (autofCon) autofCon.style.color = "#fff";
          console.log("Autofire enabled!");
        } else {
          Controls.autofire = false;
          Controls.shoot = false;
          if (autofTgg) autofTgg.textContent = "OFF";
          if (autofCon) autofCon.style.color = "";
          console.log("Autofire disabled!");
        }
        break;
    }
  },
  false,
);

window.addEventListener(
  "keyup",
  ({ keyCode }) => {
    switch (keyCode) {
      case 37: // left arrow
        Controls.left = false;
        break;
      case 38: // up arrow
        Controls.up = false;
        break;
      case 39: // right arrow
        Controls.right = false;
        break;
      case 40: // down arrow
        Controls.down = false;
        break;
      case 104: // numpad 8
        Controls.numUp = false;
        break;
      case 105: // numpad 9
        Controls.numUpRight = false;
        break;
      case 102: // numpad 6
        Controls.numRight = false;
        break;
      case 99: // numpad 3
        Controls.numDownRight = false;
        break;
      case 98: // numpad 2
        Controls.numDown = false;
        break;
      case 97: // numpad 1
        Controls.numDownLeft = false;
        break;
      case 100: // numpad 4
        Controls.numLeft = false;
        break;
      case 103: // numpad 7
        Controls.numUpLeft = false;
        break;
      case 83: // s
        Controls.boost = false;
        break;
      case 32: // space
        if (!Controls.autofire) {
          Controls.shoot = false;
        }
        break;
    }
  },
  false,
);

function save() {
  const cookieOptions = { expires: 300 };

  if (Controls.nick) Cookies.set("nick", Controls.nick, cookieOptions);
  if (Controls.ship) Cookies.set("ship", Controls.ship, cookieOptions);
  if (Controls.color) Cookies.set("color", Controls.color, cookieOptions);
}

const savedNick = Cookies.get("nick");
const savedColor = Cookies.get("ship") || Cookies.get("color");
const savedEmoji = Cookies.get("emoji");

if (savedNick !== undefined) {
  Controls.nick = savedNick;
  if (nick) nick.value = savedNick;
}

if (savedColor !== undefined && colors.includes(savedColor)) {
  Controls.color = savedColor;
  Controls.ship = savedColor;
  refreshSelectedStyle();
}

if (savedEmoji !== undefined) {
  Controls.emoji = savedEmoji;
  if (emojiTrigger) emojiTrigger.innerText = savedEmoji;
}

function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length,
    temporaryValue: T,
    randomIndex: number;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    const currentElem = array[currentIndex];
    const randomElem = array[randomIndex];
    if (currentElem !== undefined && randomElem !== undefined) {
      temporaryValue = currentElem;
      array[currentIndex] = randomElem;
      array[randomIndex] = temporaryValue;
    }
  }

  return array;
}

export function waitForShipSelectorImages(): Promise<void> {
  const switchEl = document.getElementById("shipSelectorSwitch");
  if (!switchEl) return Promise.resolve();
  const imgElements = Array.from(switchEl.querySelectorAll("img"));
  if (imgElements.length === 0) return Promise.resolve();

  return Promise.all(
    imgElements.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        if ("decode" in img && typeof img.decode === "function") {
          img
            .decode()
            .then(() => resolve())
            .catch(() => resolve());
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      });
    }),
  ).then(() => {});
}

let uiFadedIn = false;
export function fadeInUI(duration = 500): void {
  if (uiFadedIn) return;
  uiFadedIn = true;
  fadeIn(".visibility", duration);
  fadeIn(".visibility4", duration);
}

function drawColorSelector() {
  if (colors.length === 0) return;
  const isOdd = colors.length % 2 !== 0;

  if (isOdd) {
    const centerIdx = Math.floor(colors.length / 2);
    if (!colors.includes(Controls.ship)) {
      Controls.ship = colors[centerIdx] ?? "ship_green";
    }

    let safety = 0;
    while (colors[centerIdx] !== Controls.ship && safety < colors.length) {
      colors.push(colors[0]);
      colors.shift();
      safety++;
    }
  } else {
    if (!colors.includes(Controls.ship)) {
      Controls.ship = colors[0] ?? "ship_green";
    }
  }

  const switchEl = document.getElementById("shipSelectorSwitch") || selector;
  if (!switchEl) return;

  while (switchEl.firstChild) switchEl.removeChild(switchEl.firstChild);

  for (let i = 0; i < colors.length; i++) {
    const selectorImage = Ship.getSelectorImage(colors[i]);

    if (selectorImage) {
      switchEl.appendChild(selectorImage);
      selectorImage.setAttribute("data-color", colors[i]);
      if (secretShips.includes(colors[i])) {
        selectorImage.style.display = "none";
      }
    }
  }

  document.querySelectorAll("#shipSelectorSwitch img").forEach((img) => {
    img.addEventListener("click", function (this: HTMLImageElement) {
      const chosen = this.getAttribute("data-color");
      if (chosen) {
        Controls.ship = chosen;
        if (isOdd) {
          drawColorSelector();
        } else {
          refreshSelectedStyle();
          save();
        }
      }
    });
  });

  save();
  requestAnimationFrame(() => {
    refreshSelectedStyle();
  });
}

function initShipSelectorAndFadeIn(): void {
  drawColorSelector();
  waitForShipSelectorImages()
    .then(() => fadeInUI(500))
    .catch(() => fadeInUI(500));

  setTimeout(() => {
    fadeInUI(500);
  }, 250);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initShipSelectorAndFadeIn();
  });
} else {
  initShipSelectorAndFadeIn();
}

document
  .getElementById("fullscreenButton")
  ?.addEventListener("click", toggleFullscreen);

function toggleFullscreen() {
  if (window.innerHeight == screen.height) {
    closeFullscreen();
  } else {
    openFullscreen();
  }
}

var elem = document.documentElement;

function openFullscreen() {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.mozRequestFullScreen) {
    /* Firefox */
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) {
    /* Chrome, Safari & Opera */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    /* IE/Edge */
    elem.msRequestFullscreen();
  }
}

function closeFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

const clockEl = document.getElementById("clock");
var d = new Date(),
  n = d.toLocaleTimeString();
if (clockEl) clockEl.textContent = n;

setTimeout(function () {
  setInterval(function () {
    d = new Date();
    n = d.toLocaleTimeString();
    if (clockEl) clockEl.textContent = n;
  }, 1000);
}, 1000 - d.getMilliseconds());
