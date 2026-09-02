/**
 * @file FlatBuffers WebSocket networking client and telemetry pipeline.
 * @module network/connection
 *
 * @remarks
 * Coordinates binary FlatBuffers message encoding/decoding over WebSockets:
 * - Emits parsed world views (`NetWorldView`) to `Game`.
 * - Emits leaderboard updates (`NetLeaderboard`) to `Leaderboard`.
 * - Handles automated jittered exponential reconnects.
 * - Tracks network latency (RTT), bandwidth uplink/downlink, and ping intervals.
 */

import { flatbuffers } from "flatbuffers";
import { Game } from "./game_generated";
import { Cache } from "../models/cache";
import { Settings } from "../ui/settings";
import { Vector2 } from "../math/vector2";
import { Controls } from "../ui/controls";
import { fadeIn, hide } from "../ui/domUtils";
import type { LeaderboardData } from "../ui/leaderboard";
import { WorldConfig } from "../models/worldConfig";

type NetFB = typeof Game.Engine.Networking.FlatBuffers;

/**
 * Authoritative WebSocket networking controller.
 */
export class Connection {
  /** Callback fired when a new binary world view snapshot arrives. */
  onView: (view: Game.Engine.Networking.FlatBuffers.NetWorldView) => void;
  /** Callback fired when a new leaderboard snapshot arrives. */
  onLeaderboard: (leaderboard: LeaderboardData) => void;
  /** Callback fired upon successful WebSocket connection establishment. */
  onConnected: () => void;
  /** Whether client is in reload transition. */
  reloading: boolean;
  /** Whether disconnection was intentional. */
  disconnecting: boolean;
  /** Active connection state. */
  connected: boolean;
  /** Calculated render frame rate. */
  framesPerSecond = 0;
  /** Inbound world view updates per second. */
  viewsPerSecond = 0;
  /** Inbound delta entity updates per second. */
  updatesPerSecond = 0;
  /** Total bytes uploaded in current window. */
  statBytesUp: number;
  /** Total bytes downloaded in current window. */
  statBytesDown: number;
  /** Bandwidth download rate in bytes per second. */
  statBytesDownPerSecond: number;
  /** Bandwidth upload rate in bytes per second. */
  statBytesUpPerSecond: number;
  /** Whether the browser tab is hidden in the background. */
  isBackgrounded = false;
  /** FlatBuffers schema namespace. */
  fb: NetFB;
  /** Current round-trip latency in milliseconds. */
  latency: number;
  /** Minimum recorded round-trip latency in milliseconds. */
  minLatency: number;
  /** Artificial latency delay for local simulation in milliseconds. */
  simulateLatency: number;
  /** Underlying browser WebSocket instance. */
  socket?: WebSocket;
  /** Timestamp when last ping packet was dispatched. */
  pingSent = 0;
  /** Current bandwidth throttle setting. */
  bandwidthThrottle: number;
  /** Whether to automatically reconnect on unexpected socket close. */
  autoReload: boolean;
  /** Total pong responses received. */
  statPongCount: number;
  /** Whether connection status UI reporting is enabled. */
  connectionStatusReporting: boolean;
  /** Consecutive failed reconnect attempts. */
  reconnectAttempts = 0;
  /** Reconnect timeout handle. */
  reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Last targeted world key string. */
  lastWorldKey?: string;
  /** Reusable FlatBuffers builder instance to prevent per-packet allocations. */
  private builder: flatbuffers.Builder;

  /**
   * Initializes the networking connection manager and starts background ping and bandwidth intervals.
   */
  constructor() {
    this.builder = new flatbuffers.Builder(1024);
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

  /**
   * Closes the active WebSocket connection and cancels any scheduled reconnect attempts.
   */
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

  /**
   * Establishes a WebSocket connection to the designated game world.
   *
   * @param worldKey - World or arena identifier string (e.g. `'us.spaceone.io/default'`).
   */
  connect(worldKey?: string): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (worldKey !== undefined) {
      this.lastWorldKey = worldKey;
    }

    if (!worldKey) {
      worldKey = this.lastWorldKey ?? "default";
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

  /**
   * Encodes and sends a `NetPing` message with client telemetry stats (FPS, VPS, latency, cache count).
   */
  sendPing(): void {
    const builder = this.builder;
    builder.clear();

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

  /**
   * Transmits an exit signal (`NetExit`) notifying the server of client departure.
   */
  sendExit(): void {
    const builder = this.builder;
    builder.clear();

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

  /**
   * Sends an authentication bearer token (`NetAuthenticate`) to the server.
   *
   * @param token - Auth token string.
   */
  sendAuthenticate(token: string): void {
    const builder = this.builder;
    builder.clear();

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

  /**
   * Transmits player spawn request (`NetSpawn`) with ship customization preferences.
   *
   * @param name - Player display name.
   * @param sprite - Chosen ship skin sprite key.
   * @param color - Ship color name.
   * @param token - Optional auth token.
   */
  sendSpawn(
    name: string,
    sprite: string,
    color: string,
    token?: string | null,
  ): void {
    const builder = this.builder;
    builder.clear();

    const stringName = builder.createString(name || "");
    const stringSprite = builder.createString(sprite || "ship_gray");
    const stringColor = builder.createString(color || "gray");
    let stringToken: flatbuffers.Offset | null = null;

    if (token) stringToken = builder.createString(token);

    this.fb.NetSpawn.startNetSpawn(builder);
    this.fb.NetSpawn.addName(builder, stringName);
    this.fb.NetSpawn.addShip(builder, stringSprite);
    this.fb.NetSpawn.addColor(builder, stringColor);
    if (stringToken !== null) this.fb.NetSpawn.addToken(builder, stringToken);
    const spawn = this.fb.NetSpawn.endNetSpawn(builder);

    this.fb.NetQuantum.startNetQuantum(builder);
    this.fb.NetQuantum.addMessageType(builder, this.fb.AllMessages.NetSpawn);
    this.fb.NetQuantum.addMessage(builder, spawn);
    const quantum = this.fb.NetQuantum.endNetQuantum(builder);

    builder.finish(quantum);

    this.send(builder.asUint8Array());
    console.log("spawned");
  }

  /**
   * Encodes and transmits the player's steering input frame (`NetControlInput`).
   *
   * @param angle - Desired heading angle in radians.
   * @param boost - Whether boost button is active.
   * @param shoot - Whether shooting button is active.
   * @param x - Steering aim X vector or position coordinate.
   * @param y - Steering aim Y vector or position coordinate.
   * @param spectateControl - Optional spectate target command string.
   * @param customDataJson - Optional custom JSON payload (e.g. chat messages).
   */
  sendControl(
    angle: number,
    boost: boolean,
    shoot: boolean,
    x: number,
    y: number,
    spectateControl?: string,
    customDataJson?: string,
  ): void {
    const builder = this.builder;
    builder.clear();

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

  /**
   * Transmits raw binary buffer over WebSocket with latency simulation support.
   *
   * @param databuffer - Serialized binary byte array.
   */
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

  /**
   * Internal WebSocket open event handler.
   */
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

  /**
   * Internal WebSocket close event handler scheduling exponential backoff reconnects.
   */
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

  /**
   * Internal WebSocket binary message dispatcher decoding FlatBuffers `NetQuantum` roots.
   */
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
