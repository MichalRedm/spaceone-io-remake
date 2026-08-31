import "./bootstrap";
import * as PIXI from "pixi.js";
import { Game as FBGame } from "../network/game_generated";

import { Renderer } from "../rendering/renderer";
import { Background } from "../rendering/background";
import { Border } from "../rendering/border";
import { Overlay } from "../ui/overlay";
import { spriteIndices } from "../models/spriteIndices";
import { Camera } from "../rendering/camera";
import { Cache } from "../models/cache";
import type { BodyState, GroupState } from "../models/cache";
import { Interpolator } from "../rendering/interpolator";
import { Leaderboard, clear as clearLeaderboards } from "../ui/leaderboard";
import { Minimap } from "../ui/minimap";
import { HUD } from "../ui/hud";
import { Log } from "../ui/log";
import type { LogEntryExtraData } from "../ui/log";
import { Cooldown } from "../ui/cooldown";
import { FX } from "../models/fx";
import { Controls } from "../ui/controls";
import { message } from "../ui/chat";
import { Connection } from "../network/connection";
import { getToken } from "../network/discord";
import { WorldConfig } from "../models/worldConfig";
import { Settings } from "../ui/settings";
import { Events } from "./events";
import { ArenaLink } from "../network/arenaLink";
import { LobbyCallbacks, toggleLobby } from "../network/lobby";
import type { WorldInfo } from "../network/lobby";
import "pixi-layers";
import * as pixi_tilemap from "pixi-tilemap";
import "../ui/changelog";
import "../ui/hintBox";
import { bootstrapPopups } from "../ui/popupUtils";
import { initFeaturedVideo } from "../ui/featuredVideo";
import { show, hide, fadeIn, animateOpacity } from "../ui/domUtils";
import { Vector2 } from "../math/vector2";
import { CustomContainer } from "../rendering/customContainer";
import { preloadAllAssets } from "../rendering/atlasLoader";

bootstrapPopups();
initFeaturedVideo();

window.Game = window.Game || {};
const pixiAny = (window as any).PIXI;
pixiAny.tilemap = pixiAny.tilemap || pixi_tilemap;

const size = { width: 1000, height: 500 };
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const zoom = 1000;
const cameraDrag = 0.8;

//PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;
//PIXI.settings.RESOLUTION = window.devicePixelRatio || 1;
const app = new PIXI.Application(<any>{
  view: canvas,
  transparent: true,
});
app.stage = new pixiAny.display.Stage();
(<any>app.stage).group.enableSort = true;
const container = new CustomContainer();
app.stage.addChild(container);

// Preload all assets and warm up GPU before gameplay
preloadAllAssets(app, Settings.mipmapping);

const backgroundGroup = new pixiAny.display.Group(0, true);
const tileGroup = new pixiAny.display.Group(1, true);
const bodyGroup = new pixiAny.display.Group(2, true);

app.stage.addChild(new pixiAny.display.Layer(backgroundGroup));
app.stage.addChild(new pixiAny.display.Layer(tileGroup));
app.stage.addChild(new pixiAny.display.Layer(bodyGroup));

container.backgroundGroup = backgroundGroup;
container.bodyGroup = bodyGroup;

container.tiles = new (
  pixiAny.tilemap.CompositeRectTileLayer || pixi_tilemap.CompositeRectTileLayer
)(0);
container.tiles.parentGroup = tileGroup;
container.addChild(container.tiles);

const background = new Background(container);
const border = new Border(container);
container.plotly = document.getElementById("plotly");
const overlay = new Overlay(container, canvas, container.plotly);
FX.init(container);
const camera = new Camera(size);

const interpolator = new Interpolator();
const renderer = new Renderer(container);
const leaderboard = new Leaderboard();
const minimap = new Minimap(app.stage, size);
const hud = new HUD();
const log = new Log();
const cooldown = new Cooldown();

let isSpectating = false;

let angle = 0.0;
let aimTarget = new Vector2(0, 0);
let d = 500; // for steering with arrows

let keyboardSteering = false;
let keyboardSteeringSpeed = 0.075;

interface GameViewState {
  time: number;
  isAlive: boolean;
  camera?: BodyState;
}

const cache = new Cache(container);
let view: GameViewState | null = null;
let serverTimeOffset: number | false = false;
let lastOffset = 0;
let gameTime = 0;
let lastPosition: Vector2 | null = null;
let worldSize = 1000;

