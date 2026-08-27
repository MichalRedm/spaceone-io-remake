import { escapeHtml } from "../ui/leaderboard";
import { pressPopup } from "../ui/popupUtils";
import { ArenaLink } from "./arenaLink";

const arenaLinkHelper = new ArenaLink();

export interface WorldInfo {
  world: string;
  name: string;
  description: string;
  instructions?: string;
  players?: number;
  image?: string;
  arenaID?: string;
  arenaKey?: string;
  [key: string]: unknown;
}

export interface LobbyCallbacksType {
  onLobbyClose: (() => void) | null;
  onWorldJoin: ((worldKey: string, worldInfo?: WorldInfo) => void) | null;
  joinWorld: ((worldKey: string) => void) | null;
}

const worlds = document.getElementById("worlds");
const worldList = document.getElementById("worldList");

let allWorlds: Record<string, WorldInfo> | null = null;
let lastKeys: string | null = null;

function selectRow(selectedWorld: string | null): void {
  if (!allWorlds) return;
  for (const world in allWorlds) {
    const row = document.getElementById(`${world}_row`);
    if (row) {
      if (world === selectedWorld) row.classList.add("selected");
      else row.classList.remove("selected");
    }
  }
}

const rawWorldImgs = import.meta.glob("../img/worlds/*.png", {
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

    options += `<tbody id="${safeWorld}_row" world="${safeWorld}" class="worldrow">`;
    options +=
      `<tr>` +
      `<td><button class="button1 button3" id="join">Join</button> (<span id="${safeWorld}_playercount">${safePlayers}</span>)</td>` +
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
    const countEl = document.getElementById(`${world.world}_playercount`);
    if (countEl) countEl.textContent = String(world.players ?? 0);
    const row = document.getElementById(`${world.world}_row`);
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
              const urlTarget = arenaLinkHelper.getArenaIDFromURL();

              if (urlTarget) {
                // Search for world by arenaID or world key
                const matchedWorld = response.find(
                  (w: WorldInfo) =>
                    (w.arenaID &&
                      w.arenaID.toLowerCase() === urlTarget.toLowerCase()) ||
                    (w.arenaKey &&
                      w.arenaKey.toLowerCase() === urlTarget.toLowerCase()) ||
                    w.world === urlTarget ||
                    w.world
                      ?.toLowerCase()
                      .endsWith("/" + urlTarget.toLowerCase()),
                );

                if (matchedWorld) {
                  joinWorld(matchedWorld.world);
                } else {
                  // Invalid arena link provided in URL!
                  pressPopup("invalidArena");

                  // Fallback to default world
                  let defaultWorldKey = hostName + "/" + world;
                  const defaultMatched = response.find(
                    (w: WorldInfo) =>
                      w.world === defaultWorldKey ||
                      w.world?.endsWith("/" + world),
                  );
                  if (defaultMatched) {
                    defaultWorldKey = defaultMatched.world;
                  } else if (response[0]?.world) {
                    defaultWorldKey = response[0].world;
                  }

                  joinWorld(defaultWorldKey);
                }
              } else {
                let targetWorldKey = hostName + "/" + world;
                if (
                  response &&
                  Array.isArray(response) &&
                  response.length > 0
                ) {
                  const matched = response.find(
                    (w: WorldInfo) =>
                      w.world === targetWorldKey ||
                      w.world?.endsWith("/" + world),
                  );
                  if (matched) {
                    targetWorldKey = matched.world;
                  } else if (response[0]?.world) {
                    targetWorldKey = response[0].world;
                  }
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
  if (LobbyCallbacks.onWorldJoin)
    LobbyCallbacks.onWorldJoin(
      worldKey,
      allWorlds ? allWorlds[worldKey] : undefined,
    );
  hide();
}

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
