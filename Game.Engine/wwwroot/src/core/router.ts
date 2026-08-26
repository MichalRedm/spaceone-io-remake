import Cookies from "js-cookie";
import { Connection } from "../network/connection";

export interface PingResult {
  worldKey: string;
  latency: number;
}

export class Router {
  savedBestServer: string | null = null;
  bestServer: string | null = null;
  allResults: PingResult[] = [];

  public constructor() {
    this.savedBestServer = this.load();
  }

  private load(): string | null {
    let savedRouterConfig: { bestServer?: string } | null = null;
    const cookie = Cookies.get("router");
    if (cookie) {
      try {
        savedRouterConfig = JSON.parse(cookie);
      } catch (e) {
        console.error("Failed to parse router cookie:", e);
      }
    }

    if (savedRouterConfig?.bestServer) {
      this.bestServer = savedRouterConfig.bestServer;
    }

    return this.bestServer;
  }

  public save(server: string): void {
    Cookies.set("router", JSON.stringify({ bestServer: server }), {
      expires: 7,
    });
  }

  public findBestServer(
    servers: string[],
    next: (bestServer: string | null) => void,
  ): void {
    this.allResults = [];

    servers.forEach((server) => {
      this.pingServer(server);
    });

    setTimeout(() => {
      let best: PingResult | null = null;

      for (const result of this.allResults) {
        if (!best || result.latency < best.latency) {
          best = result;
        }
      }

      next(best ? best.worldKey : null);
    }, 2500);
  }

  public pingServer(worldKey: string): void {
    const connection = new Connection();
    connection.bandwidthThrottle = 1;
    connection.autoReload = false;
    connection.connect(worldKey);

    setTimeout(() => {
      if (connection.connected && connection.statPongCount > 1) {
        this.allResults.push({
          worldKey,
          latency: connection.latency,
        });
      }

      connection.disconnect();
    }, 1000);
  }
}