let CustomData: string | null = null;
let CustomDataTime: number | null = null;

let currentWorld: WorldInfo | false = false;

Controls.registerCanvas(canvas);

const connection = new Connection();
/*if (window.location.hash) connection.connect(window.location.hash.substring(1));
else connection.connect();*/

window.Game.primaryConnection = connection;
window.Game.isBackgrounded = false;
window.Game.cache = cache;
window.Game.controls = Controls;

window.Game.reinitializeWorld = function () {
  if (currentWorld) Controls.initializeWorld(currentWorld);

  background.refreshSprite();
};

const arenaLink = new ArenaLink();

document
  .getElementById("generate-link-button")
  ?.addEventListener("click", function () {
    arenaLink.copy();
  });

function bodyFromServer(
  _cache: Cache,
  body: FBGame.Engine.Networking.FlatBuffers.NetBody | null,
): BodyState | null {
  if (!body) return null;
  const originalPosition = body.originalPosition();
  const momentum = body.velocity();
  const groupID = body.group();

  const spriteIndex = body.sprite();
  let spriteName: string | null = null;
  if (spriteIndex >= 1000) spriteName = `map[${spriteIndex - 1000}]`;
  else spriteName = spriteIndices[spriteIndex] ?? null;

  return {
    ID: body.id(),
    DefinitionTime: body.definitionTime(),
    Size: body.size() * 5,
    Sprite: spriteName,
    Mode: body.mode(),
    Group: groupID,
    OriginalAngle: body.originalAngle(),
    AngularVelocity: body.angularVelocity(),
    Momentum: momentum
      ? new Vector2(momentum.x(), momentum.y())
      : new Vector2(0, 0),
    OriginalPosition: originalPosition
      ? new Vector2(originalPosition.x(), originalPosition.y())
      : new Vector2(0, 0),
  };
}

function groupFromServer(
  _cache: Cache,
  group: FBGame.Engine.Networking.FlatBuffers.NetGroup | null,
): GroupState | null {
  if (!group) return null;
  let customData = group.customData();
  if (customData) {
    try {
      customData = JSON.parse(customData);
    } catch {
      // keep raw string
    }
  }

  return {
    ID: group.group(),
    Caption: group.caption() ?? undefined,
    Type: group.type(),
    ZIndex: group.zindex(),
    CustomData: customData ?? undefined,
  };
}

connection.onLeaderboard = (lb) => {
  leaderboard.update(lb, lastPosition ?? new Vector2(0, 0), fleetID);
  minimap.update(lb, worldSize, fleetID);
};

let fleetID = 0;
let ownFleetID = 0;
let lastAliveState: boolean | null = null;
let aliveSince: number | null = null;
let joiningWorld = false;

connection.onConnected = () => {
  connection.sendAuthenticate(getToken() ?? "");
};

