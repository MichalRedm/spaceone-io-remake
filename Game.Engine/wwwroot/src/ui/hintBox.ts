/**
 * @file Rotating controls hint box ticker for beginner players.
 * @module ui/hintBox
 */

import { Settings } from "./settings";
import { fadeIn, fadeOut } from "./domUtils";

const texts = [
  "MOVE MOUSE to steer fleet",
  "CLICK or SPACE to shoot",
  "'S' to Split & Dash",
];

let index = 0;

window.setInterval(() => {
  const hintText = document.getElementById("instructions-text");
  if (hintText) {
    fadeOut(hintText, 300, () => {
      hintText.textContent = texts[index % texts.length] ?? "";
      fadeIn(hintText, 300);
    });
  }

  index++;
}, 6000);
