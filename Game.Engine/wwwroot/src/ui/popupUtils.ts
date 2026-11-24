/**
 * @file Modal dialog popup controller (changelog, instructions, invalid arena alert, worlds, settings).
 * @module ui/popupUtils
 */

import { fadeIn, fadeOut } from "./domUtils";
import { GameAudio } from "../audio/gameAudio";

/** Supported popup modal names. */
export type PopupName =
  "changelog" | "instructions" | "invalidArena" | "worlds" | "settings";

function isPopupOpen(popupEl: HTMLElement | null): boolean {
  if (!popupEl) return false;
  return !popupEl.hidden && popupEl.style.display !== "none";
}

/**
 * Attaches DOM click listeners to all modal popup trigger buttons and close actions.
 */
export function bootstrapPopups(): void {
  document
    .querySelectorAll(".change-log-button, #changelog-button")
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

  const worldSelectorBtn = document.getElementById("world-selector");
  if (worldSelectorBtn) {
    worldSelectorBtn.addEventListener("click", () => {
      pressPopup("worlds");
    });
    worldSelectorBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pressPopup("worlds");
      }
    });
  }

  const settingsToggleBtn = document.getElementById("settings-toggle");
  if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      GameAudio.onUiClick();
      pressPopup("settings");
    });
  }

  document
    .querySelectorAll("#changelog-close, #changelog-back")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        closePopup("changelog");
      });
    });

  document
    .querySelectorAll("#instructions-close, #instructions-back")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        closePopup("instructions");
      });
    });

  document
    .querySelectorAll(
      "#invalid-arena-close, #invalid-arena-back, #invalid-arena-ok",
    )
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        closePopup("invalidArena");
      });
    });

  document.querySelectorAll("#worlds-close, #worlds-back").forEach((btn) => {
    btn.addEventListener("click", () => {
      closePopup("worlds");
    });
  });

  document
    .querySelectorAll("#settings-close, #settings-back, #settings-done")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        GameAudio.onUiClick();
        closePopup("settings");
      });
    });

  const settingsCloseBtn = document.getElementById("settings-close");
  settingsCloseBtn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      GameAudio.onUiClick();
      closePopup("settings");
    }
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (isPopupOpen(getPopupElement("settings"))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closePopup("settings");
      }
    },
    true,
  );
}

/**
 * Opens a modal popup with a smooth 500ms fade-in transition.
 *
 * @param popupPressed - Target popup name.
 */
export function pressPopup(popupPressed: PopupName): void {
  window.popupShowing = true;
  const popupEl = getPopupElement(popupPressed);
  if (popupEl) {
    fadeIn(popupEl, 500);
  }
  window.dispatchEvent(
    new CustomEvent("spaceone:popup-opened", {
      detail: { popup: popupPressed },
    }),
  );
}

/**
 * Closes a modal popup with a smooth 500ms fade-out transition.
 *
 * @param popupPressed - Target popup name.
 */
export function closePopup(popupPressed: PopupName): void {
  window.popupShowing = false;
  const popupEl = getPopupElement(popupPressed);
  if (popupEl) {
    fadeOut(popupEl, 500);
  }
  window.dispatchEvent(
    new CustomEvent("spaceone:popup-closed", {
      detail: { popup: popupPressed },
    }),
  );
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
      return document.getElementById("popup-changelog");
    case "instructions":
      return document.getElementById("popup-instructions");
    case "invalidArena":
      return document.getElementById("popup-invalid-arena");
    case "worlds":
      return document.getElementById("popup-worlds");
    case "settings":
      return document.getElementById("popup-settings");
    default:
      return null;
  }
}