connection.onView = (newView) => {
  viewCounter++;

  view = {
    time: newView.time(),
    isAlive: newView.isAlive(),
  };

  fleetID = newView.fleetID();
  if (view.isAlive) {
    ownFleetID = fleetID;
  }
  if (view.isAlive && !lastAliveState) {
    lastAliveState = true;
    isSpectating = false;
    document.body.classList.remove("dead");
    document.body.classList.remove("spectating");
    document.body.classList.add("alive");
    canvas.style.visibility = "initial";
    hide(".visibility");
    hide(".visibility4");
    show(".visibility3");
    const overlay = document.getElementById("overlay");
    if (overlay) {
      overlay.style.transition = "none";
      overlay.style.opacity = "0";
    }
  } else if (!view.isAlive && lastAliveState) {
    lastAliveState = false;

    setTimeout(function () {
      document.body.classList.remove("alive");
      document.body.classList.add("spectating");
      document.body.classList.add("dead");
      fadeIn(".visibility", 2000);
      hide(".visibility3");
      animateOpacity("#overlay", 0.8, 2000);
    }, 1000);

    Events.Death((gameTime - (aliveSince ?? gameTime)) / 1000);
  }

  lastOffset = view.time + connection.latency / 2 - performance.now();
  if (serverTimeOffset === false) serverTimeOffset = lastOffset;
  serverTimeOffset = 0.95 * serverTimeOffset + 0.05 * lastOffset;

  const groupsLength = newView.groupsLength();
  const groups = [];
  for (let u = 0; u < groupsLength; u++) {
    const group = newView.groups(u);
    groups.push(groupFromServer(cache, group));
  }

  const updatesLength = newView.updatesLength();
  const updates = [];
  for (let u = 0; u < updatesLength; u++) {
    const update = newView.updates(u);
    updates.push(bodyFromServer(cache, update));
  }

  const announcementsLength = newView.announcementsLength();
  for (let u = 0; u < announcementsLength; u++) {
    const announcement = newView.announcements(u);
    if (!announcement) continue;
    switch (announcement.type()) {
      case "join": {
        const worldKey = announcement.text() ?? "";
        if (!joiningWorld && LobbyCallbacks.joinWorld) {
          joiningWorld = true;
          console.log("received join: " + worldKey);
          LobbyCallbacks.joinWorld(worldKey);
        }
        break;
      }
      default: {
        let extra: LogEntryExtraData | undefined = undefined;
        const extraRaw = announcement.extraData();
        if (extraRaw) {
          try {
            extra = JSON.parse(extraRaw);
          } catch {
            // ignore
          }
        }

        log.addEntry({
          type: announcement.type() ?? "",
          text: announcement.text() ?? "",
          pointsDelta: announcement.pointsDelta(),
          extraData: extra,
        });
        break;
      }
    }
  }

  updateCounter += updatesLength;

  const deletes: number[] = [];
  const deletesLength = newView.deletesLength();
  for (let d = 0; d < deletesLength; d++) {
    const del = newView.deletes(d);
    if (del !== null) deletes.push(del);
  }

  const groupDeletes: number[] = [];
  const groupDeletesLength = newView.groupDeletesLength();
  for (let d = 0; d < groupDeletesLength; d++) {
    const gdel = newView.groupDeletes(d);
    if (gdel !== null) groupDeletes.push(gdel);
  }

  cache.update(
    updates.filter((u): u is BodyState => u !== null),
    deletes,
    groups.filter((g): g is GroupState => g !== null),
    groupDeletes,
    gameTime,
    fleetID,
  );
  overlay.update(newView.customData());

  hud.playerCount = newView.playerCount();
  hud.spectatorCount = newView.spectatorCount();

  if (newView.worldSize() !== border.worldSize) {
    worldSize = newView.worldSize();
    border.updateWorldSize(newView.worldSize());
  }

  if (view.isAlive) {
    cooldown.setCooldown(newView.cooldownShoot());
    if (ownFleetID) {
      const ownFleetGroup = cache.getGroup(ownFleetID);
      if (ownFleetGroup?.Caption) {
        const selfNickContainer = document.getElementById("selfNickContainer");
        if (
          selfNickContainer &&
          selfNickContainer.textContent !== ownFleetGroup.Caption
        ) {
          selfNickContainer.textContent = ownFleetGroup.Caption;
        }
      }
    }
  } else {
    cooldown.hide();
  }

  view.camera = bodyFromServer(cache, newView.camera()) ?? undefined;

  if (spawnOnView) {
    spawnOnView = false;
    doSpawn();
  }
};

let lastControl: {
  angle: number | null;
  aimTarget: Vector2 | null;
  boost: boolean | null;
  shoot: boolean | null;
  chat: string | null;
} = {
  angle: null,
  aimTarget: null,
  boost: null,
  shoot: null,
  chat: null,
};

setInterval(() => {
  if (
    angle !== lastControl.angle ||
    aimTarget.x !== lastControl.aimTarget?.x ||
    aimTarget.y !== lastControl.aimTarget?.y ||
    Controls.boost !== lastControl.boost ||
    Controls.shoot !== lastControl.shoot ||
    message.txt !== lastControl.chat
  ) {
    let spectateControl: string | undefined = undefined;
    if (isSpectating) {
      if (Controls.shoot) spectateControl = "action:next";
      else spectateControl = "spectating";
    }

    let customData: string | undefined = undefined;

    if (message.time + 3000 > Date.now())
      customData = JSON.stringify({ chat: message.txt });

    connection.sendControl(
      angle,
      Controls.boost,
      Controls.shoot,
      aimTarget.x,
      aimTarget.y,
      spectateControl,
      customData,
    );

    lastControl = {
      angle,
      aimTarget: new Vector2(aimTarget.x, aimTarget.y),
      boost: Controls.boost,
      shoot: Controls.shoot,
      chat: message.txt,
    };
  }
}, 10);

