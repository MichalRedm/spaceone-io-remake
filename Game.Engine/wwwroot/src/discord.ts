import Cookies from "js-cookie";

const dauth = document.getElementById("dauth");
if (dauth) {
  dauth.addEventListener("click", () => {
    window.location.assign(
      `https://discord.com/api/oauth2/authorize?response_type=token&client_id=514844767511642112&scope=identify&redirect_uri=${encodeURIComponent(window.location.origin)}`,
    );
  });
}

const secondsToDays = 60 * 60 * 24;
const sp = new URLSearchParams(window.location.hash.substr(1));
export function getToken() {
  return token;
}
let token = sp.get("access_token") || Cookies.get("auth_token");
if (token) {
  history.pushState({}, "", "/");
  if (dauth) {
    dauth.style.display = "none";
    const prev = dauth.previousElementSibling as HTMLButtonElement | null;
    if (prev) prev.value = "Launch";
  }

  if (sp.get("access_token")) {
    let expirationSeconds = parseFloat(sp.get("expires_in") || "0");
    let cookieOptions = { expires: expirationSeconds / secondsToDays };
    Cookies.set("auth_token", token, cookieOptions);
  }
} else if (window.frameElement) {
  if (dauth) {
    const prev = dauth.previousElementSibling as HTMLButtonElement | null;
    if (prev) prev.value = "Launch";
    dauth.style.display = "none";
  }
}

if (token) {
  fetch("https://discordapp.com/api/users/@me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).then((r) => {
    if (!r.ok) {
      Cookies.remove("auth_token");
    }
  });
}
