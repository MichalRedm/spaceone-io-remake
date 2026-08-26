import Cookies from "js-cookie";
import nipplejs from "nipplejs";
import { Settings } from "./settings";
import { Ship } from "./models/ship";
import "emoji-mart/css/emoji-mart.css";
import { Picker } from "emoji-mart";
import React from "react";
import ReactDOM from "react-dom";

const emojiContainer = document.getElementById("emoji-container");
if (emojiContainer) {
  ReactDOM.render(
    React.createElement(
      Picker,
      {
        native: true,
        title: "",
        emoji: "rocket",
        onClick: (e: any) => {
          console.log(e);
          Cookies.set("emoji", e.native);
          var x = e.native;
          if (emojiTrigger) emojiTrigger.innerText = e.native;

          Controls.emoji = x;
          console.log(Controls.emoji);
          emojiContainer.classList.remove("open");
        },
      },
      null,
    ),
    emojiContainer,
  );
}

const secretShips = ["ship_secret", "ship_zed"];

const autofCon = document.getElementById("autofireContainer");
const autofTgg = document.getElementById("autofireToggle");
const emojiTrigger = document.getElementById("emoji-trigger");
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

if (emojiTrigger && emojiContainer) {
  emojiTrigger.addEventListener("click", () => {
    emojiContainer.classList.toggle("open");
  });
}

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
  if (!switchEl) return;
  const options = Array.from(switchEl.children);

  for (const option of options) {
    if (option.getAttribute("data-color") == Controls.ship)
      option.classList.add("selected");
    else option.classList.remove("selected");
  }

  Controls.addSecretShips(window.discordData);
};

const leftArrow = document.getElementById("left-arrow");
if (leftArrow) {
  leftArrow.addEventListener("click", function () {
    Controls.ship = colors[2];
    drawColorSelector();
  });
}

const rightArrow = document.getElementById("right-arrow");
if (rightArrow) {
  rightArrow.addEventListener("click", function () {
    Controls.ship = colors[4];
    drawColorSelector();
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

function unicode(e) {
  return e
    .split("-")
    .reduce((total, x) => total + getUnicodeCharacter(parseInt(x, 16)), "");
}
function getUnicodeCharacter(cp) {
  if ((cp >= 0 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xffff)) {
    return String.fromCharCode(cp);
  } else if (cp >= 0x10000 && cp <= 0x10ffff) {
    // we substract 0x10000 from cp to get a 20-bits number
    // in the range 0..0xFFFF
    cp -= 0x10000;

    // we add 0xD800 to the number formed by the first 10 bits
    // to give the first byte
    var first = ((0xffc00 & cp) >> 10) + 0xd800;

    // we add 0xDC00 to the number formed by the low 10 bits
    // to give the second byte
    var second = (0x3ff & cp) + 0xdc00;

    return String.fromCharCode(first) + String.fromCharCode(second);
  }
}
export var Controls = {
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
  downSince: null,
  customData: false,
  mouseX: 0,
  mouseY: 0,
  angle: 0,
  canvas: null,
  color: null,
  registerCanvas(canvas) {
    const getMousePos = (canvas, { clientX, clientY }) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };
    if (isMobile) {
      nipple.on("move", (e, { angle, force }) => {
        Controls.angle = angle.radian;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        Controls.mouseX =
          Math.cos(angle.radian) * force * window.innerHeight + cx;
        Controls.mouseY =
          Math.sin(-angle.radian) * force * window.innerHeight + cy;
      });
      document.getElementById("shoot").addEventListener("touchstart", (e) => {
        Controls.shoot = true;
      });
      document.getElementById("shoot").addEventListener("touchend", (e) => {
        if (!Controls.autofire) {
          Controls.shoot = false;
        }
      });
      document.getElementById("boost").addEventListener("touchstart", (e) => {
        Controls.boost = true;
      });
      document.getElementById("boost").addEventListener("touchend", (e) => {
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
        if (button == 2)
          //right click
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
        if (button == 2)
          //right click
          Controls.boost = false;
        else {
          if (Settings.mouseOneButton > 0) {
            const timeDelta = new Date().getTime() - Controls.downSince;
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
          } else if (!Controls.autofire) {
            Controls.shoot = false;
          }
        }
      });
      document
        .getElementById("gameArea")
        .addEventListener("contextmenu", (e) => {
          e.preventDefault();
          return false;
        });
    }
    Controls.canvas = canvas;
  },
  initializeWorld: function (world) {
    colors = shuffle(colors); // shuffle(world.allowedColors); - ignored for secret ships bug fix
    Controls.ship = colors[3];
    drawColorSelector();
  },
  ship: "ship_green",

  addSecretShips: function (discord) {
    try {
      if (discord && discord.data && discord.data.roles) {
        if (discord.data.roles.includes("Player")) {
          if (shipSelectorSwitch) {
            var ship = shipSelectorSwitch.querySelector(
              "[data-color=ship_secret]",
            );
            if (ship) (<any>ship).style.display = "inline-block";
          }
        }
        if (discord.data.roles.includes("Old Guard")) {
          if (shipSelectorSwitch) {
            var ship = shipSelectorSwitch.querySelector(
              "[data-color=ship_zed]",
            );
            if (ship) (<any>ship).style.display = "inline-block";
          }
        }
      }
    } catch (e) {
      console.log("exception in addSecretShips: ", e);
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

if (savedNick != undefined) {
  Controls.nick = savedNick;
  nick.value = savedNick;
}

if (savedColor != undefined && colors.includes(savedColor)) {
  Controls.color = savedColor;
  Controls.ship = savedColor;
  refreshSelectedStyle();
}

if (savedEmoji != undefined) {
  Controls.emoji = savedEmoji;
  emojiTrigger.innerText = savedEmoji;
}

function shuffle(array) {
  var currentIndex = array.length,
    temporaryValue,
    randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
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
  if (typeof $ !== "undefined") {
    $(".visibility").fadeIn(duration);
    $(".visibility4").fadeIn(duration);
  }
}

function drawColorSelector() {
  if (!colors.includes(Controls.ship)) {
    Controls.ship = colors[3] ?? "ship_green";
  }

  let safety = 0;
  while (colors[3] !== Controls.ship && safety < colors.length) {
    colors.push(colors[0]);
    colors.shift();
    safety++;
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

  $("#shipSelectorSwitch img").click(function () {
    Controls.ship = $(this).attr("data-color");
    drawColorSelector();
  });

  save();
  refreshSelectedStyle();
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
  .addEventListener("click", toggleFullscreen);

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
