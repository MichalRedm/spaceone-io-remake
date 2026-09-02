/**
 * @file Captain's Log history loader and notification controller.
 * @module ui/changelog
 */

import Cookies from "js-cookie";
import rawChangelogData from "../data/changelog.json";
import type { ChangelogEntry } from "../models/changelog";
import { formatChangelogDate } from "../models/changelog";

const changelogEntries: ChangelogEntry[] = rawChangelogData as ChangelogEntry[];

/**
 * Renders the preview teaser into the Captain's Log menu button (#changelog-button).
 *
 * @param button - Target anchor element for the changelog button.
 * @param latest - Most recent changelog entry.
 */
function renderButtonPreview(
  button: HTMLElement,
  latest?: ChangelogEntry,
): void {
  button.textContent = "";

  const title = document.createElement("h4");
  title.textContent = "CAPTAIN'S LOG";
  button.appendChild(title);

  if (!latest) {
    return;
  }

  const dateSpan = document.createElement("span");
  dateSpan.textContent = formatChangelogDate(latest.date);
  button.appendChild(dateSpan);
  button.appendChild(document.createElement("br"));

  const headline = latest.changes[0] ?? "";
  if (headline) {
    const changeSpan = document.createElement("span");
    changeSpan.textContent = `- ${headline}`;
    button.appendChild(changeSpan);
    button.appendChild(document.createElement("br"));
  }
}

/**
 * Populates the modal popup container (#changelog-modal-content) with the complete history.
 *
 * @param container - Target scrollable content element inside the changelog modal.
 * @param entries - Chronological list of changelog entries.
 */
function renderModalContent(
  container: HTMLElement,
  entries: ChangelogEntry[],
): void {
  container.textContent = "";

  entries.forEach((entry, index) => {
    const dateSpan = document.createElement("span");
    dateSpan.textContent = formatChangelogDate(entry.date);
    container.appendChild(dateSpan);
    container.appendChild(document.createElement("br"));

    entry.changes.forEach((change) => {
      const changeSpan = document.createElement("span");
      changeSpan.textContent = `- ${change}`;
      container.appendChild(changeSpan);
      container.appendChild(document.createElement("br"));
    });

    if (index < entries.length - 1) {
      container.appendChild(document.createElement("br"));
    }
  });
}

/**
 * Initializes the Captain's Log UI components:
 * - Populates the button preview snippet.
 * - Injects full history into the modal dialog.
 * - Synchronizes unread badges and cookie tracking.
 */
export function initChangelog(): void {
  const changelogButton = document.getElementById("changelog-button");
  const modalContent = document.getElementById("changelog-modal-content");
  const latestEntry = changelogEntries[0];

  if (changelogButton) {
    renderButtonPreview(changelogButton, latestEntry);
  }

  if (modalContent) {
    renderModalContent(modalContent, changelogEntries);
  }

  const settingsChangelog = document.getElementById("changelog");
  if (settingsChangelog && latestEntry) {
    const currentVersion = latestEntry.date;
    const lastVersion = Cookies.get("changelog");
    let open = false;

    if (lastVersion !== currentVersion) {
      Cookies.set("changelog", currentVersion, { expires: 300 });
      settingsChangelog.classList.add("new");
      open = true;
    }

    settingsChangelog.addEventListener("click", () => {
      if (open) {
        settingsChangelog.classList.remove("new");
      } else {
        settingsChangelog.classList.add("new");
      }
      open = !open;
    });
  }
}

initChangelog();
