/**
 * @file Multi-server latency routing and optimal world connection resolver.
 * @module core/router
 */

import Cookies from "js-cookie";
import { Connection } from "../network/connection";

/**
 * Encapsulates the measured latency result for a probed game server world.
 */
export interface PingResult {
  /** Server world identifier or address key. */
  worldKey: string;
  /** Round-trip network latency in milliseconds. */
  latency: number;
}

/**
 * Probes available game servers to select and persist the lowest-latency world for the player.
 */
export class Router {
  /** Previously saved optimal server loaded from cookie storage. */
  savedBestServer: string | null = null;
  /** Current best server identified during probing. */
  bestServer: string | null = null;
  /** Latency measurement results collected during server ping probing. */
  allResults: PingResult[] = [];

  /**
   * Initializes the router and loads cached server preferences from cookies.
   */
  public constructor() {
    this.savedBestServer = this.load();
  }

  /**
   * Reads and parses previously saved server preference from browser cookie.
   *
   * @returns Best server key or `null` if no valid cookie exists.
   */
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

  /**
   * Persists the preferred server key to browser cookies with a 7-day expiration.
   *
   * @param server - World key to save.
   */
  public save(server: string): void {
    Cookies.set("router", JSON.stringify({ bestServer: server }), {
      expires: 7,
    });
  }

  /**
   * Asynchronously pings a candidate list of servers in parallel and selects the lowest-latency option.
   *
   * @param servers - Array of world keys to ping.
   * @param next - Callback invoked with the lowest-latency world key (or `null` if all fail).
   */
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

  /**
   * Measures network round-trip time for a single world server using a temporary WebSocket connection.
   *
   * @param worldKey - Target server world key to probe.
   */
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