LobbyCallbacks.onLobbyClose = function () {
  clearLeaderboards();
};

let spawnOnView = false;
LobbyCallbacks.onWorldJoin = function (worldKey: string, world?: WorldInfo) {
  console.log(`onWorldJoin: ${worldKey} ${world}`);
  if (joiningWorld) {
    joiningWorld = false;
    spawnOnView = true;
  }

  currentWorld = world ?? false;
  if (world?.arenaID || world?.arenaKey) {
    const arenaId = world.arenaID ?? world.arenaKey;
    arenaLink.generate(arenaId);
    arenaLink.updateURLHash(arenaId);
  }

  connection.disconnect();
  cache.empty();
  WorldConfig.resetToDefaults();
  connection.connect(worldKey);
  serverTimeOffset = false;

  Controls.initializeWorld(world);
};

function doSpawn(): void {
  isSpectating = false;
  Events.Spawn();
  aliveSince = gameTime;
  connection.sendSpawn(
    Controls.nick,
    Controls.color ?? "gray",
    Controls.ship,
    getToken() ?? "",
  );
  const overlayEl = document.getElementById("overlay");
  if (overlayEl) overlayEl.style.opacity = "0";
  const selfNickContainer = document.getElementById("selfNickContainer");
  if (selfNickContainer) selfNickContainer.textContent = Controls.nick;
  show(".visibility2");
  show(".visibility3");
}
document.getElementById("spawn")?.addEventListener("click", doSpawn);
document.getElementById("spawnSpectate")?.addEventListener("click", doSpawn);

function startSpectate(hideButton = false) {
  isSpectating = true;
  ownFleetID = 0;
  Events.Spectate();
  const overlay = document.getElementById("overlay");
  if (overlay) overlay.style.opacity = "0";
  document.body.classList.add("spectating");
  document.body.classList.add("dead");
  canvas.style.visibility = "initial";
  hide(".visibility");
  show(".visibility2");
  hide(".visibility3");
  hide(".visibility4");

  if (hideButton) {
    document.body.classList.add("spectate_only");
  }
}

document.getElementById("spectate")?.addEventListener("click", () => {
  startSpectate();
});

function stopSpectate() {
  isSpectating = false;
  ownFleetID = 0;
  document.body.classList.remove("spectating");
  document.body.classList.remove("spectate_only");
}

document.getElementById("stop_spectating")?.addEventListener("click", () => {
  stopSpectate();
  const deathScreen = document.getElementById("deathScreen");
  if (deathScreen) deathScreen.style.visibility = "hidden";
});

document.addEventListener("keydown", ({ keyCode, which }) => {
  if (keyCode == 27 || which == 27) {
    if (lastAliveState) {
      connection.sendExit();
    } else if (isSpectating) {
      stopSpectate();
    } else if (document.body.classList.contains("lobby")) {
      toggleLobby();
    } else {
      startSpectate();
    }
  }
});

const sizeCanvas = () => {
  let width;
  let height;
  if ((window.innerWidth * 9) / 16 >= window.innerHeight) {
    width = window.innerWidth;
    height = (width * 9) / 16;
  } else {
    height = window.innerHeight;
    width = (height * 16) / 9;
  }

  size.width = Math.floor(width);
  size.height = Math.floor(height);
  minimap.size(size);
  app.renderer.resize(width, height);
  container.scale.set(width / zoom, width / zoom);
};

sizeCanvas();

window.addEventListener("resize", () => {
  sizeCanvas();
});

let frameCounter = 0;
let viewCounter = 0;
let updateCounter = 0;
let lastCamera = new Vector2(0, 0);

function doPing() {
  hud.framesPerSecond = frameCounter;
  connection.framesPerSecond = frameCounter;
  connection.viewsPerSecond = viewCounter;
  connection.updatesPerSecond = updateCounter;

  hud.latency = connection.latency;

  if (frameCounter === 0) {
    //console.log("backgrounded");
    window.Game.isBackgrounded = true;
  } else window.Game.isBackgrounded = false;
  frameCounter = 0;
  viewCounter = 0;
  updateCounter = 0;
}

doPing();
setInterval(doPing, 1000);

const graphics = new PIXI.Graphics();
container.addChild(graphics);

