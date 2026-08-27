import { show, fadeOut } from "../ui/domUtils";

const arenaLinkInput = document.getElementById(
  "arena-link-input",
) as HTMLInputElement | null;

export class ArenaLink {
  public currentArenaID: string | null = null;

  public generate(arenaId?: string): void {
    if (!arenaId) return;

    this.currentArenaID = arenaId;
    const origin = window.location.origin;
    const fullLink = `${origin}/#${arenaId}`;

    if (arenaLinkInput) {
      arenaLinkInput.value = fullLink;
    }
  }

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

  public getArenaIDFromURL(): string {
    let actualWindow: Window;
    if (this.iframeDetection()) {
      actualWindow = parent.window;
    } else {
      actualWindow = window;
    }

    // 1. Check URL Hash: '#4esGhl' or '#/4esGhl'
    const hash = actualWindow.location.hash;
    if (hash && hash.length > 1) {
      const cleanHash = hash.replace(/^#\/?/, "").trim();
      if (cleanHash.length > 0) {
        return cleanHash;
      }
    }

    // 2. Check Query Parameters: '?arena=4esGhl' or '?world=4esGhl'
    try {
      const url = new URL(actualWindow.location.href);
      const arenaParam =
        url.searchParams.get("arena") || url.searchParams.get("world");
      if (arenaParam) return arenaParam.trim();
    } catch {
      // ignore URL parse errors
    }

    return "";
  }

  public updateURLHash(arenaId?: string): void {
    if (!arenaId) return;
    try {
      const currentHash = window.location.hash.replace(/^#\/?/, "");
      if (currentHash !== arenaId) {
        history.replaceState(null, "", `#${arenaId}`);
      }
    } catch (err: unknown) {
      console.warn("Could not update URL hash:", err);
    }
  }

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

  public iframeDetection(): boolean {
    return window.self !== window.top;
  }
}
