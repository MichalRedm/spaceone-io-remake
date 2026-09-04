/**
 * @file Arena browser, lobby modal UI, and world discovery coordinator.
 * @module network/lobby
 */

import { escapeHtml } from "../ui/leaderboard";
import { pressPopup } from "../ui/popupUtils";
import { ArenaLink } from "./arenaLink";

const arenaLinkHelper = new ArenaLink();

/**
 * Metadata descriptor for an active game world or custom arena.
 */
export interface WorldInfo {
  /** Fully qualified world key (e.g. `'us.spaceone.io/default'`). */
  world: string;
  /** Display title of the world. */
  name: string;
  /** World gameplay description. */
  description: string;
  /** Custom instructions or mode details. */
  instructions?: string;
  /** Current active player count. */
  players?: number;
  /** Thumbnail image asset key. */
  image?: string;
  /** Short shareable arena identifier. */
  arenaID?: string;
  /** Case-insensitive arena match key. */
  arenaKey?: string;
  /** Canonical world key (e.g. 'robo', 'ctf', 'default'). */
  worldKey?: string;
  /** Gameplay ruleset mode (e.g. 'robo', 'ctf', 'team', 'duel', 'ffa'). */
  gameMode?: string;
  /** Whether the arena is private or unlisted. */
  isPrivate?: boolean;
  /** Allowed ship skin color themes. */
  allowedColors?: string[];
  [key: string]: unknown;
}

/**
 * Event callbacks emitted by the lobby browser.
 */
export interface LobbyCallbacksType {
  /** Fired when the lobby dialog is dismissed. */
  onLobbyClose: (() => void) | null;
  /** Fired when a player selects a world to join. */
  onWorldJoin: ((worldKey: string, worldInfo?: WorldInfo) => void) | null;
  /** Direct callback to trigger world join. */
  joinWorld: ((worldKey: string) => void) | null;
}

const worlds = document.getElementById("worlds");
const worldList = document.getElementById("world-list");

let allWorlds: Record<string, WorldInfo> | null = null;
let lastKeys: string | null = null;

function selectRow(selectedWorld: string | null): void {
  if (!allWorlds) return;
  for (const world in allWorlds) {
    const row = document.getElementById(`${world}-row`);
    if (row) {
      if (world === selectedWorld) row.classList.add("selected");
      else row.classList.remove("selected");
    }
  }
}