const fleetSizeDisplay = document.getElementById("fleetSize");
const dangerZoneWarning = document.getElementById("dangerZoneWarning");

let lastCustomData: string | null = null;
let spotSprites: PIXI.Sprite[] = [];

const currentCameraPosition = new Vector2(0, 0);
const mouseScreenPos = new Vector2(0, 0);
const mouseWorldPos = new Vector2(0, 0);
let currentFleetSize = -1;

// Game Loop
app.ticker.add(() => {
  const _latency = connection.minLatency || 0;
  gameTime =
    performance.now() + (serverTimeOffset !== false ? serverTimeOffset : 0);
  frameCounter++;

  const ownGroup = cache.getGroup(fleetID);
  if (ownGroup?.renderer?.ships) {
    const shipCount = ownGroup.renderer.ships.length;
    if (fleetSizeDisplay && currentFleetSize !== shipCount) {
      currentFleetSize = shipCount;
      fleetSizeDisplay.innerText = String(shipCount);
    }
  }

  const position = currentCameraPosition;

  if (view && view.camera) {
    const positionA = interpolator.projectObject(view.camera, gameTime);
    position.x = positionA.x * (1 - cameraDrag) + lastCamera.x * cameraDrag;
    position.y = positionA.y * (1 - cameraDrag) + lastCamera.y * cameraDrag;

    lastCamera.x = position.x;
    lastCamera.y = position.y;

    camera.moveTo(position);
    camera.zoomTo(zoom);
  } else {
    position.x = 0;
    position.y = 0;
  }
  container.pivot.x = position.x - zoom / 2;
  container.pivot.y = position.y - (zoom / 2) * (9 / 16);
  container.position.x = container.position.x;
  container.position.y = container.position.y;

  renderer.draw(cache, interpolator, gameTime, ownFleetID, isSpectating);
  background.updateFocus(position);
  background.draw();
  minimap.checkDisplay();

  if (lastPosition) {
    lastPosition.x = position.x;
    lastPosition.y = position.y;
  } else {
    lastPosition = new Vector2(position.x, position.y);
  }

  if (dangerZoneWarning) {
    if (
      (Math.abs(position.x) > worldSize || Math.abs(position.y) > worldSize) &&
      document.body.classList.contains("alive")
    ) {
      dangerZoneWarning.style.display = "block";
    } else {
      dangerZoneWarning.style.display = "none";
    }
  }

  log.check();
  // cooldown.draw();

  if (Controls.mouseX) {
    if (
      Controls.numUp ||
      Controls.numUpRight ||
      Controls.numRight ||
      Controls.numDownRight ||
      Controls.numDown ||
      Controls.numDownLeft ||
      Controls.numLeft ||
      Controls.numUpLeft ||
      keyboardSteering
    ) {
      let i = 0;
      if (Controls.numUp) {
        angle = mergeSet(angle, (3 * Math.PI) / 2, i);
        i++;
      }
      if (Controls.numUpRight) {
        angle = mergeSet(angle, (7 * Math.PI) / 4, i);
        i++;
      }
      if (Controls.numRight) {
        angle = mergeSet(angle, 0, i);
        i++;
      }
      if (Controls.numDownRight) {
        angle = mergeSet(angle, Math.PI / 4, i);
        i++;
      }
      if (Controls.numDown) {
        angle = mergeSet(angle, Math.PI / 2, i);
        i++;
      }
      if (Controls.numDownLeft) {
        angle = mergeSet(angle, (3 * Math.PI) / 4, i);
        i++;
      }
      if (Controls.numLeft) {
        angle = mergeSet(angle, Math.PI, i);
        i++;
      }
      if (Controls.numUpLeft) {
        angle = mergeSet(angle, (5 * Math.PI) / 4, i);
        i++;
      }
      aimTarget.x = d * Math.cos(angle);
      aimTarget.y = d * Math.sin(angle);
      keyboardSteering = true;
    } else {
      mouseScreenPos.x = Controls.mouseX;
      mouseScreenPos.y = Controls.mouseY;
      camera.screenToWorld(mouseScreenPos, mouseWorldPos);
      angle = Controls.angle;
      aimTarget.x = Settings.mouseScale * (mouseWorldPos.x - position.x);
      aimTarget.y = Settings.mouseScale * (mouseWorldPos.y - position.y);
    }
  }

  if (CustomData !== lastCustomData) {
    lastCustomData = CustomData;

    for (let i = 0; i < spotSprites.length; i++) {
      const sprite = spotSprites[i];
      if (sprite) container.removeChild(sprite);
    }

    spotSprites = [];

    //graphics.clear();

    if (CustomData) {
      const data = JSON.parse(CustomData);
      /*if (data.spots)
            {
                for (let i=0; i<data.spots.length; i++)
                {
                    let spot = data.spots[i];
                    let texture = textures["obstacle"];
                    if (texture) {
                        let sprite = new PIXI.Sprite(texture);
                        sprite.position.x = spot.X;
                        sprite.position.y = spot.Y;
                        sprite.scale.set(0.1, 0.1);

                        container.addChild(sprite);

                        spotSprites.push(sprite);
                    } else console.log("cannot find texture");
                }
            }*/
    }
  }
});

