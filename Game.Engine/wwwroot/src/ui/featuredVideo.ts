/**
 * @file Localized featured YouTube gameplay video embed in main menu.
 * @module ui/featuredVideo
 */

/**
 * Initializes the localized featured YouTube gameplay video in the main menu.
 *
 * @remarks
 * Selects a gameplay showcase video matching the user's browser language (`de`, `es`, or fallback English),
 * dynamically mounts an `<iframe>`, and attaches it inside `#player`.
 */
export function initFeaturedVideo(): void {
  const featuredVideosIDs: string[] = [
    "VEqF-15QaHw",
    "C5tp00l_3Is",
    "LPutbtJ2UVM",
    "uiSH-T8jRds",
  ];

  if (/^de\b/.test(navigator.language)) {
    featuredVideosIDs.push("JTHTjTC9-kw");
  } else if (/^es\b/.test(navigator.language)) {
    featuredVideosIDs.push("6OYueeto_6o");
  }

  const index = Math.floor(featuredVideosIDs.length * Math.random());
  const selectedId = featuredVideosIDs[index];
  if (!selectedId) return;

  const playerEl = document.getElementById("player");
  if (playerEl) {
    const iframe = document.createElement("iframe");
    iframe.id = "playerIframe";
    iframe.width = "336";
    iframe.height = "189";
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(selectedId)}`;
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture",
    );
    iframe.allowFullscreen = true;

    playerEl.replaceChildren(iframe);
  }
}
