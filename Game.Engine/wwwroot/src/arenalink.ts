import { show, fadeOut } from "./domUtils";

const arenaLinkInput = document.getElementById(
  "arena-link-input",
) as HTMLInputElement | null;
const getUrl = window.location;
const baseUrl = `${getUrl.protocol}//${getUrl.host}/${getUrl.pathname.split("/")[1] ?? ""}`;
const chars = "0123456789abcdefghijklmnopqrstuwvxyzABCDEFGHIJKLMNOPQRSTUWVXYZ";
const base = chars.length;
const arenas: string[] = [
  "us.daud.io/default",
  "de.daud.io/default",
  "localhost:5000/default",
  "de.daud.io:81/default",
];
const timeZero = 1400000000;

export class ArenaLink {
  public generated: boolean;

  public constructor() {
    this.generated = false;
  }

  public generate(worldKey?: string): void {
    if (worldKey !== undefined) {
      console.log(`World key: ${worldKey}`);
      const d = new Date();
      const time = Math.floor(d.getTime() / 1000) - timeZero;
      const arenaIndex = arenas.indexOf(worldKey);
      if (arenaIndex !== -1 && arenaLinkInput) {
        const arenaLink = `${baseUrl}#${this.encode(Number(`${time}${arenaIndex}`))}`;
        arenaLinkInput.value = arenaLink;
        console.log(`Arena link generated: ${arenaLink}`);
      } else if (arenaLinkInput) {
        arenaLinkInput.value = getUrl.href;
      }
      this.generated = true;
    }
  }

  public encode(num: number): string {
    let encoded = "";
    let current = num;
    while (current > 0) {
      const remainder = current % base;
      current = Math.floor(current / base);
      encoded = (chars[remainder] ?? "").toString() + encoded;
    }
    return encoded;
  }

  public decode(str?: string): number {
    if (!str) return 0;
    let decoded = 0;
    let remaining = str;
    while (remaining.length > 0) {
      const index = chars.indexOf(remaining[0] ?? "");
      const power = remaining.length - 1;
      decoded += index * Math.pow(base, power);
      remaining = remaining.substring(1);
    }
    return decoded;
  }

  public copy(): void {
    if (!arenaLinkInput) return;
    // Select the text field
    arenaLinkInput.select();
    arenaLinkInput.setSelectionRange(0, 99999); // For mobile devices

    // Copy the text inside the text field
    document.execCommand("copy");

    // remove selection
    arenaLinkInput.setSelectionRange(0, 0);

    show("#arena-link-success");
    setTimeout(function () {
      fadeOut("#arena-link-success", 1000);
    }, 3000);
  }

  public getLinkFromURL(): string {
    let linkInURL = "";
    let actualWindow: Window;

    if (this.iframeDetection()) {
      actualWindow = parent.window;
    } else {
      actualWindow = window;
    }

    if (actualWindow.location.hash.length > 1) {
      linkInURL = this.readArenaLinkFromURL(actualWindow.location.hash);
    }

    if (!linkInURL) return "";
    return this.decode(linkInURL).toString();
  }

  public getArena(): string | undefined {
    const link = this.getLinkFromURL();
    if (!link) return undefined;
    const lastChar = Number(link.substring(link.length - 1, link.length));
    if (isNaN(lastChar) || lastChar < 0 || lastChar >= arenas.length)
      return undefined;
    const arena = arenas[lastChar];
    return arena;
  }

  public readArenaLinkFromURL(hashUrl: string): string {
    return hashUrl.substring(1);
  }

  public iframeDetection(): boolean {
    return window.self !== window.top;
  }
}