const rawWorldImgs = import.meta.glob("../../img/worlds/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const imgs: Record<string, string> = {};
for (const [path, url] of Object.entries(rawWorldImgs)) {
  const filenameWithExt = path.split("/").pop() || "";
  const filenameWithoutExt = filenameWithExt.replace(/\.[^/.]+$/, "");
  imgs[filenameWithExt] = url;
  imgs[filenameWithoutExt] = url;
}

function buildList(response: WorldInfo[]): void {
  if (allWorlds != null) {
    let keys = "";
    response.forEach((w) => (keys += ":" + w.world));

    if (lastKeys === keys) return updateList(response);
    else lastKeys = keys;
  }

  allWorlds = {};

  let options = "";
  for (const world of response) {
    allWorlds[world.world] = world;

    const safeWorld = escapeHtml(world.world);
    const safeName = escapeHtml(world.name);
    const safeDescription = escapeHtml(world.description);
    const safeInstructions = escapeHtml(world.instructions || "");
    const safePlayers = escapeHtml(String(world.players ?? 0));

    options += `<tbody id="${safeWorld}-row" world="${safeWorld}" class="worldrow">`;
    options +=
      `<tr>` +
      `<td><button class="button1 button3" id="join">Join</button> (<span id="${safeWorld}-playercount">${safePlayers}</span>)</td>` +
      `<td id="second-world-td"><b>${safeName}</b>: ${safeDescription}</td>` +
      `</tr>`;

    const img =
      world.image && imgs[world.image]
        ? `<img src="${imgs[world.image]}" />`
        : "";
    if (world.instructions || img)
      options += `<tr class="details"><td colspan="3">${img}${safeInstructions}</td></tr>`;
    options += `</tbody>`;
  }

  if (worldList) worldList.innerHTML = `${options}`;

  document.querySelectorAll(".worldrow").forEach((worldRow) =>
    worldRow.addEventListener("click", (e) => {
      const worldKey = worldRow.getAttribute("world");
      if (!worldKey) return;

      if ((e.target as HTMLElement | null)?.tagName === "BUTTON")
        joinWorld(worldKey);
      else selectRow(worldKey);
    }),
  );
}

function updateList(response: WorldInfo[]): void {
  for (const world of response) {
    const countEl = document.getElementById(`${world.world}-playercount`);
    if (countEl) countEl.textContent = String(world.players ?? 0);
    const row = document.getElementById(`${world.world}-row`);
    if (row) {
      if ((world.players ?? 0) > 0) row.classList.remove("empty");
      else row.classList.add("empty");
    }
  }
}

const controls = document.querySelector(".controls");
const social = document.querySelector(".social");
let showing = false;
let firstLoad = true;
let hostName = window.location.host || "localhost:5000";
let worldConnect = "default";
let manualHostSet = false;
let manualWorldSet = false;

if (firstLoad) {
  const url = new URL(window.location.href);
  const hostParam = url.searchParams.get("host");

  if (hostParam != null) {
    manualHostSet = true;
    hostName = hostParam;
  }

  const worldParam = url.searchParams.get("world");

  if (worldParam != null) {
    manualWorldSet = true;
    worldConnect = worldParam;
  }
}

export const LobbyCallbacks: LobbyCallbacksType = {
  onLobbyClose: null,
  onWorldJoin: null,
  joinWorld: null,
};

LobbyCallbacks.joinWorld = function (worldKey: string) {
  refreshList(worldKey);
};

function refreshList(autoJoinWorld?: string | boolean): void {
  if (!showing && !firstLoad && !autoJoinWorld) return;

  const autoJoin = firstLoad || !!autoJoinWorld;
  const targetWorldParam =
    typeof autoJoinWorld === "string" ? autoJoinWorld : null;

  firstLoad = false;

  fetch("/api/v1/world/all", {
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  })
    .then((r) => r.json())
    .then(
      ({ success, response }: { success: boolean; response: WorldInfo[] }) => {
        const world = worldConnect;
        if (success) {
          buildList(response);

          if (autoJoin) {
            if (targetWorldParam) {
              joinWorld(targetWorldParam);
            } else {
              const parsedRoute = arenaLinkHelper.parseArenaRouteFromURL();

              if (parsedRoute && parsedRoute.raw) {
                // Tier 1: Search for world by exact arenaID if specified
                let matchedWorld: WorldInfo | undefined;
                if (parsedRoute.arenaId) {
                  matchedWorld = response.find(
                    (w: WorldInfo) =>
                      (w.arenaID &&
                        w.arenaID.toLowerCase() ===
                          parsedRoute.arenaId?.toLowerCase()) ||
                      (w.arenaKey &&
                        w.arenaKey.toLowerCase() ===
                          parsedRoute.arenaId?.toLowerCase()),
                  );
                }

                // Tier 2: If exact arena not found or not specified, search by mode / worldKey
                if (!matchedWorld && parsedRoute.worldKey) {
                  const targetKey = parsedRoute.worldKey.toLowerCase();
                  matchedWorld = response.find(
                    (w: WorldInfo) =>
                      (w.worldKey && w.worldKey.toLowerCase() === targetKey) ||
                      (w.gameMode && w.gameMode.toLowerCase() === targetKey) ||
                      w.world?.toLowerCase().endsWith("/" + targetKey) ||
                      w.world?.toLowerCase() === targetKey,
                  );

                  // If we had a specific arenaId that expired, notify the user gracefully and update hash
                  if (matchedWorld && parsedRoute.arenaId) {
                    console.info(
                      `Arena ${parsedRoute.arenaId} has expired. Connecting to active ${matchedWorld.name} world.`,
                    );
                    arenaLinkHelper.updateURLHash(
                      matchedWorld.worldKey &&
                        matchedWorld.worldKey !== "default"
                        ? matchedWorld.worldKey
                        : "",
                    );
                  }
                }

                // Tier 3: If still not matched, check if raw matches a world
                if (!matchedWorld) {
                  const rawLower = parsedRoute.raw.toLowerCase();
                  matchedWorld = response.find(
                    (w: WorldInfo) =>
                      w.world?.toLowerCase() === rawLower ||
                      w.world?.toLowerCase().endsWith("/" + rawLower),
                  );
                }

                if (matchedWorld) {
                  joinWorld(matchedWorld.world);
                } else {
                  // Truly invalid or expired private arena
                  pressPopup("invalidArena");

                  // Fallback to preferred world from localStorage, or default
                  let preferredWorld: string | null = null;
                  try {
                    preferredWorld = localStorage.getItem(
                      "spaceone_preferred_world",
                    );
                  } catch {
                    // ignore localStorage errors
                  }

                  let fallbackWorld: WorldInfo | undefined;
                  if (preferredWorld) {
                    fallbackWorld = response.find(
                      (w: WorldInfo) =>
                        w.world === preferredWorld ||
                        w.worldKey === preferredWorld ||
                        w.world?.endsWith("/" + preferredWorld),
                    );
                  }

                  if (!fallbackWorld) {
                    const defaultWorldKey = hostName + "/" + world;
                    fallbackWorld =
                      response.find(
                        (w: WorldInfo) =>
                          w.world === defaultWorldKey ||
                          w.world?.endsWith("/" + world),
                      ) || response[0];
                  }

                  if (fallbackWorld) {
                    joinWorld(fallbackWorld.world);
                  }
                }
              } else {
                // No URL route provided: Check localStorage for preferred world, else default
                let targetWorldKey: string | undefined;
                let preferredWorld: string | null = null;
                try {
                  preferredWorld = localStorage.getItem(
                    "spaceone_preferred_world",
                  );
                } catch {
                  // ignore localStorage errors
                }

                let targetWorld: WorldInfo | undefined;
                if (preferredWorld) {
                  targetWorld = response.find(
                    (w: WorldInfo) =>
                      w.world === preferredWorld ||
                      w.worldKey === preferredWorld ||
                      w.world?.endsWith("/" + preferredWorld),
                  );
                }

                if (!targetWorld) {
                  const defaultWorldKey = hostName + "/" + world;
                  targetWorld =
                    response.find(
                      (w: WorldInfo) =>
                        w.world === defaultWorldKey ||
                        w.world?.endsWith("/" + world),
                    ) || response[0];
                }

                if (targetWorld) {
                  targetWorldKey = targetWorld.world;
                } else {
                  targetWorldKey = hostName + "/" + world;
                }

                joinWorld(targetWorldKey);
              }
            }
          }
        }
      },
    );
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (!pollTimer) {
    pollTimer = setInterval(refreshList, 1000);
  }
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function hide(): void {
  worlds?.classList.add("closed");
  controls?.classList.remove("blur");
  social?.classList.remove("blur");
  document.body.classList.remove("lobby");
  showing = false;
  stopPolling();

  if (LobbyCallbacks.onLobbyClose) LobbyCallbacks.onLobbyClose();
}

function show(): void {
  controls?.classList.add("blur");
  social?.classList.add("blur");
  document.body.classList.add("lobby");
  showing = true;
  refreshList(false);
  startPolling();
}

function joinWorld(worldKey: string): void {
  const worldInfo = allWorlds ? allWorlds[worldKey] : undefined;
  const canonicalKey =
    worldInfo?.worldKey ||
    (worldKey.includes("/") ? worldKey.split("/").pop() : worldKey);
  if (canonicalKey) {
    try {
      localStorage.setItem("spaceone_preferred_world", canonicalKey);
    } catch {
      // ignore localStorage write errors
    }
  }

  if (LobbyCallbacks.onWorldJoin)
    LobbyCallbacks.onWorldJoin(worldKey, worldInfo);
  hide();
}

/**
 * Toggles visibility of the worlds lobby modal overlay.
 */
export function toggleLobby(): void {
  if (!showing) show();
  else hide();
}

document.getElementById("wcancel")?.addEventListener("click", () => {
  if (showing) hide();
});

document.getElementById("arenas")?.addEventListener("click", (e) => {
  show();
  worlds?.classList.remove("closed");
  e.preventDefault();
  return false;
});

refreshList(false);
