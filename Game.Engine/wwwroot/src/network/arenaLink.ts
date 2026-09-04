/**
 * @file Arena invitation link generator, URL hash parser, and clipboard helper.
 * @module network/arenaLink
 */

import { show, fadeOut } from "../ui/domUtils";

const arenaLinkInput = document.getElementById(
  "arena-link-input",
) as HTMLInputElement | null;

/**
 * Structured breakdown of parsed URL arena route parameters.
 */
export interface ParsedArenaRoute {
  /** Raw unparsed route segment. */
  raw: string;
  /** Resolved target game mode or world key (e.g. 'robo', 'ctf', 'team', 'duel', 'default'). */
  worldKey?: string;
  /** Specific target arena instance identifier (e.g. 'xK92Lp'). */
  arenaId?: string;
  /** Whether the link targets an unlisted or private custom arena. */
  isPrivate: boolean;
}

/**
 * Manages shareable arena join URLs and coordinates URL hash state with arena IDs.
 */
export class ArenaLink {
  /** Active arena instance identifier. */
  public currentArenaID: string | null = null;
  /** Active world key identifier. */
  public currentWorldKey: string | null = null;

  /**
   * Generates a fully qualified join URL combining the world key and arena instance ID.
   *
   * @param worldKey - World or game mode identifier (e.g. 'robo', 'ctf').
   * @param arenaId - Unique arena instance key (e.g. 'xK92Lp').
   */
  public generate(worldKey?: string, arenaId?: string): void {
    if (!arenaId) return;

    this.currentArenaID = arenaId;
    const origin = window.location.origin;
    const cleanWorldKey = worldKey?.includes("/")
      ? worldKey.split("/").pop()
      : worldKey;

    this.currentWorldKey = cleanWorldKey || null;

    let fullLink = `${origin}/#${arenaId}`;
    if (cleanWorldKey && cleanWorldKey !== "default") {
      fullLink = `${origin}/#${cleanWorldKey}:${arenaId}`;
    }

    if (arenaLinkInput) {
      arenaLinkInput.value = fullLink;
    }
  }

