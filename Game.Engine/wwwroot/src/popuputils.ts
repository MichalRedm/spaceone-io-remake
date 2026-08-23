export type PopupName = "changelog" | "instructions";

export function bootstrapPopups(): void {
  $(".change-log-button").on("click", function () {
    pressPopup("changelog");
  });

  $("#instructions").on("click", function () {
    pressPopup("instructions");
  });

  $("#changelogClose").on("click", function () {
    closePopup("changelog");
  });

  $("#instructionsClose").on("click", function () {
    closePopup("instructions");
  });

  $("#changelogBack").on("click", function () {
    closePopup("changelog");
  });

  $("#instructionsBack").on("click", function () {
    closePopup("instructions");
  });
}

export function pressPopup(popupPressed: PopupName): void {
  window.popupShowing = true;
  const popupToFadeIn = sortPopup(popupPressed);
  if (popupToFadeIn) {
    $(popupToFadeIn).fadeIn(500);
  }
}

export function closePopup(popupPressed: PopupName): void {
  window.popupShowing = false;
  const popupToFadeOut = sortPopup(popupPressed);
  if (popupToFadeOut) {
    $(popupToFadeOut).fadeOut(500);
  }
}

export function sortPopup(popupPressed: PopupName): any {
  switch (popupPressed) {
    case "changelog":
      return $("#popupChangelog");
    case "instructions":
      return $("#popupInstructions");
    default:
      return null;
  }
}
