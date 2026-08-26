import { flatbuffers } from "flatbuffers";
import { Game } from "./game_generated";
import { Cache } from "../models/cache";
import { Settings } from "../ui/settings";
import { Vector2 } from "../math/vector2";
import { Controls } from "../ui/controls";
import { ArenaLink } from "./arenaLink";
import { fadeIn, hide } from "../ui/domUtils";
import type { LeaderboardData } from "../ui/leaderboard";
import { WorldConfig } from "../models/worldConfig";

const arenaLink = new ArenaLink();

type NetFB = typeof Game.Engine.Networking.FlatBuffers;

export class Connection {
  onView: (view: Game.Engine.Networking.FlatBuffers.NetWorldView) => void;
  onLeaderboard: (leaderboard: LeaderboardData) => void;
  onConnected: () => void;
  reloading: boolean;
  disconnecting: boolean;
  connected: boolean;
  framesPerSecond = 0;
  viewsPerSecond = 0;
  updatesPerSecond = 0;
  statBytesUp: number;
  statBytesDown: number;
  statBytesDownPerSecond: number;
  statBytesUpPerSecond: number;
  isBackgrounded = false;
  fb: NetFB;
  latency: number;
  minLatency: number;
  simulateLatency: number;
  socket?: WebSocket;
  pingSent = 0;
  bandwidthThrottle: number;
  autoReload: boolean;
  statPongCount: number;
  connectionStatusReporting: boolean;
  reconnectAttempts = 0;
  reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  lastWorldKey?: string;

