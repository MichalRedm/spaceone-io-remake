/**
 * @file Deterministic virtual clock for offline replay rendering.
 * @module replay/virtualClock
 *
 * @remarks
 * Installed at bootstrap when `?replay=1` is present so PixiJS ticker updates,
 * entity interpolation (`performance.now()`), audio cooldowns, chat timeouts (`Date.now()`),
 * and scheduled gameplay UI timers advance strictly according to stepped virtual frame times
 * rather than wall-clock rendering speed.
 */

const BASE_PERFORMANCE_NOW_MS = 10_000;
const BASE_EPOCH_NOW_MS = 1_700_000_000_000;

interface VirtualTimerEntry {
  id: number;
  fireAtVirtualMs: number;
  callback: () => void;
}

const nativePerformanceNow =
  typeof performance !== "undefined"
    ? performance.now.bind(performance)
    : () => 0;
const nativeDateNow = Date.now.bind(Date);
const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);

let installed = false;
let currentVirtualMs = 0;
let nextVirtualTimerId = 1_000_000;
const virtualTimers = new Map<number, VirtualTimerEntry>();
let animationBirthMs = new WeakMap<Animation, number>();
let realTimeoutScopeDepth = 0;

/**
 * Returns `true` when the page was launched in deterministic replay rendering mode (`?replay=1`).
 */
export function isReplayMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const qs = new URLSearchParams(window.location.search);
    return qs.get("replay") === "1";
  } catch {
    return false;
  }
}

/**
 * Runs an asynchronous or synchronous operation using unpatched real wall-clock timers
 * (for asset fetch timeouts and Playwright coordination).
 */
export function withRealTimers<T>(fn: () => T): T {
  realTimeoutScopeDepth++;
  try {
    return fn();
  } finally {
    realTimeoutScopeDepth--;
  }
}

/**
 * Schedules a real wall-clock timeout even when virtual timers are active.
 */
export function realSetTimeout(
  handler: () => void,
  timeoutMs?: number,
): ReturnType<typeof setTimeout> {
  return nativeSetTimeout(handler, timeoutMs);
}

/**
 * Clears a real wall-clock timeout scheduled via `realSetTimeout`.
 */
export function realClearTimeout(
  id: ReturnType<typeof setTimeout> | undefined,
): void {
  if (id !== undefined) {
    nativeClearTimeout(id);
  }
}

/**
 * Returns current virtual elapsed time in milliseconds relative to replay start ($t = 0$).
 */
export function getVirtualElapsedMs(): number {
  return currentVirtualMs;
}

/**
 * Advances the virtual clock to `virtualMs` ($\ge 0$), executes all virtual timers due up to that
 * timestamp in chronological order, and synchronizes active Web Animations.
 *
 * @param virtualMs - Target elapsed replay timestamp in milliseconds.
 */
export function setVirtualTime(virtualMs: number): void {
  const targetMs = Math.max(0, virtualMs);
  if (targetMs < currentVirtualMs) {
    // Allow clean rewind on replay reload
    currentVirtualMs = targetMs;
    virtualTimers.clear();
  }

  while (true) {
    let earliest: VirtualTimerEntry | null = null;
    for (const entry of virtualTimers.values()) {
      if (entry.fireAtVirtualMs <= targetMs) {
        if (!earliest || entry.fireAtVirtualMs < earliest.fireAtVirtualMs) {
          earliest = entry;
        }
      }
    }
    if (!earliest) break;
    virtualTimers.delete(earliest.id);
    currentVirtualMs = Math.max(currentVirtualMs, earliest.fireAtVirtualMs);
    try {
      earliest.callback();
    } catch (err: unknown) {
      console.error("Virtual timer callback failed:", err);
    }
  }

  currentVirtualMs = targetMs;
  syncWebAnimations(targetMs);
}

/**
 * Resets virtual elapsed time back to `0` and clears all pending virtual timers.
 */
export function resetVirtualClock(): void {
  currentVirtualMs = 0;
  virtualTimers.clear();
  animationBirthMs = new WeakMap<Animation, number>();
}

function syncWebAnimations(virtualMs: number): void {
  if (
    typeof document === "undefined" ||
    typeof document.getAnimations !== "function"
  ) {
    return;
  }
  try {
    const animations = document.getAnimations();
    for (const anim of animations) {
      if (anim.playState === "running" || anim.playState === "paused") {
        let birthMs = animationBirthMs.get(anim);
        if (birthMs === undefined) {
          birthMs = virtualMs;
          animationBirthMs.set(anim, birthMs);
        }
        anim.pause();
        anim.currentTime = Math.max(0, virtualMs - birthMs);
      }
    }
  } catch {
    // Ignore animations whose timelines do not support seeking
  }
}

/**
 * Installs `performance.now`, `Date.now`, `setTimeout`, and `clearTimeout` virtual overrides
 * when running in replay mode. Safe to call multiple times (idempotent).
 */
export function installVirtualClock(): void {
  if (installed || !isReplayMode()) return;
  installed = true;

  if (typeof performance !== "undefined") {
    try {
      Object.defineProperty(performance, "now", {
        configurable: true,
        writable: true,
        value: (): number => BASE_PERFORMANCE_NOW_MS + currentVirtualMs,
      });
    } catch {
      // Fallback if performance.now is non-configurable
      performance.now = (): number =>
        BASE_PERFORMANCE_NOW_MS + currentVirtualMs;
    }
  }

  Date.now = (): number => BASE_EPOCH_NOW_MS + Math.floor(currentVirtualMs);

  const patchedSetTimeout = function (
    handler: TimerHandler,
    timeout = 0,
    ...args: unknown[]
  ): number {
    if (realTimeoutScopeDepth > 0) {
      return nativeSetTimeout(
        handler as (...cbArgs: unknown[]) => void,
        timeout,
        ...args,
      ) as unknown as number;
    }

    const delayMs = Number.isFinite(timeout) ? Math.max(0, Number(timeout)) : 0;
    const id = nextVirtualTimerId++;
    const callback =
      typeof handler === "function"
        ? () => {
            (handler as (...cbArgs: unknown[]) => void)(...args);
          }
        : () => {
            // Ignore string eval timers defensively
          };

    virtualTimers.set(id, {
      id,
      fireAtVirtualMs: currentVirtualMs + delayMs,
      callback,
    });
    return id;
  };

  const patchedClearTimeout = function (id?: number): void {
    if (id === undefined) return;
    if (virtualTimers.has(id)) {
      virtualTimers.delete(id);
      return;
    }
    nativeClearTimeout(id);
  };

  globalThis.setTimeout = patchedSetTimeout as unknown as typeof setTimeout;
  globalThis.clearTimeout =
    patchedClearTimeout as unknown as typeof clearTimeout;
  if (typeof window !== "undefined") {
    window.setTimeout =
      patchedSetTimeout as unknown as typeof window.setTimeout;
    window.clearTimeout =
      patchedClearTimeout as unknown as typeof window.clearTimeout;
  }
}

/**
 * Exposes original unpatched wall-clock `performance.now()` and `Date.now()` for diagnostics.
 */
export function getRealPerformanceNow(): number {
  return nativePerformanceNow();
}

export function getRealDateNow(): number {
  return nativeDateNow();
}
