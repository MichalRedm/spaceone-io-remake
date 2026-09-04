/**
 * @file Arena browser, lobby modal UI, and world discovery coordinator.
 * @module network/lobby
 */

import { escapeHtml } from "../ui/leaderboard";
import { pressPopup, closePopup } from "../ui/popupUtils";
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

let allWorlds: Record<string, WorldInfo> | null = null;
let lastKeys: string | null = null;
let currentJoinedWorldKey: string | null = null;

function getModeTheme(world: WorldInfo): {
  icon: string;
  defaultDesc: string;
} {
  const mode = (world.gameMode || world.worldKey || "ffa").toLowerCase();
  if (mode.includes("robo")) {
    return {
      icon: "fa-robot",
      defaultDesc:
        "Battle against adaptive AI combat drones. Ideal for practicing aim, fleet steering, and dash mechanics.",
    };
  }
  if (mode.includes("ctf")) {
    return {
      icon: "fa-flag",
      defaultDesc:
        "Team-based tactical warfare. Infiltrate the enemy base, steal their flag, and defend your own. First to 5 wins!",
    };
  }
  if (mode.includes("team")) {
    return {
      icon: "fa-users",
      defaultDesc:
        "Two teams clash in deep space. Coordinate with teammates (Blue vs. Red) to wipe out the opposition.",
    };
  }
  if (mode.includes("duel")) {
    return {
      icon: "fa-bolt",
      defaultDesc:
        "Intense 1v1 fleet duel. Test your combat reflexes and dogfighting skills in an enclosed arena.",
    };
  }
  return {
    icon: "fa-crosshairs",
    defaultDesc:
      "Classic free-for-all space combat. Destroy enemy fleets, collect stars, and dominate the leaderboard.",
  };
}

function cleanText(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/<[^>]*>?/gm, "").trim();
}

function updateSelectorPill(worldInfo?: WorldInfo): void {
  const nameEl = document.getElementById("world-selector-name");
  const playersEl = document.getElementById("world-selector-players");
  if (!nameEl || !playersEl) return;

  if (worldInfo) {
    nameEl.textContent =
      worldInfo.name || worldInfo.worldKey?.toUpperCase() || "FFA";
    const count = worldInfo.players ?? 0;
    playersEl.textContent = `${count} Online`;
    playersEl.classList.toggle("world-selector__badge--has-players", count > 0);
  }
}

function highlightSelectedCard(selectedWorldKey: string | null): void {
  if (!allWorlds) return;
  for (const wKey in allWorlds) {
    const safeKey = escapeHtml(wKey);
    const card = document.getElementById(`world-card-${safeKey}`);
    const statusEl = document.getElementById(`world-status-${safeKey}`);
    if (card) {
      const isSelected = wKey === selectedWorldKey;
      card.classList.toggle("world-card--selected", isSelected);
      if (statusEl) {
        statusEl.innerHTML = isSelected
          ? '<i class="fas fa-check"></i> ACTIVE'
          : "JOIN &rarr;";
        statusEl.classList.toggle("world-card__status--current", isSelected);
      }
    }
  }
}

function buildList(response: WorldInfo[]): void {
  if (allWorlds != null) {
    let keys = "";
    response.forEach((w) => (keys += ":" + w.world));

    if (lastKeys === keys) return updateList(response);
    else lastKeys = keys;
  }

  allWorlds = {};

  let html = "";
  for (const world of response) {
    allWorlds[world.world] = world;

    const safeWorld = escapeHtml(world.world);
    const safeName = escapeHtml(world.name);
    const { icon, defaultDesc } = getModeTheme(world);
    const cleanedDesc = cleanText(world.description);
    const displayDesc =
      cleanedDesc &&
      cleanedDesc.length > 15 &&
      !cleanedDesc.toLowerCase().startsWith("blue vs. red") &&
      cleanedDesc !== "FFA Arena"
        ? cleanedDesc
        : defaultDesc;

    const playersCount = world.players ?? 0;
    const isSelected = world.world === currentJoinedWorldKey;

    html += `
      <div id="world-card-${safeWorld}" class="world-card ${isSelected ? "world-card--selected" : ""} ${playersCount === 0 ? "world-card--empty" : ""}" data-world="${safeWorld}">
        <div class="world-card__header">
          <div class="world-card__title">
            <i class="fas ${icon}"></i> ${safeName}
          </div>
        </div>
        <div class="world-card__body">
          <p class="world-card__desc">${escapeHtml(displayDesc)}</p>
        </div>
        <div class="world-card__footer">
          <span class="world-card__players ${playersCount > 0 ? "world-card__players--active" : ""}">
            <i class="fas fa-users"></i> <span id="world-count-${safeWorld}">${playersCount}</span> online
          </span>
          <span id="world-status-${safeWorld}" class="world-card__status ${isSelected ? "world-card__status--current" : ""}">
            ${isSelected ? '<i class="fas fa-check"></i> ACTIVE' : "JOIN &rarr;"}
          </span>
        </div>
      </div>
    `;
  }

  const container = document.getElementById("worlds-grid");
  if (container) {
    container.innerHTML = html;

    container.querySelectorAll(".world-card").forEach((card) => {
      card.addEventListener("click", () => {
        const worldKey = card.getAttribute("data-world");
        if (worldKey) {
          joinWorld(worldKey);
        }
      });
    });
  }

  if (currentJoinedWorldKey && allWorlds[currentJoinedWorldKey]) {
    updateSelectorPill(allWorlds[currentJoinedWorldKey]);
  }
}

function updateList(response: WorldInfo[]): void {
  for (const world of response) {
    if (allWorlds) allWorlds[world.world] = world;
    const safeWorld = escapeHtml(world.world);
    const countEl = document.getElementById(`world-count-${safeWorld}`);
    if (countEl) countEl.textContent = String(world.players ?? 0);

    const card = document.getElementById(`world-card-${safeWorld}`);
    if (card) {
      const hasPlayers = (world.players ?? 0) > 0;
      card.classList.toggle("world-card--empty", !hasPlayers);
      const playersContainer = card.querySelector(".world-card__players");
      if (playersContainer) {
        playersContainer.classList.toggle(
          "world-card__players--active",
          hasPlayers,
        );
      }
    }
  }

  if (currentJoinedWorldKey && allWorlds && allWorlds[currentJoinedWorldKey]) {
    updateSelectorPill(allWorlds[currentJoinedWorldKey]);
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
  closePopup("worlds");
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
  pressPopup("worlds");
  refreshList(false);
  startPolling();
}

function joinWorld(worldKey: string): void {
  currentJoinedWorldKey = worldKey;
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

  updateSelectorPill(worldInfo);
  highlightSelectedCard(worldKey);

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

window.addEventListener("spaceone:popup-opened", (e: Event) => {
  const customEvent = e as CustomEvent<{ popup?: string }>;
  if (customEvent.detail?.popup === "worlds") {
    if (!showing) {
      controls?.classList.add("blur");
      social?.classList.add("blur");
      document.body.classList.add("lobby");
      showing = true;
      refreshList(false);
      startPolling();
    }
  }
});

window.addEventListener("spaceone:popup-closed", (e: Event) => {
  const customEvent = e as CustomEvent<{ popup?: string }>;
  if (customEvent.detail?.popup === "worlds") {
    if (showing) {
      controls?.classList.remove("blur");
      social?.classList.remove("blur");
      document.body.classList.remove("lobby");
      showing = false;
      stopPolling();
      if (LobbyCallbacks.onLobbyClose) LobbyCallbacks.onLobbyClose();
    }
  }
});

refreshList(false);
