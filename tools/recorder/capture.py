"""
Lightweight headless WebSocket observer capture writing lossless `.s1rec` / `.s1rec.gz` replays.
"""

from __future__ import annotations

import asyncio
import datetime
import signal
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import websockets

from .discovery import (
    TargetSpec,
    fetch_players,
    fetch_world_hook,
    find_matching_player,
    http_to_ws_url,
    normalize_server_url,
)
from .flatbuffers_wire import (
    AllMessages,
    build_net_control_input,
    build_net_ping,
    peek_quantum,
)
from .format import ReplayWriter


@dataclass
class CaptureConfig:
    """Configuration for a single `.s1rec` capture session."""

    server_url: str
    world: str
    target: TargetSpec
    output_path: Path
    compress: bool = False
    duration_sec: float = 0.0  # 0 = indefinite until stop trigger
    max_duration_sec: float = 3600.0  # safety cap (0 = unlimited)
    max_size_mb: float = 500.0  # safety cap (0 = unlimited)
    wait_for_spawn: bool = False
    stop_on_death: bool = False
    post_death_delay_sec: float = 1.5
    stop_on_disconnect: bool = False
    stop_sentinel_path: Path | None = None
    ping_interval_sec: float = 0.25


@dataclass
class CaptureResult:
    """Summary returned when a capture session finishes."""

    output_path: Path
    target_label: str
    frames_written: int
    bytes_written: int
    duration_ms: int
    stop_reason: str


