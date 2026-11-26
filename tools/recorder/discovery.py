"""HTTP discovery client for live worlds and active player/bot targets."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TargetSpec:
    """Resolved recording target descriptor."""

    mode: str  # "player" | "name" | "fleet" | "leader" | "auto" | "point"
    observe_control: str
    label: str
    pov: bool
    viewport_radius: int = 2000
    target_value: str | None = None
    fleet_id: int | None = None
    player_name: str | None = None
    player_id: str | None = None


def normalize_server_url(server: str) -> str:
    """Normalizes a base HTTP server URL (e.g. `localhost:5000` -> `http://localhost:5000`)."""
    url = server.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = f"http://{url}"
    return url


def http_to_ws_url(server: str, world: str, observer: bool = True) -> str:
    """Builds the WebSocket endpoint URL for `/api/v1/connect`."""
    parsed = urllib.parse.urlparse(normalize_server_url(server))
    scheme = "wss" if parsed.scheme == "https" else "ws"
    query = urllib.parse.urlencode(
        {"world": world, "observer": "1"} if observer else {"world": world}
    )
    return f"{scheme}://{parsed.netloc}/api/v1/connect?{query}"


def _fetch_json(url: str, timeout: float = 5.0) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _unwrap_api_response(payload: Any) -> Any:
    if isinstance(payload, dict) and "response" in payload:
        return payload["response"]
    return payload


def fetch_worlds(server: str, timeout: float = 5.0) -> list[dict[str, Any]]:
    """Queries `GET /api/v1/world/all`."""
    base = normalize_server_url(server)
    raw = _fetch_json(f"{base}/api/v1/world/all?_t={int(time.time() * 1000)}", timeout)
    data = _unwrap_api_response(raw)
    return data if isinstance(data, list) else []


def fetch_world_hook(
    server: str, world: str = "default", timeout: float = 5.0
) -> dict[str, Any] | None:
    """Queries `GET /api/v1/world/hook` for the target world."""
    base = normalize_server_url(server)
    q = urllib.parse.urlencode({"worldName": world})
    try:
        raw = _fetch_json(f"{base}/api/v1/world/hook?{q}", timeout)
        data = _unwrap_api_response(raw)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def fetch_players(
    server: str,
    world: str = "default",
    include_observers: bool = False,
    timeout: float = 5.0,
) -> list[dict[str, Any]]:
    """Queries `GET /api/v1/server/players` for active players and bots."""
    base = normalize_server_url(server)
    params = {"worldName": world}
    if include_observers:
        params["includeObservers"] = "true"
    q = urllib.parse.urlencode(params)
    raw = _fetch_json(f"{base}/api/v1/server/players?{q}", timeout)
    data = _unwrap_api_response(raw)
    return data if isinstance(data, list) else []


def _format_observe_control(
    core: str,
    pov: bool,
    viewport_radius: int,
) -> str:
    parts = [core, f"pov={'1' if pov else '0'}"]
    if viewport_radius != 2000:
        parts.append(f"radius={max(1000, min(6000, int(viewport_radius)))}")
    return ";".join(parts)


def build_target_spec(
    mode: str,
    value: str | None = None,
    pov: bool | None = None,
    viewport_radius: int = 2000,
    matched_player: dict[str, Any] | None = None,
) -> TargetSpec:
    """Constructs a `TargetSpec` and canonical `observe:...` command."""
    resolved_pov = (
        pov if pov is not None else mode in ("player", "name", "fleet")
    )

    if mode == "player":
        assert value
        core = f"observe:player:{value}"
        label = matched_player.get("name") if matched_player else value[:8]
        return TargetSpec(
            mode="player",
            observe_control=_format_observe_control(core, resolved_pov, viewport_radius),
            label=str(label or value[:8]),
            pov=resolved_pov,
            viewport_radius=viewport_radius,
            target_value=value,
            player_id=str(matched_player.get("playerID") or value)
            if matched_player
            else value,
            player_name=matched_player.get("name") if matched_player else None,
            fleet_id=matched_player.get("fleetID") if matched_player else None,
        )

    if mode == "name":
        assert value
        encoded = urllib.parse.quote(value, safe="")
        core = f"observe:name:{encoded}"
        return TargetSpec(
            mode="name",
            observe_control=_format_observe_control(core, resolved_pov, viewport_radius),
            label=value,
            pov=resolved_pov,
            viewport_radius=viewport_radius,
            target_value=value,
            player_id=matched_player.get("playerID") if matched_player else None,
            player_name=str(matched_player.get("name") or value)
            if matched_player
            else value,
            fleet_id=matched_player.get("fleetID") if matched_player else None,
        )

    if mode == "fleet":
        assert value
        fid = int(value)
        core = f"observe:fleet:{fid}"
        label = (
            str(matched_player.get("name"))
            if matched_player and matched_player.get("name")
            else f"fleet_{fid}"
        )
        return TargetSpec(
            mode="fleet",
            observe_control=_format_observe_control(core, resolved_pov, viewport_radius),
            label=label,
            pov=resolved_pov,
            viewport_radius=viewport_radius,
            target_value=str(fid),
            fleet_id=fid,
            player_id=matched_player.get("playerID") if matched_player else None,
            player_name=matched_player.get("name") if matched_player else None,
        )

    if mode == "leader":
        return TargetSpec(
            mode="leader",
            observe_control=_format_observe_control(
                "observe:leader", resolved_pov, viewport_radius
            ),
            label="leader",
            pov=resolved_pov,
            viewport_radius=viewport_radius,
        )

    if mode == "point":
        assert value
        core = f"observe:point:{value}"
        return TargetSpec(
            mode="point",
            observe_control=_format_observe_control(core, False, viewport_radius),
            label=f"point_{value.replace(',', '_')}",
            pov=False,
            viewport_radius=viewport_radius,
            target_value=value,
        )

    return TargetSpec(
        mode="auto",
        observe_control=_format_observe_control(
            "observe:auto", resolved_pov, viewport_radius
        ),
        label="spectator",
        pov=resolved_pov,
        viewport_radius=viewport_radius,
    )


def find_matching_player(
    players: list[dict[str, Any]],
    mode: str,
    value: str,
) -> dict[str, Any] | None:
    """Finds the best matching player entry from `/api/v1/server/players`."""
    needle = value.strip().lower()
    if mode == "player":
        for p in players:
            pid = str(p.get("playerID") or "").lower()
            if pid == needle:
                return p
        for p in players:
            pid = str(p.get("playerID") or "").lower()
            if pid.startswith(needle):
                return p
        return None

    if mode == "name":
        exact = [p for p in players if str(p.get("name") or "").strip().lower() == needle]
        if exact:
            exact.sort(key=lambda p: (not bool(p.get("isAlive")), -int(p.get("score") or 0)))
            return exact[0]
        prefix = [
            p for p in players if str(p.get("name") or "").strip().lower().startswith(needle)
        ]
        if prefix:
            prefix.sort(key=lambda p: (not bool(p.get("isAlive")), -int(p.get("score") or 0)))
            return prefix[0]
        return None

    if mode == "fleet":
        fid = int(value)
        for p in players:
            if int(p.get("fleetID") or 0) == fid:
                return p
        return None

    return None


def wait_for_matching_player(
    server: str,
    world: str,
    mode: str,
    value: str,
    timeout_sec: float,
    poll_interval: float = 0.25,
) -> dict[str, Any] | None:
    """Polls `/api/v1/server/players` until a matching target appears or timeout expires."""
    deadline = time.monotonic() + max(0.0, timeout_sec)
    while True:
        try:
            players = fetch_players(server, world)
            match = find_matching_player(players, mode, value)
            if match is not None:
                return match
        except Exception:
            pass

        if time.monotonic() >= deadline:
            return None
        time.sleep(poll_interval)