  constructor() {
    this.onView = () => {};
    this.onLeaderboard = () => {};
    this.onConnected = () => {};
    this.reloading = false;
    this.disconnecting = false;
    this.connected = false;
    this.autoReload = true;
    this.connectionStatusReporting = true;

    this.statBytesUp = 0;
    this.statBytesDown = 0;
    this.statBytesDownPerSecond = 0;
    this.statBytesUpPerSecond = 0;
    this.statPongCount = 0;

    const self = this;
    this.fb = Game.Engine.Networking.FlatBuffers;
    this.latency = 0;
    this.minLatency = 999;
    this.simulateLatency = 0;

    this.bandwidthThrottle = Settings.bandwidth;

    setInterval(() => {
      if (self.connected) {
        self.sendPing();
      }
    }, 250);

    setInterval(() => {
      self.statBytesDownPerSecond = self.statBytesDown;
      self.statBytesUpPerSecond = self.statBytesUp;

      self.statBytesUp = 0;
      self.statBytesDown = 0;
    }, 1000);
  }
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.disconnecting = true;
      this.socket.close();
    }
  }
  connect(worldKey?: string): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (worldKey !== undefined) {
      this.lastWorldKey = worldKey;
    }

    if (!arenaLink.generated && worldKey) {
      arenaLink.generate(worldKey);
    }

    if (!worldKey) {
      worldKey = this.lastWorldKey ?? arenaLink.getArena();
    }

    let url: string;

    if (window.location.protocol === "https:") {
      url = "wss:";
    } else {
      url = "ws:";
    }

    let hostname = window.location.host;

    if (!hostname) {
      hostname = "localhost:5000";
    }

    if (worldKey) {
      const worldKeyParse = worldKey.match(/^(.*?)\/(.*)$/);
      if (worldKeyParse && worldKeyParse[1] && worldKeyParse[2]) {
        hostname = worldKeyParse[1];
        worldKey = worldKeyParse[2];
      }
    }

    url += `//${hostname}`;
    url += "/api/v1/connect?";

    if (worldKey) url += `world=${encodeURIComponent(worldKey)}&`;

    if (this.socket) {
      this.socket.onclose = () => {};
      this.socket.close();
    }

    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";

    const self = this;

    this.socket.onmessage = (event: MessageEvent) => {
      if (self.simulateLatency > 0) {
        setTimeout(() => {
          self.onMessage(event);
        }, self.simulateLatency);
      } else self.onMessage(event);
    };

    this.socket.onerror = () => {
      if (self.connectionStatusReporting) {
        document.body.classList.add("connectionerror");
        fadeIn("#toast-container", 300);
      }
    };

    this.socket.onopen = (event: Event) => {
      if (self.connectionStatusReporting) {
        document.body.classList.remove("connectionerror");
        hide("#toast-container");
      }
      self.onOpen(event);
    };
    this.socket.onclose = (event: CloseEvent) => {
      self.onClose(event);
    };
  }
  sendPing(): void {
    const builder = new flatbuffers.Builder(0);

    this.fb.NetPing.startNetPing(builder);
    this.pingSent = performance.now();

    this.fb.NetPing.addLatency(builder, this.latency);
    this.fb.NetPing.addVps(builder, this.viewsPerSecond);
    this.fb.NetPing.addUps(builder, this.updatesPerSecond);
    this.fb.NetPing.addFps(builder, this.framesPerSecond);
    this.fb.NetPing.addCs(builder, Cache.count);
    this.fb.NetPing.addBackgrounded(builder, this.framesPerSecond < 1);
    this.fb.NetPing.addBandwidthThrottle(builder, this.bandwidthThrottle);

    const ping = this.fb.NetPing.endNetPing(builder);

    this.fb.NetQuantum.startNetQuantum(builder);
    this.fb.NetQuantum.addMessageType(builder, this.fb.AllMessages.NetPing);
    this.fb.NetQuantum.addMessage(builder, ping);
    const quantum = this.fb.NetQuantum.endNetQuantum(builder);

    builder.finish(quantum);

    this.send(builder.asUint8Array());
  }

  sendExit(): void {
    const builder = new flatbuffers.Builder(0);

    this.fb.NetExit.startNetExit(builder);

    this.fb.NetExit.addCode(builder, 0);
    const exitmessage = this.fb.NetExit.endNetExit(builder);

    this.fb.NetQuantum.startNetQuantum(builder);
    this.fb.NetQuantum.addMessageType(builder, this.fb.AllMessages.NetExit);
    this.fb.NetQuantum.addMessage(builder, exitmessage);
    const quantum = this.fb.NetQuantum.endNetQuantum(builder);

    builder.finish(quantum);

    this.send(builder.asUint8Array());
  }

  sendAuthenticate(token: string): void {
    const builder = new flatbuffers.Builder(0);

    const stringToken = builder.createString(token || "");

    this.fb.NetAuthenticate.startNetAuthenticate(builder);
    this.fb.NetAuthenticate.addToken(builder, stringToken);
    const auth = this.fb.NetAuthenticate.endNetAuthenticate(builder);

    this.fb.NetQuantum.startNetQuantum(builder);
    this.fb.NetQuantum.addMessageType(
      builder,
      this.fb.AllMessages.NetAuthenticate,
    );
    this.fb.NetQuantum.addMessage(builder, auth);
    const quantum = this.fb.NetQuantum.endNetQuantum(builder);

    builder.finish(quantum);

    this.send(builder.asUint8Array());
    console.log("sent auth");
  }

  sendSpawn(name: string, color: string, ship: string, token: string): void {
    const builder = new flatbuffers.Builder(0);

    const stringColor = builder.createString(color || "gray");
    const stringName = builder.createString(name || "");
    const stringShip = builder.createString(ship || "ship_gray");
    const stringToken = builder.createString(token || "");

    this.fb.NetSpawn.startNetSpawn(builder);
    this.fb.NetSpawn.addColor(builder, stringColor);
    this.fb.NetSpawn.addName(builder, stringName);
    this.fb.NetSpawn.addShip(builder, stringShip);
    this.fb.NetSpawn.addToken(builder, stringToken);
    const spawn = this.fb.NetSpawn.endNetSpawn(builder);

    this.fb.NetQuantum.startNetQuantum(builder);
    this.fb.NetQuantum.addMessageType(builder, this.fb.AllMessages.NetSpawn);
    this.fb.NetQuantum.addMessage(builder, spawn);
    const quantum = this.fb.NetQuantum.endNetQuantum(builder);

    builder.finish(quantum);

    this.send(builder.asUint8Array());
    console.log("spawned");
  }

  sendControl(
    angle: number,
    boost: boolean,
    shoot: boolean,
    x: number,
    y: number,
    spectateControl?: string,
    customDataJson?: string,
  ): void {
    const builder = new flatbuffers.Builder(0);

    let spectateOffset: flatbuffers.Offset | null = null;
    let customDataJsonOffset: flatbuffers.Offset | null = null;

    if (spectateControl) spectateOffset = builder.createString(spectateControl);
    if (customDataJson)
      customDataJsonOffset = builder.createString(customDataJson);

    this.fb.NetControlInput.startNetControlInput(builder);
    this.fb.NetControlInput.addAngle(builder, angle);
    this.fb.NetControlInput.addBoost(builder, boost);
    this.fb.NetControlInput.addShoot(builder, shoot);
    this.fb.NetControlInput.addX(builder, x);
    this.fb.NetControlInput.addY(builder, y);
    if (spectateOffset !== null)
      this.fb.NetControlInput.addSpectateControl(builder, spectateOffset);
    if (customDataJsonOffset !== null)
      this.fb.NetControlInput.addCustomData(builder, customDataJsonOffset);

    const input = this.fb.NetControlInput.endNetControlInput(builder);

    this.fb.NetQuantum.startNetQuantum(builder);
    this.fb.NetQuantum.addMessageType(
      builder,
      this.fb.AllMessages.NetControlInput,
    );
    this.fb.NetQuantum.addMessage(builder, input);
    const quantum = this.fb.NetQuantum.endNetQuantum(builder);

    builder.finish(quantum);

    this.send(builder.asUint8Array());
  }

  send(databuffer: Uint8Array): void {
    if (this.socket && this.socket.readyState === 1) {
      const self = this;
      if (this.simulateLatency > 0) {
        setTimeout(() => {
          self.socket?.send(databuffer);
        }, this.simulateLatency);
      } else this.socket.send(databuffer);

      this.statBytesUp += databuffer.length;
    }
  }

  onOpen(_event: Event): void {
    this.connected = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    console.log("connected");
    this.sendPing();
    this.onConnected();

    if (this.reloading) {
      window.location.reload();
      this.reloading = false;
    }
  }

  onClose(event: CloseEvent): void {
    console.log("disconnected");
    this.connected = false;

    if (!this.disconnecting && this.autoReload) {
      if (event.reason !== "Normal closure") {
        this.reloading = true;
      }

      const baseDelay = Math.min(
        10000,
        500 * Math.pow(1.5, this.reconnectAttempts),
      );
      const jitter = Math.random() * 500;
      const delay = Math.round(baseDelay + jitter);

      this.reconnectAttempts++;
      console.log(
        `Scheduling reconnect in ${delay}ms (attempt #${this.reconnectAttempts})...`,
      );

      this.reconnectTimeout = setTimeout(() => {
        this.connect(this.lastWorldKey);
      }, delay);
    }
    this.disconnecting = false;
  }

  onMessage(event: MessageEvent): void {
    const data = new Uint8Array(event.data);
    const buf = new flatbuffers.ByteBuffer(data);

    this.statBytesDown += data.byteLength;

    const quantum = this.fb.NetQuantum.getRootAsNetQuantum(buf);

    const messageType = quantum.messageType();

    switch (messageType) {
      case this.fb.AllMessages.NetWorldView: {
        const message = quantum.message(new this.fb.NetWorldView());
        if (message) this.onView(message);
        break;
      }
      case this.fb.AllMessages.NetPing: {
        if (this.pingSent) {
          this.statPongCount++;
          this.latency = performance.now() - this.pingSent;
          if (this.latency > 0 && this.latency < this.minLatency)
            this.minLatency = this.latency;
        }

        break;
      }
      case this.fb.AllMessages.NetEvent: {
        const message = quantum.message(new this.fb.NetEvent());
        if (message) {
          const eventType = message.type();
          const netEvent = {
            type: eventType,
            data: JSON.parse(message.data() ?? "{}"),
          };

          if (eventType === "hook") {
            WorldConfig.updateFromHook(netEvent.data);
          } else {
            if (netEvent.data.roles !== undefined) {
              window.discordData = netEvent;
            }
            Controls.addSecretShips(netEvent);
          }
        }
        break;
      }
      case this.fb.AllMessages.NetLeaderboard: {
        const message = quantum.message(new this.fb.NetLeaderboard());
        if (!message) break;

        const entriesLength = message.entriesLength();
        const entries = [];
        for (let i = 0; i < entriesLength; i++) {
          const entry = message.entries(i);
          if (!entry) continue;

          const pos = entry.position();
          entries.push({
            FleetID: entry.fleetID(),
            Name: entry.name() ?? "",
            Color: entry.color() ?? "gray",
            Score: entry.score(),
            Position: pos ? new Vector2(pos.x(), pos.y()) : undefined,
            Token: entry.token() ?? "",
            ModeData: JSON.parse(entry.modeData() ?? "{}") || {
              flagStatus: "home",
            },
          });
        }

        const record = message.record();

        let recordModel = {
          Name: "",
          Color: "red",
          Score: 0,
          Token: false,
        };

        if (record) {
          recordModel = {
            Name: record.name() ?? "",
            Color: record.color() ?? "",
            Score: record.score(),
            Token: Boolean(record.token()),
          };
        }
        this.onLeaderboard({
          Type: message.type() ?? "FFA",
          Entries: entries,
          Record: recordModel,
        });

        break;
      }
    }
  }
}
