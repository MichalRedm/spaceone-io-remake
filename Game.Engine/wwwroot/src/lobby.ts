import { fetch } from "whatwg-fetch";
import { escapeHtml } from "./leaderboard";

const worlds = document.getElementById("worlds");
const worldList = document.getElementById("worldList");

let allWorlds = null;
let lastKeys = null;

function selectRow(selectedWorld) {
  for (const world in allWorlds) {
    const row = document.getElementById(`${world}_row`);
    if (row) {
      if (world == selectedWorld) row.classList.add("selected");
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
function buildList(response) {
  if (allWorlds != null) {
    let keys = "";
    response.forEach((w) => (keys += ":" + w.world));

    if (lastKeys == keys) return updateList(response);
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
    worldRow.addEventListener("click", function (e) {
      const worldKey = this.getAttribute("world");

      if ((e.target as HTMLElement | null)?.tagName === "BUTTON")
        joinWorld(worldKey);
      else selectRow(worldKey);
    }),
  );
}

function updateList(response) {
  for (const world of response) {
    const countEl = document.getElementById(`${world.world}_playercount`);
    if (countEl) countEl.textContent = String(world.players ?? 0);
    const row = document.getElementById(`${world.world}_row`);
    if (row) {
      if (world.players > 0) row.classList.remove("empty");
      else row.classList.add("empty");
    }
  }
}

const controls = document.querySelector(".controls");
const social = document.querySelector(".social");
let showing = false;
let firstLoad = true;
var hostName = window.location.host || "localhost:5000";
var worldConnect = "default";
var manualHostSet = false;
var manualWorldSet = false;

if (firstLoad) {
  var url = new URL(window.location.href);
  var hostParam = url.searchParams.get("host");

  if (hostParam != null) {
    manualHostSet = true;
    hostName = hostParam;
  }

  var worldParam = url.searchParams.get("world");

  if (worldParam != null) {
    manualWorldSet = true;
    worldConnect = worldParam;
  }
}

export const LobbyCallbacks = {
  onLobbyClose: null,
  onWorldJoin: null,
  joinWorld: null,
};

LobbyCallbacks.joinWorld = function (worldKey) {
  refreshList(worldKey);
};

function refreshList(autoJoinWorld?: string | boolean) {
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
    .then(({ success, response }) => {
      var world = worldConnect;
      if (success) {
        buildList(response);

        if (autoJoin) {
          if (targetWorldParam) {
            joinWorld(targetWorldParam);
          } else if (window.location.hash && window.location.hash.length > 1) {
            const selected = window.location.hash.substring(1);
            joinWorld(selected);
          } else {
            var targetWorldKey = hostName + "/" + world;
            if (response && Array.isArray(response) && response.length > 0) {
              const matched = response.find(
                (w: any) =>
                  w.world === targetWorldKey || w.world?.endsWith("/" + world),
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
    });
}

function hide() {
  worlds.classList.add("closed");
  controls.classList.remove("blur");
  social.classList.remove("blur");
  document.body.classList.remove("lobby");
  showing = false;

  if (LobbyCallbacks.onLobbyClose) LobbyCallbacks.onLobbyClose();
}

function show() {
  controls.classList.add("blur");
  social.classList.add("blur");
  document.body.classList.add("lobby");
  showing = true;
}

function joinWorld(worldKey) {
  if (LobbyCallbacks.onWorldJoin)
    LobbyCallbacks.onWorldJoin(worldKey, allWorlds[worldKey]);
  hide();
}

export function toggleLobby() {
  if (!showing) show();
  else hide();
}

document.getElementById("wcancel").addEventListener("click", (e) => {
  if (showing) hide();
});

document.getElementById("arenas").addEventListener("click", (e) => {
  show();
  refreshList(false);
  worlds.classList.remove("closed");
  e.preventDefault();
  return false;
});

refreshList(false);
setInterval(refreshList, 1000);