document.body.classList.remove("loading");

function parseQuery(queryString: string): Record<string, string> {
  const query: Record<string, string> = {};
  const pairs = (
    queryString[0] === "?" ? queryString.substring(1) : queryString
  ).split("&");
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]?.split("=");
    if (pair && pair[0]) {
      query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
    }
  }
  return query;
}

const query = parseQuery(window.location.search);
if (query["spectate"] && query["spectate"] !== "0") {
  startSpectate(true);
}

canvas.onmousemove = function () {
  keyboardSteering = false;
};

// clicking enter in nick causes fleet spawn
document.getElementById("nick")?.addEventListener("keyup", function (e) {
  if (e.keyCode === 13) {
    doSpawn();
  }
});

// clicking enter in spectate mode causes fleet spawn
document.body.addEventListener("keydown", function (e) {
  if (document.body.classList.contains("spectating") && e.keyCode === 13) {
    doSpawn();
  }
});

// toggle worlds with W
const worlds = document.getElementById("worlds");
document.body.addEventListener("keydown", function (e) {
  if (
    document.body.classList.contains("dead") &&
    document.getElementById("nick") !== document.activeElement &&
    e.keyCode === 87 &&
    worlds
  ) {
    if (worlds.classList.contains("closed")) {
      worlds.classList.remove("closed");
    } else {
      worlds.classList.add("closed");
    }
  }
});

document.getElementById("wcancel")?.addEventListener("click", function () {
  worlds?.classList.add("closed");
});

function mergeSet(a0: number, a: number, i: number): number {
  let ret = (a0 * i + a) / (i + 1);
  if (Math.abs(a - a0) > Math.PI) {
    ret += Math.PI;
  }
  return ret;
}

const shakingElements: HTMLElement[] = [];

export function shake(
  element: HTMLElement,
  magnitude = 16,
  angular = false,
): void {
  let tiltAngle = 1;
  let counter = 1;
  const numberOfShakes = 15;

  const startX = 0;
  const startY = 0;
  const startAngle = 0;
  const magnitudeUnit = magnitude / numberOfShakes;

  const randomInt = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  if (shakingElements.indexOf(element) === -1) {
    shakingElements.push(element);

    if (angular) {
      angularShake();
    } else {
      upAndDownShake();
    }
  }

  function upAndDownShake(): void {
    if (counter < numberOfShakes) {
      element.style.transform = "translate(" + startX + "px, " + startY + "px)";
      magnitude -= magnitudeUnit;

      const randomX = randomInt(-magnitude, magnitude);
      const randomY = randomInt(-magnitude, magnitude);

      element.style.transform =
        "translate(" + randomX + "px, " + randomY + "px)";
      counter += 1;

      requestAnimationFrame(upAndDownShake);
    }

    if (counter >= numberOfShakes) {
      element.style.transform = "translate(" + startX + ", " + startY + ")";
      shakingElements.splice(shakingElements.indexOf(element), 1);
    }
  }

  function angularShake(): void {
    if (counter < numberOfShakes) {
      element.style.transform = "rotate(" + startAngle + "deg)";
      magnitude -= magnitudeUnit;

      const angle = Number(magnitude * tiltAngle).toFixed(2);
      element.style.transform = "rotate(" + angle + "deg)";
      counter += 1;
      tiltAngle *= -1;

      requestAnimationFrame(angularShake);
    }

    if (counter >= numberOfShakes) {
      element.style.transform = "rotate(" + startAngle + "deg)";
      shakingElements.splice(shakingElements.indexOf(element), 1);
    }
  }
}
