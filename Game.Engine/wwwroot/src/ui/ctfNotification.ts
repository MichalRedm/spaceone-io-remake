/**
 * @file In-game notification banner for CTF match events (flag taken, team scored, victory).
 * @module ui/ctfNotification
 */

const NOTIFICATION_DISMISS_TRANSITION_MS = 250;

let dismissTimeout: ReturnType<typeof setTimeout> | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let lastAnnouncementTimestamp = 0;

export type CtfNotificationVariant = "cyan" | "red" | "gold" | "default";

/**
 * Displays an in-game notification banner for CTF events.
 *
 * @param text - Human-readable announcement text.
 * @param variant - Visual color variant matching the event team.
 * @param durationMs - Duration to display the banner in milliseconds.
 */
export function showCtfNotification(
  text: string,
  variant: CtfNotificationVariant = "default",
  durationMs = 3500,
): void {
  const elem = document.getElementById("ctf-notification");
  if (!elem) return;

  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeout = null;
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  elem.textContent = text;
  elem.classList.remove(
    "ctf-notification--cyan",
    "ctf-notification--red",
    "ctf-notification--gold",
    "ctf-notification--win",
  );

  if (variant === "cyan") {
    elem.classList.add("ctf-notification--cyan");
  } else if (variant === "red") {
    elem.classList.add("ctf-notification--red");
  } else if (variant === "gold") {
    elem.classList.add("ctf-notification--gold");
  }

  elem.hidden = false;
  elem.classList.remove("hide");
  // Force a reflow to ensure entrance transition plays smoothly
  void elem.offsetHeight;
  elem.classList.add("ctf-notification--visible");

  dismissTimeout = setTimeout(() => {
    elem.classList.remove("ctf-notification--visible");
    hideTimeout = setTimeout(() => {
      elem.hidden = true;
      elem.classList.add("hide");
      elem.textContent = "";
    }, NOTIFICATION_DISMISS_TRANSITION_MS);
  }, durationMs);
}

/**
 * Displays a high-priority server announcement and timestamps it to prevent redundant fallbacks.
 *
 * @param text - Announcement text.
 * @param variant - Visual color variant.
 * @param durationMs - Display duration in ms.
 */
export function showCtfAnnouncement(
  text: string,
  variant: CtfNotificationVariant = "default",
  durationMs = 3500,
): void {
  lastAnnouncementTimestamp = performance.now();
  showCtfNotification(text, variant, durationMs);
}

/**
 * Displays a state-transition notification unless a rich announcement recently arrived.
 *
 * @param text - State transition notification text.
 * @param variant - Visual color variant.
 * @param durationMs - Display duration in ms.
 */
export function showCtfStateNotification(
  text: string,
  variant: CtfNotificationVariant = "default",
  durationMs = 3500,
): void {
  if (performance.now() - lastAnnouncementTimestamp < 2000) {
    return;
  }
  showCtfNotification(text, variant, durationMs);
}

/**
 * Immediately clears and hides any active CTF notification banner.
 */
export function clearCtfNotification(): void {
  const elem = document.getElementById("ctf-notification");
  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeout = null;
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (elem) {
    elem.classList.remove("ctf-notification--visible");
    elem.hidden = true;
    elem.classList.add("hide");
    elem.textContent = "";
  }
}
