import Cookies from "js-cookie";
import { Connection } from "./connection";

export class Router {
  savedBestServer: string;
  bestServer: string;
  allResults: any[];

  public constructor() {
    this.savedBestServer = this.load();
  }

  private load() {
    let savedRouterConfig: any = null;
    const cookie = Cookies.get("router");
    if (cookie) {
      try {
        savedRouterConfig = JSON.parse(cookie);
      } catch (e) {
        console.error("Failed to parse router cookie:", e);
      }
    }

    if (savedRouterConfig) {
      this.bestServer = savedRouterConfig.bestServer;
    }

    return this.bestServer;
  }

  private save(server) {
    //Stores a cookie of the best found server.
    //Set to expire every 7 days.
    Cookies.set("router", JSON.stringify({ bestServer: server }), {
      expires: 7,
    });
  }

  public findBestServer(servers: string[], next: (bestServer: any) => void) {
    this.allResults = [];

    servers.forEach((server) => {
      this.pingServer(server);
    });

    let self = this;
    setTimeout(function () {
      var best: any = false;

      self.allResults.forEach((result) => {
        if (!best || (<any>result).latency < best.latency) best = result;
      });

      next(best.worldKey);
    }, 2500);
  }

  public pingServer(worldKey: string) {
    var connection = new Connection();
    connection.bandwidthThrottle = 1;
    connection.autoReload = false;
    connection.connect(worldKey);

    var self = this;
    setTimeout(function () {
      //console.log({ worldKey: worldKey, latency: connection.latency, connected: connection.connected, pongs: connection.statPongCount });
      if (connection.connected && connection.statPongCount > 1)
        self.allResults.push({
          worldKey: worldKey,
          latency: connection.latency,
        });

      connection.disconnect();
    }, 1000);
  }
}