  /**
   * Copies the current arena join URL to the user's clipboard and triggers the success animation.
   */
  public copy(): void {
    if (!arenaLinkInput) return;

    const textToCopy = arenaLinkInput.value;
    if (!textToCopy) return;

    // Use Modern Clipboard API with fallback to execCommand
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).catch((err: unknown) => {
        console.warn(
          "Clipboard API write failed, falling back to execCommand",
          err,
        );
        this.fallbackCopy();
      });
    } else {
      this.fallbackCopy();
    }

    show("#arena-link-success");
    setTimeout(() => {
      fadeOut("#arena-link-success", 1000);
    }, 3000);
  }

  /**
   * Fallback copy routine for older browsers using `document.execCommand('copy')`.
   */
  private fallbackCopy(): void {
    if (!arenaLinkInput) return;
    arenaLinkInput.select();
    arenaLinkInput.setSelectionRange(0, 99999);
    try {
      document.execCommand("copy");
    } catch (err: unknown) {
      console.error("Failed to copy link using execCommand:", err);
    }
    arenaLinkInput.setSelectionRange(0, 0);
  }

  /**
   * Parses the active browser URL hash or query parameters into a structured arena route.
   *
   * @returns Parsed arena route descriptor, or `null` if none present.
   */
  public parseArenaRouteFromURL(): ParsedArenaRoute | null {
    let actualWindow: Window;
    if (this.iframeDetection()) {
      actualWindow = parent.window;
    } else {
      actualWindow = window;
    }

    let rawTarget = "";

    // 1. Check URL Hash: '#robo:4esGhl', '#/robo/4esGhl', '#4esGhl'
    const hash = actualWindow.location.hash;
    if (hash && hash.length > 1) {
      rawTarget = hash.replace(/^#\/?/, "").trim();
    }

    // 2. Check Query Parameters: '?arena=...' or '?world=...'
    if (!rawTarget) {
      try {
        const url = new URL(actualWindow.location.href);
        const param =
          url.searchParams.get("arena") || url.searchParams.get("world");
        if (param) rawTarget = param.trim();
      } catch {
        // ignore URL parse errors
      }
    }

    if (!rawTarget) return null;

    // Handle compound format with colon: "mode:arenaId", "region:mode:arenaId", "private:arenaId", "p:arenaId"
    if (rawTarget.includes(":")) {
      const parts = rawTarget.split(":");
      const arenaId = parts[parts.length - 1];
      const prefix = parts.length === 2 ? parts[0] : parts[1];
      const isPrivate =
        parts[0].toLowerCase() === "private" || parts[0].toLowerCase() === "p";

      return {
        raw: rawTarget,
        worldKey: isPrivate ? undefined : prefix.toLowerCase(),
        arenaId: arenaId || undefined,
        isPrivate,
      };
    }

    // Handle compound format with slash: "mode/arenaId"
    if (rawTarget.includes("/")) {
      const parts = rawTarget.split("/");
      const arenaId = parts[parts.length - 1];
      const prefix = parts[0];
      const isPrivate =
        prefix.toLowerCase() === "private" || prefix.toLowerCase() === "p";

      return {
        raw: rawTarget,
        worldKey: isPrivate ? undefined : prefix.toLowerCase(),
        arenaId: arenaId || undefined,
        isPrivate,
      };
    }

    // Handle hyphen format: "mode-arenaId" where arenaId is exactly 6 alphanumeric chars
    const hyphenIndex = rawTarget.lastIndexOf("-");
    if (hyphenIndex > 0 && hyphenIndex < rawTarget.length - 1) {
      const candidateId = rawTarget.substring(hyphenIndex + 1);
      if (/^[0-9a-zA-Z]{6}$/.test(candidateId)) {
        const prefix = rawTarget.substring(0, hyphenIndex);
        const isPrivate =
          prefix.toLowerCase() === "private" || prefix.toLowerCase() === "p";
        return {
          raw: rawTarget,
          worldKey: isPrivate ? undefined : prefix.toLowerCase(),
          arenaId: candidateId,
          isPrivate,
        };
      }
    }

    // Known standard world keys without arenaId: 'default', 'robo', 'ctf', 'team', 'duel', 'sumo', 'ffa'
    const knownKeys = ["default", "robo", "ctf", "team", "duel", "sumo", "ffa"];
    if (knownKeys.includes(rawTarget.toLowerCase())) {
      return {
        raw: rawTarget,
        worldKey: rawTarget.toLowerCase(),
        isPrivate: false,
      };
    }

    // Bare 6-char alphanumeric or legacy raw ID format
    return {
      raw: rawTarget,
      arenaId: rawTarget,
      isPrivate: false,
    };
  }

  /**
   * Extracts the arena ID from the active browser URL hash or query parameters.
   *
   * @returns Clean arena ID string, or empty string if none present.
   */
  public getArenaIDFromURL(): string {
    const route = this.parseArenaRouteFromURL();
    if (!route) return "";
    return route.arenaId || route.worldKey || route.raw;
  }

  /**
   * Synchronizes browser URL hash without causing a page reload.
   *
   * @param route - Route or arena identifier.
   */
  public updateURLHash(route?: string): void {
    if (!route) return;
    try {
      const currentHash = window.location.hash.replace(/^#\/?/, "");
      if (currentHash !== route) {
        history.replaceState(null, "", `#${route}`);
      }
    } catch (err: unknown) {
      console.warn("Could not update URL hash:", err);
    }
  }

  /**
   * Clears the current URL hash fragment.
   */
  public clearURLHash(): void {
    try {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    } catch (err: unknown) {
      console.warn("Could not clear URL hash:", err);
    }
  }

  /**
   * Detects whether the current client is executing inside an embedded iframe.
   *
   * @returns `true` if embedded inside an iframe, otherwise `false`.
   */
  public iframeDetection(): boolean {
    return window.self !== window.top;
  }
}
