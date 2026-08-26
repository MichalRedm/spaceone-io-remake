/**
 * Resolves element(s) from a selector, element, or NodeList.
 */
function resolveElements(
  target: HTMLElement | string | NodeListOf<HTMLElement> | null | undefined,
): HTMLElement[] {
  if (!target) return [];
  if (typeof target === "string") {
    return Array.from(document.querySelectorAll<HTMLElement>(target));
  }
  if (
    "length" in target &&
    typeof (target as NodeListOf<HTMLElement>).item === "function"
  ) {
    return Array.from(target as NodeListOf<HTMLElement>);
  }
  return [target as HTMLElement];
}

/**
 * Determines the target display property for an element when making it visible.
 */
function getTargetDisplay(el: HTMLElement, defaultDisplay = "block"): string {
  if (el.dataset.originalDisplay && el.dataset.originalDisplay !== "none") {
    return el.dataset.originalDisplay;
  }
  if (el.style.display && el.style.display !== "none") {
    return el.style.display;
  }
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const match = styleAttr.match(/(?:^|;|\s)display\s*:\s*([^;]+)/i);
    if (match && match[1] && match[1].trim() !== "none") {
      return match[1].trim();
    }
  }
  const tagName = el.tagName.toLowerCase();
  if (tagName === "span" || tagName === "img" || tagName === "a") {
    return "inline-block";
  }
  if (tagName === "table") {
    return "table";
  }
  if (tagName === "tr") {
    return "table-row";
  }
  if (tagName === "td" || tagName === "th") {
    return "table-cell";
  }
  return defaultDisplay;
}

/**
 * Fades in element(s) smoothly via CSS opacity transition.
 */
export function fadeIn(
  target: HTMLElement | string | NodeListOf<HTMLElement> | null | undefined,
  duration = 300,
  callback?: () => void,
): void {
  const elements = resolveElements(target);
  if (elements.length === 0) return;

  for (const el of elements) {
    const targetDisplay = getTargetDisplay(el);
    el.style.display = targetDisplay;
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity = "0";
  }

  // Force a browser reflow before triggering transition
  void document.body.offsetHeight;

  requestAnimationFrame(() => {
    for (const el of elements) {
      el.style.opacity = "1";
    }
  });

  if (callback) {
    setTimeout(callback, duration);
  }
}

/**
 * Fades out element(s) smoothly and sets display: none after completion.
 */
export function fadeOut(
  target: HTMLElement | string | NodeListOf<HTMLElement> | null | undefined,
  duration = 300,
  callback?: () => void,
): void {
  const elements = resolveElements(target);
  if (elements.length === 0) return;

  for (const el of elements) {
    if (!el.dataset.originalDisplay) {
      const targetDisplay = getTargetDisplay(el);
      if (targetDisplay !== "none") {
        el.dataset.originalDisplay = targetDisplay;
      }
    }
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity = "0";
  }

  setTimeout(() => {
    for (const el of elements) {
      el.style.display = "none";
    }
    if (callback) callback();
  }, duration);
}

/**
 * Shows element(s) immediately by setting display style.
 */
export function show(
  target: HTMLElement | string | NodeListOf<HTMLElement> | null | undefined,
  displayStyle?: string,
): void {
  const elements = resolveElements(target);
  for (const el of elements) {
    el.style.display = displayStyle || getTargetDisplay(el);
    el.style.opacity = "1";
  }
}

/**
 * Hides element(s) immediately with display: none.
 */
export function hide(
  target: HTMLElement | string | NodeListOf<HTMLElement> | null | undefined,
): void {
  const elements = resolveElements(target);
  for (const el of elements) {
    if (!el.dataset.originalDisplay) {
      const targetDisplay = getTargetDisplay(el);
      if (targetDisplay !== "none") {
        el.dataset.originalDisplay = targetDisplay;
      }
    }
    el.style.display = "none";
  }
}

/**
 * Smoothly animates the opacity of an element over a specified duration.
 */
export function animateOpacity(
  target: HTMLElement | string | null | undefined,
  opacity: number | string,
  duration = 300,
): void {
  const elements = resolveElements(target);
  for (const el of elements) {
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity = String(opacity);
  }
}
