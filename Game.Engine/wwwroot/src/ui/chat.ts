/**
 * @file In-game quick emoji chat hotkey menu and active speech dispatcher.
 * @module ui/chat
 */

/**
 * Active chat message payload.
 */
export interface ChatMessage {
  /** Chat message text or emoji string. */
  txt: string;
  /** Timestamp when message was triggered in milliseconds. */
  time: number;
}

/** Active outbound chat message state transmitted in control frames. */
export const message: ChatMessage = {
  txt: "",
  time: Date.now(),
};

const chat = document.getElementById("chat");
const messages = ["✅", "❌", "⁉️", "👋", "☠️", "👑", "👈", "👉", "👆", "👇"];
if (chat) {
  for (let i = 0; i < messages.length; i++) {
    chat.innerHTML += `<tr><td>${i < 9 ? 1 + ~~i : 0}</td><td>${messages[i]}</td></tr>`;
  }
}

window.addEventListener("keydown", (e) => {
  if (e.keyCode === 84 && document.body.classList.contains("alive")) {
    chat?.classList.toggle("open");
  }
  if (
    e.keyCode < 58 &&
    e.keyCode > 47 &&
    document.body.classList.contains("alive")
  ) {
    message.txt =
      messages[e.keyCode - 49] || messages[messages.length - 1] || "";
    message.time = Date.now();
    chat?.classList.remove("open");
  }
});
