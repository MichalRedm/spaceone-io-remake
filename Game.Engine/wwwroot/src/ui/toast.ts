/**
 * Toast Notification Module
 *
 * Provides Toastr-compatible error and status toast notifications with exact
 * visual parity to the original Spaceone.io client.
 */

let activeToastContainer: HTMLElement | null = null;
let activeToastElement: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Ensures the root toast container exists in the DOM at the bottom-left position.
 *
 * @returns The `#toast-container` element.
 */
function getOrCreateToastContainer(): HTMLElement {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-bottom-left";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  activeToastContainer = container;
  return container;
}

/**
 * Dismisses the active toast notification with a smooth fade-out transition.
 */
export function dismissToast(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  if (activeToastElement) {
    const el = activeToastElement;
    activeToastElement = null;
    el.style.transition = "opacity 300ms ease, transform 300ms ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => {
      el.remove();
      if (activeToastContainer && activeToastContainer.children.length === 0) {
        activeToastContainer.remove();
        activeToastContainer = null;
      }
    }, 300);
  }
}

/**
 * Displays a connection error toast notification matching original Spaceone.io fidelity.
 *
 * @param message - The error message text. Defaults to "Couldn't connect to an arena. Please try again".
 * @param durationMs - Time in milliseconds before automatically dismissing (default: 5000ms).
 */
export function showConnectionErrorToast(
  message = "Couldn't connect to an arena. Please try again",
  durationMs = 5000,
): void {
  const container = getOrCreateToastContainer();

  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  // If a toast already exists, update text and reset animation
  if (activeToastElement && activeToastElement.parentElement === container) {
    const messageDiv = activeToastElement.querySelector(".toast-message");
    if (messageDiv) {
      messageDiv.textContent = message;
    }
    activeToastElement.style.opacity = "0.85";
    activeToastElement.style.transform = "translateY(0)";
  } else {
    // Clear any stale toasts
    container.innerHTML = "";

    const toast = document.createElement("div");
    toast.className = "toast toast-error";
    toast.setAttribute("aria-live", "assertive");
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";

    const msg = document.createElement("div");
    msg.className = "toast-message";
    msg.textContent = message;
    toast.appendChild(msg);

    // Dismiss immediately on user click
    toast.addEventListener("click", () => {
      dismissToast();
    });

    container.appendChild(toast);
    activeToastElement = toast;

    // Trigger smooth fade-in
    requestAnimationFrame(() => {
      toast.style.transition = "opacity 300ms ease, transform 300ms ease";
      toast.style.opacity = "0.85";
      toast.style.transform = "translateY(0)";
    });
  }

  if (durationMs > 0) {
    dismissTimer = setTimeout(() => {
      dismissToast();
    }, durationMs);
  }
}
