/**
 * @file Modal dialog popup controller (changelog, instructions, invalid arena alert).
 * @module ui/popupUtils
 */

import { fadeIn, fadeOut } from "./domUtils";

/** Supported popup modal names. */
export type PopupName = "changelog" | "instructions" | "invalidArena";

/**
 * Attaches DOM click listeners to all modal popup trigger buttons and close actions.
 */
export function bootstrapPopups(): void {
  document
    .querySelectorAll(".change-log-button, #changelogButton")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        pressPopup("changelog");
      });
    });

  const instructionsBtn = document.getElementById("instructions");
  if (instructionsBtn) {
    instructionsBtn.addEventListener("click", () => {
      pressPopup("instructions");
    });
  }

  document
    .querySelectorAll("#changelogClose, #changelogBack")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        closePopup("changelog");
      });
    });

  document
    .querySelectorAll("#instructionsClose, #instructionsBack")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        closePopup("instructions");
      });
    });

  document
    .querySelectorAll("#invalidArenaClose, #invalidArenaBack, #invalidArenaOk")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        closePopup("invalidArena");
      });
    });
}

/**
 * Opens a modal popup with a smooth 500ms fade-in transition.
 *
 * @param popupPressed - Target popup name.
 */
export function pressPopup(popupPressed: PopupName): void {
  (window as any).popupShowing = true;
  const popupEl = getPopupElement(popupPressed);
  if (popupEl) {
    fadeIn(popupEl, 500);
  }
}

/**
 * Closes a modal popup with a smooth 500ms fade-out transition.
 *
 * @param popupPressed - Target popup name.
 */
export function closePopup(popupPressed: PopupName): void {
  (window as any).popupShowing = false;
  const popupEl = getPopupElement(popupPressed);
  if (popupEl) {
    fadeOut(popupEl, 500);
  }
}

/**
 * Resolves the DOM root element for a specified modal popup.
 *
 * @param popupPressed - Popup name.
 * @returns Modal HTML element or `null` if not found.
 */
export function getPopupElement(popupPressed: PopupName): HTMLElement | null {
  switch (popupPressed) {
    case "changelog":
      return document.getElementById("popupChangelog");
    case "instructions":
      return document.getElementById("popupInstructions");
    case "invalidArena":
      return document.getElementById("popupInvalidArena");
    default:
      return null;
  }
}
