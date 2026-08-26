import Cookies from "js-cookie";
import { Settings } from "./settings";
import { escapeHtml } from "./leaderboard";
const log = document.getElementById("log");
const bigLog = document.getElementById("bigLog");
const scoreCon = document.getElementById("plusScoreContainer");
const comboMsg = document.getElementById("comboMessage");

export class Log {
  data: Array<{ time: Date; entry: any }>;
  lastDisplay: any;
  constructor() {
    this.data = [];
    this.lastDisplay = false;
  }

  addEntry(entry) {
    this.data.push({ time: new Date(), entry });
    while (this.data.length > Settings.logLength) this.data.shift();

    this.lastDisplay = performance.now();

    let out = "<table>";

    for (const slot of this.data) {
      out +=
        "<tr>" +
        `<td><b style="color:gray">${slot.time.toLocaleTimeString()}</b></td>` +
        `<td>${escapeHtml(slot.entry.text)}</td>`;

      if (slot.entry.extraData && slot.entry.extraData.ping)
        out += `<td><b style="color:gray">${slot.entry.extraData.ping.you}ms/${slot.entry.extraData.ping.them}ms</b></td>`;
      else out += "<td></td>";

      if (
        slot.entry.extraData &&
        slot.entry.extraData.stats &&
        slot.entry.extraData.stats.deaths > 0
      )
        out += `<td><b style="color:gray">k/d: ${slot.entry.extraData.stats.kills / slot.entry.extraData.stats.deaths}</b></td>`;
      else out += "<td></td>";

      out += "</tr>";
    }

    out += "</table>";

    if (log) log.innerHTML = out;

    let lastData = this.data[this.data.length - 1].entry;
    /*
        var lastDataArr = lastData.split(" - ");

        var score = lastDataArr[1];
        lastData = lastDataArr.join(" - ");
        if (score[0] === "+") {
            scoreCon.insertAdjacentHTML("beforeend", "<div class='plusScore'>" + score + "</div>");
        }*/

    var lastMsg = "";
    if (lastData.type == "kill") {
      lastMsg = (lastData.text || "") + "!";
      if (scoreCon) {
        scoreCon.insertAdjacentHTML(
          "beforeend",
          "<div class='plusScore'>+" +
            escapeHtml(String(lastData.pointsDelta)) +
            "</div>",
        );
      }
    } else if (lastData.type == "killed") {
      deathStats(lastData);
    } else {
      if (lastData.type === "universeDeath") {
        deathStats(lastData);
      }
      return;
    }
    if (bigLog) bigLog.textContent = lastMsg;

    if (
      comboMsg &&
      lastData.extraData &&
      lastData.extraData.combo !== undefined &&
      lastData.extraData.combo.text !== ""
    ) {
      comboMsg.textContent = `${lastData.extraData.combo.text} +${lastData.extraData.combo.score}`;
    }

    /*
		scoreCon.insertAdjacentHTML("beforeend", "<div class='plusScore'>" + lastData.pointsDelta + "</div>");
		comboMsg.innerHTML = lastData.extraData.combo;*/
  }

  check() {
    const time = performance.now() - this.lastDisplay;
    if (time > 6000 && log) {
      log.textContent = "";
    }

    if (time > 3000 && bigLog) {
      bigLog.textContent = "";
    }

    if (time > 2000 && comboMsg) {
      comboMsg.textContent = "";
    }
  }
}

function deathStats(lastData) {
  const deathScreen = document.getElementById("deathScreen");
  if (deathScreen) deathScreen.style.visibility = "visible";
  const scoreEl = document.getElementById("deathScreenScore");
  if (scoreEl) scoreEl.textContent = String(lastData.extraData.score);
  updateHighscore(lastData.extraData.score);
  console.log("Died with score " + lastData.extraData.score);
  const killsEl = document.getElementById("deathScreenKills");
  if (killsEl) killsEl.textContent = String(lastData.extraData.kills);
  var gameTimeInSeconds = Math.round(lastData.extraData.gameTime / 1000),
    gameTimeMinutes = Math.floor(gameTimeInSeconds / 60),
    gameTimeSeconds = gameTimeInSeconds - 60 * gameTimeMinutes;
  const timeEl = document.getElementById("deathScreenGameTime");
  if (timeEl) {
    if (gameTimeMinutes === 0) {
      timeEl.textContent = `${gameTimeSeconds}sec`;
    } else {
      timeEl.textContent = `${gameTimeMinutes}min ${gameTimeSeconds}sec`;
    }
  }
  const comboEl = document.getElementById("deathScreenMaxKillStreak");
  if (comboEl) comboEl.textContent = String(lastData.extraData.maxCombo);
}

updateHighscore(0);

function updateHighscore(score) {
  var currentHighscore = Number(Cookies.get("highscore") ?? 0);
  if (score >= currentHighscore) {
    Cookies.set("highscore", score);
  }
  if (score > currentHighscore) {
    console.log("New personal highscore!");
  }
  const highScoreEl = document.getElementById("high-score-num");
  if (highScoreEl) {
    highScoreEl.textContent = String(Cookies.get("highscore") ?? 0);
  }
}