async def capture_single(
    config: CaptureConfig,
    external_stop: asyncio.Event | None = None,
) -> CaptureResult:
    """Captures live `NetQuantum` server stream for a target into `.s1rec`."""
    server_url = normalize_server_url(config.server_url)
    ws_url = http_to_ws_url(server_url, config.world, observer=True)
    hook = await asyncio.to_thread(fetch_world_hook, server_url, config.world)

    header: dict[str, Any] = {
        "createdAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "serverUrl": server_url,
        "worldKey": config.world,
        "tracking": {
            "mode": config.target.mode,
            "target": config.target.target_value or config.target.label,
            "pov": config.target.pov,
            "viewportRadius": config.target.viewport_radius,
            "playerName": config.target.player_name,
            "playerId": config.target.player_id,
            "fleetId": config.target.fleet_id,
        },
    }
    if hook is not None:
        header["hook"] = hook

    # Never mutate caller's external_stop so one finishing worker cannot abort siblings.
    local_stop = asyncio.Event()
    stop_reason = "completed"
    max_bytes = (
        int(config.max_size_mb * 1024 * 1024) if config.max_size_mb > 0 else 0
    )

    ping_packet = build_net_ping(bandwidth_throttle=1000)
    observe_packet = build_net_control_input(
        spectate_control=config.target.observe_control
    )

    with ReplayWriter(config.output_path, header, compress=config.compress) as writer:
        async with websockets.connect(
            ws_url,
            max_size=4 * 1024 * 1024,
            ping_interval=None,
        ) as ws:
            await ws.send(ping_packet)
            await ws.send(observe_packet)

            recording_started = not config.wait_for_spawn
            start_mono = time.monotonic() if recording_started else 0.0
            seen_alive = False
            death_deadline_mono: float | None = None
            last_hook_packet: bytes | None = None
            last_leaderboard_packet: bytes | None = None
            latest_duration_ms = 0

            async def _ping_and_sentinel_loop() -> None:
                nonlocal stop_reason
                last_ping = 0.0
                last_player_check = 0.0
                seen_target_in_world = False
                while not local_stop.is_set():
                    if external_stop is not None and external_stop.is_set():
                        stop_reason = "interrupted"
                        local_stop.set()
                        break

                    now = time.monotonic()
                    if now - last_ping >= config.ping_interval_sec:
                        try:
                            await ws.send(ping_packet)
                            await ws.send(observe_packet)
                        except Exception:
                            break
                        last_ping = now

                    if (
                        config.stop_sentinel_path is not None
                        and config.stop_sentinel_path.exists()
                    ):
                        stop_reason = "manual_stop"
                        local_stop.set()
                        break

                    if (
                        config.stop_on_disconnect
                        and config.target.mode in ("player", "name", "fleet")
                        and now - last_player_check >= 1.5
                    ):
                        last_player_check = now
                        try:
                            players = await asyncio.to_thread(
                                fetch_players, server_url, config.world
                            )
                            monitor_mode = (
                                "player"
                                if config.target.mode == "fleet" and config.target.player_id
                                else config.target.mode
                            )
                            monitor_value = (
                                config.target.player_id
                                if monitor_mode == "player" and config.target.player_id
                                else config.target.target_value
                            )
                            matched = (
                                find_matching_player(players, monitor_mode, monitor_value)
                                if monitor_value
                                else None
                            )
                            if matched is not None:
                                seen_target_in_world = True
                            elif seen_target_in_world:
                                stop_reason = "target_disconnected"
                                local_stop.set()
                                break
                        except Exception:
                            pass

                    if recording_started:
                        elapsed_s = now - start_mono
                        if config.duration_sec > 0 and elapsed_s >= config.duration_sec:
                            stop_reason = "duration_reached"
                            local_stop.set()
                            break
                        if (
                            config.max_duration_sec > 0
                            and elapsed_s >= config.max_duration_sec
                        ):
                            stop_reason = "max_duration_reached"
                            local_stop.set()
                            break

                    if (
                        death_deadline_mono is not None
                        and now >= death_deadline_mono
                    ):
                        stop_reason = "target_died"
                        local_stop.set()
                        break

                    await asyncio.sleep(0.1)

            bg_task = asyncio.create_task(_ping_and_sentinel_loop())
            try:
                while not local_stop.is_set():
                    if external_stop is not None and external_stop.is_set():
                        stop_reason = "interrupted"
                        local_stop.set()
                        break

                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=0.25)
                    except asyncio.TimeoutError:
                        continue
                    except websockets.ConnectionClosed:
                        stop_reason = "server_closed"
                        break

                    if not isinstance(raw, (bytes, bytearray)):
                        continue
                    payload = bytes(raw)
                    summary = peek_quantum(payload)

                    if summary.message_type == AllMessages.NetPing:
                        continue

                    is_target_alive = (
                        summary.is_alive if config.target.pov else (summary.fleet_id != 0)
                    )

                    if not recording_started:
                        if summary.message_type == AllMessages.NetEvent:
                            last_hook_packet = payload
                        elif summary.message_type == AllMessages.NetLeaderboard:
                            last_leaderboard_packet = payload
                        elif (
                            summary.message_type == AllMessages.NetWorldView
                            and is_target_alive
                        ):
                            recording_started = True
                            start_mono = time.monotonic()
                            if last_hook_packet is not None:
                                writer.write_frame(0, last_hook_packet)
                            if last_leaderboard_packet is not None:
                                writer.write_frame(0, last_leaderboard_packet)
                        else:
                            continue

                    now = time.monotonic()
                    elapsed_ms = int(round((now - start_mono) * 1000))
                    writer.write_frame(elapsed_ms, payload)
                    latest_duration_ms = writer.last_elapsed_ms

                    if summary.message_type == AllMessages.NetWorldView:
                        if is_target_alive:
                            seen_alive = True
                        elif (
                            config.stop_on_death
                            and seen_alive
                            and death_deadline_mono is None
                        ):
                            death_deadline_mono = now + max(
                                0.0, config.post_death_delay_sec
                            )

                    if max_bytes > 0 and writer.bytes_written >= max_bytes:
                        stop_reason = "max_size_reached"
                        local_stop.set()
                        break
            finally:
                local_stop.set()
                bg_task.cancel()
                try:
                    await bg_task
                except asyncio.CancelledError:
                    pass

        frames_written = writer.frame_count
        bytes_written = writer.bytes_written

    return CaptureResult(
        output_path=config.output_path,
        target_label=config.target.label,
        frames_written=frames_written,
        bytes_written=bytes_written,
        duration_ms=latest_duration_ms,
        stop_reason=stop_reason,
    )


async def capture_many(configs: list[CaptureConfig]) -> list[CaptureResult]:
    """Runs one or more observer captures concurrently with clean SIGINT/SIGTERM handling."""
    external_stop = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _request_stop(*_args: Any) -> None:
        if not loop.is_closed():
            loop.call_soon_threadsafe(external_stop.set)

    installed_loop_signals: list[signal.Signals] = []
    restored_signal_handlers: list[tuple[signal.Signals, Any]] = []
    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is None:
            continue
        try:
            loop.add_signal_handler(sig, external_stop.set)
            installed_loop_signals.append(sig)
        except (NotImplementedError, RuntimeError):
            try:
                prev = signal.getsignal(sig)
                signal.signal(sig, _request_stop)
                restored_signal_handlers.append((sig, prev))
            except Exception:
                pass

    try:
        tasks = [capture_single(cfg, external_stop=external_stop) for cfg in configs]
        return list(await asyncio.gather(*tasks))
    finally:
        for sig in installed_loop_signals:
            try:
                loop.remove_signal_handler(sig)
            except Exception:
                pass
        for sig, prev in restored_signal_handlers:
            try:
                signal.signal(sig, prev)
            except Exception:
                pass
