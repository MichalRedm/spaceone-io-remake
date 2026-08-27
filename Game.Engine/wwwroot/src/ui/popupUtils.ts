import { fadeIn, fadeOut } from "./domUtils";

export type PopupName = "changelog" | "instructions" | "invalidArena";

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

export function pressPopup(popupPressed: PopupName): void {
  (window as any).popupShowing = true;
  const popupEl = getPopupElement(popupPressed);
  if (popupEl) {
    fadeIn(popupEl, 500);
  }
}

export function closePopup(popupPressed: PopupName): void {
  (window as any).popupShowing = false;
  const popupEl = getPopupElement(popupPressed);
  if (popupEl) {
    fadeOut(popupEl, 500);
  }
}

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
