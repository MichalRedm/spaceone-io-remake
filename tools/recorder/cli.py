"""
Command-line interface for Spaceone.io Remake gameplay recording, inspection,
trajectory export, and offline MP4 rendering (`python -m tools.recorder`).
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from .capture import CaptureConfig, CaptureResult, capture_many
from .discovery import (
    TargetSpec,
    build_target_spec,
    fetch_players,
    fetch_worlds,
    find_matching_player,
    normalize_server_url,
    wait_for_matching_player,
)
from .exporter import export_trajectories
from .format import inspect_replay
from .renderer import (
    DEFAULT_DIST_DIR,
    GRAPHICS_MODES,
    RENDER_PROFILES,
    UI_ELEMENT_KEYS,
    UI_PRESETS,
    RenderOptions,
    extract_frames,
    parse_ui_overrides,
    parse_viewport,
    render_replay_to_mp4,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SESSIONS_DIR = REPO_ROOT / ".recorder_sessions"
DEFAULT_RECORDINGS_DIR = REPO_ROOT / "recordings"


def _sanitize_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name.strip()).strip("_")
    return cleaned or "target"


def _session_paths(session_name: str) -> tuple[Path, Path]:
    safe = _sanitize_filename(session_name)
    return SESSIONS_DIR / f"{safe}.json", SESSIONS_DIR / f"{safe}.stop"


def _add_render_flags(parser: argparse.ArgumentParser, include_profile: bool = True) -> None:
    if include_profile:
        parser.add_argument(
            "--profile",
            choices=tuple(RENDER_PROFILES.keys()),
            default=None,
            help="Preset render profile: 'human' (1280x720@30), 'hd' (1920x1080@60), 'agent' (960x540@30)",
        )
    parser.add_argument("--viewport", default=None, help="Viewport size WxH (e.g. 1280x720, 1920x1080, 960x540)")
    parser.add_argument("--fps", type=int, default=None, help="Output video framerate (default: 30)")
    parser.add_argument("--crf", type=int, default=None, help="H.264 CRF quality (lower=higher quality)")
    parser.add_argument("--preset", default="medium", help="FFmpeg x264 preset (default: medium)")
    parser.add_argument("--graphics", choices=GRAPHICS_MODES, default=None, help="Client graphics preset")
    parser.add_argument("--ui-preset", choices=UI_PRESETS, default=None, help="HUD visibility preset")
    parser.add_argument(
        "--ui-show",
        action="append",
        default=None,
        help=f"Comma-separated UI keys to force visible ({', '.join(UI_ELEMENT_KEYS)})",
    )
    parser.add_argument(
        "--ui-hide",
        action="append",
        default=None,
        help=f"Comma-separated UI keys to force hidden ({', '.join(UI_ELEMENT_KEYS)})",
    )
    parser.add_argument("--no-audio", action="store_true", help="Omit sound effects from rendered MP4")
    parser.add_argument("--audio-volume", type=int, default=100, help="Master SFX volume 0..100 (default: 100)")
    parser.add_argument("--zoom", type=float, default=1000.0, help="Camera zoom distance (default: 1000)")
    parser.add_argument("--overlay-info", action="store_true", help="Show debug telemetry overlay bar")
    parser.add_argument("--start", type=float, default=0.0, help="Trim start time in seconds")
    parser.add_argument("--end", type=float, default=None, help="Trim end time in seconds")
    parser.add_argument("--speed", type=float, default=1.0, help="Playback speed multiplier (e.g. 0.5 for slow-mo)")
    parser.add_argument("--seed", type=int, default=None, help="Deterministic audio PRNG seed")
    parser.add_argument("--fast-frames", action="store_true", help="Use JPEG frames instead of PNG when piping to FFmpeg")
    parser.add_argument("--dist-dir", default=str(DEFAULT_DIST_DIR), help="Path to built wwwroot/dist directory")


def build_render_options(args: argparse.Namespace) -> RenderOptions:
    """Resolves render options by merging `--profile` defaults with explicit CLI flags."""
    profile_cfg = RENDER_PROFILES.get(getattr(args, "profile", None) or "human", RENDER_PROFILES["human"])
    w, h = parse_viewport(args.viewport) if args.viewport else profile_cfg["viewport"]
    fps = args.fps if args.fps is not None else int(profile_cfg["fps"])
    crf = args.crf if args.crf is not None else int(profile_cfg["crf"])
    graphics = args.graphics if args.graphics is not None else str(profile_cfg["graphics"])
    overrides = parse_ui_overrides(args.ui_show, args.ui_hide)

    return RenderOptions(
        width=w,
        height=h,
        fps=max(1, fps),
        crf=max(0, min(51, crf)),
        preset=args.preset,
        graphics=graphics,
        ui_preset=args.ui_preset,
        ui_overrides=overrides,
        enable_audio=not args.no_audio,
        audio_volume=max(0, min(100, args.audio_volume)),
        zoom=args.zoom,
        overlay_info=args.overlay_info,
        start_sec=max(0.0, args.start),
        end_sec=args.end,
        speed=args.speed if args.speed > 0 else 1.0,
        seed=args.seed,
        lossless_frames=not args.fast_frames,
        dist_dir=Path(args.dist_dir),
    )


def _cmd_worlds(args: argparse.Namespace) -> int:
    worlds = fetch_worlds(args.server)
    if args.json:
        print(json.dumps(worlds, indent=2))
        return 0

    if not worlds:
        print("No worlds returned.")
        return 0

    print(f"{'WORLD KEY':<16} {'MODE':<10} {'PLAYERS':<8} {'NAME'}")
    print("-" * 64)
    for w in worlds:
        wkey = w.get("worldKey") or w.get("world", "").split("/")[-1]
        mode = w.get("gameMode") or ""
        players = w.get("players", 0)
        name = w.get("name") or ""
        print(f"{str(wkey):<16} {str(mode):<10} {str(players):<8} {name}")
    return 0


def _cmd_players(args: argparse.Namespace) -> int:
    players = fetch_players(
        args.server, world=args.world, include_observers=args.include_observers
    )
    if args.json:
        print(json.dumps(players, indent=2))
        return 0

    if not players:
        print(f"No players connected in world '{args.world}'.")
        return 0

    print(
        f"{'PLAYER_ID':<12} {'FLEET':<7} {'ALIVE':<6} {'BOT':<5} {'SCORE':<7} {'SHIPS':<6} {'COLOR':<8} {'NAME'}"
    )
    print("-" * 82)
    for p in players:
        pid = str(p.get("playerID") or "")
        pid_disp = pid if args.full_ids else pid[:10]
        fid = p.get("fleetID", 0)
        alive = "yes" if p.get("isAlive") else "no"
        is_bot = "yes" if p.get("isBot") else "no"
        score = p.get("score", 0)
        ships = p.get("fleetSize", 0)
        color = p.get("color") or ""
        name = p.get("name") or ""
        print(
            f"{pid_disp:<12} {str(fid):<7} {alive:<6} {is_bot:<5} {str(score):<7} {str(ships):<6} {color:<8} {name}"
        )
    return 0


def _resolve_recording_targets(args: argparse.Namespace) -> list[TargetSpec]:
    pov: bool | None = True if args.pov else (False if args.no_pov else None)
    radius = max(1000, min(6000, args.viewport_radius))
    targets: list[TargetSpec] = []

    if args.player_id:
        for pid in args.player_id:
            match = (
                wait_for_matching_player(
                    args.server, args.world, "player", pid, args.wait_for_target
                )
                if args.wait_for_target > 0
                else find_matching_player(fetch_players(args.server, args.world), "player", pid)
            )
            if match is None and args.wait_for_target > 0:
                raise RuntimeError(f"Timed out waiting for player ID '{pid}'.")
            targets.append(
                build_target_spec("player", pid, pov=pov, viewport_radius=radius, matched_player=match)
            )

    if args.player_name:
        for pname in args.player_name:
            match = (
                wait_for_matching_player(
                    args.server, args.world, "name", pname, args.wait_for_target
                )
                if args.wait_for_target > 0
                else find_matching_player(fetch_players(args.server, args.world), "name", pname)
            )
            if match is None and args.wait_for_target > 0:
                raise RuntimeError(f"Timed out waiting for player name '{pname}'.")
            targets.append(
                build_target_spec("name", pname, pov=pov, viewport_radius=radius, matched_player=match)
            )

    if args.fleet_id:
        for fid in args.fleet_id:
            match = (
                wait_for_matching_player(
                    args.server, args.world, "fleet", str(fid), args.wait_for_target
                )
                if args.wait_for_target > 0
                else find_matching_player(fetch_players(args.server, args.world), "fleet", str(fid))
            )
            if match is None and args.wait_for_target > 0:
                raise RuntimeError(f"Timed out waiting for fleet ID {fid}.")
            targets.append(
                build_target_spec("fleet", str(fid), pov=pov, viewport_radius=radius, matched_player=match)
            )

    if args.top is not None and args.top > 0:
        players = fetch_players(args.server, args.world)
        alive = [p for p in players if p.get("isAlive") and p.get("playerID")]
        alive.sort(key=lambda p: -int(p.get("score") or 0))
        if not alive:
            raise RuntimeError(f"No alive players available in world '{args.world}' for --top {args.top}.")
        for p in alive[: args.top]:
            targets.append(
                build_target_spec(
                    "player",
                    str(p["playerID"]),
                    pov=pov,
                    viewport_radius=radius,
                    matched_player=p,
                )
            )

    if args.all_players:
        players = fetch_players(args.server, args.world)
        candidates = [p for p in players if p.get("playerID")]
        if not candidates:
            raise RuntimeError(f"No connected players found in world '{args.world}'.")
        for p in candidates:
            targets.append(
                build_target_spec(
                    "player",
                    str(p["playerID"]),
                    pov=pov,
                    viewport_radius=radius,
                    matched_player=p,
                )
            )

    if args.leader:
        targets.append(build_target_spec("leader", pov=pov, viewport_radius=radius))

    if args.point:
        targets.append(build_target_spec("point", args.point, pov=False, viewport_radius=radius))

    if args.auto or not targets:
        targets.append(build_target_spec("auto", pov=pov, viewport_radius=radius))

    return targets


def _cleanup_session_files(session_name: str) -> None:
    meta_path, stop_path = _session_paths(session_name)
    for path in (stop_path, meta_path):
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass


def _default_render_output_path(src: Path) -> Path:
    """Computes default `.mp4` output path for both `.s1rec` and `.s1rec.gz` inputs."""
    lower = src.name.lower()
    if lower.endswith(".s1rec.gz"):
        return src.with_name(src.name[: -len(".s1rec.gz")] + ".mp4")
    return src.with_suffix(".mp4")


def _spawn_background_record(args: argparse.Namespace) -> int:
    session_name = args.session or f"rec_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    meta_path, stop_path = _session_paths(session_name)
    if meta_path.exists():
        try:
            existing = json.loads(meta_path.read_text(encoding="utf-8"))
            existing_pid = int(existing.get("pid", 0))
        except Exception:
            existing_pid = 0
        if _is_pid_running(existing_pid):
            raise RuntimeError(
                f"Background recording session '{session_name}' is already running (PID {existing_pid}). "
                "Stop it first or specify a different --session name."
            )
        _cleanup_session_files(session_name)
    elif stop_path.exists():
        stop_path.unlink()

    child_argv: list[str] = [sys.executable, "-m", "tools.recorder", "record"]
    skip_next = False
    try:
        rec_idx = sys.argv.index("record", 1)
        raw_args = sys.argv[rec_idx + 1 :]
    except ValueError:
        raw_args = sys.argv[2:]
    for tok in raw_args:
        if skip_next:
            skip_next = False
            continue
        if tok == "--background":
            continue
        if tok.startswith("--sentinel-file="):
            continue
        if tok == "--sentinel-file":
            skip_next = True
            continue
        child_argv.append(tok)

    child_argv.extend(["--sentinel-file", str(stop_path)])
    if not args.session:
        child_argv.extend(["--session", session_name])

    log_path = SESSIONS_DIR / f"{_sanitize_filename(session_name)}.log"
    creation_flags = 0
    if os.name == "nt":
        creation_flags = (
            getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            | getattr(subprocess, "DETACHED_PROCESS", 0)
        )

    with open(log_path, "w", encoding="utf-8") as log_fp:
        proc = subprocess.Popen(
            child_argv,
            cwd=str(REPO_ROOT),
            stdin=subprocess.DEVNULL,
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags,
        )

    meta = {
        "session": session_name,
        "pid": proc.pid,
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "world": args.world,
        "server": normalize_server_url(args.server),
        "log": str(log_path),
        "stop_sentinel": str(stop_path),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Started background recording session '{session_name}' (PID {proc.pid}).")
    print(f"Stop cleanly with: uv run --project tools/recorder python -m tools.recorder stop --session {session_name}")
    print(f"Log file: {log_path}")
    return 0


def _cmd_record(args: argparse.Namespace) -> int:
    if args.background:
        return _spawn_background_record(args)

    summary_items: list[dict[str, Any]] = []
    try:
        targets = _resolve_recording_targets(args)
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        multi = len(targets) > 1
        out_dir = Path(args.output_dir) if args.output_dir else DEFAULT_RECORDINGS_DIR

        single_output = Path(args.output) if args.output else None
        sentinel_path = Path(args.sentinel_file) if args.sentinel_file else None

        if args.duration == 0 and not args.stop_on_death and not args.stop_on_disconnect and sentinel_path is None:
            print("Recording indefinitely until Ctrl+C / SIGINT...")

        configs: list[CaptureConfig] = []
        final_outputs: list[tuple[TargetSpec, Path, Path, bool]] = []  # (target, s1rec_path, final_path, wants_mp4)

        for idx, tgt in enumerate(targets):
            safe_label = _sanitize_filename(tgt.label)
            if not multi and single_output is not None:
                dest = single_output
            else:
                ext = (".s1rec.gz" if args.compress else ".s1rec") if args.s1rec_only else ".mp4"
                dest = out_dir / f"{stamp}_{idx + 1}_{safe_label}{ext}"

            wants_mp4 = dest.suffix.lower() == ".mp4"
            if wants_mp4:
                if not multi and args.keep_replay:
                    s1rec_path = Path(args.keep_replay)
                else:
                    suffix = ".s1rec.gz" if args.compress else ".s1rec"
                    s1rec_path = dest.with_suffix(suffix)
            else:
                s1rec_path = dest

            configs.append(
                CaptureConfig(
                    server_url=args.server,
                    world=args.world,
                    target=tgt,
                    output_path=s1rec_path,
                    compress=args.compress or s1rec_path.suffix.lower() == ".gz",
                    duration_sec=args.duration,
                    max_duration_sec=args.max_duration,
                    max_size_mb=args.max_size_mb,
                    wait_for_spawn=args.wait_for_spawn,
                    stop_on_death=args.stop_on_death,
                    post_death_delay_sec=args.post_death_delay,
                    stop_on_disconnect=args.stop_on_disconnect,
                    stop_sentinel_path=sentinel_path,
                )
            )
            final_outputs.append((tgt, s1rec_path, dest, wants_mp4))

        results: list[CaptureResult] = asyncio.run(capture_many(configs))

        render_opts: RenderOptions | None = None
        if any(w for _, _, _, w in final_outputs):
            render_opts = build_render_options(args)

        for res, (tgt, s1rec_path, final_path, wants_mp4) in zip(results, final_outputs):
            print(
                f"[captured] target={res.target_label} frames={res.frames_written} "
                f"duration={res.duration_ms / 1000.0:.2f}s reason={res.stop_reason} file={s1rec_path}"
            )
            item: dict[str, Any] = {
                "target": res.target_label,
                "s1rec": str(s1rec_path),
                "frames": res.frames_written,
                "duration_sec": round(res.duration_ms / 1000.0, 3),
                "stop_reason": res.stop_reason,
            }
            if wants_mp4 and res.frames_written > 0:
                assert render_opts is not None
                info = render_replay_to_mp4(s1rec_path, final_path, render_opts)
                item["mp4"] = info["output"]
                item["mp4_size_bytes"] = info["size_bytes"]
                print(
                    f"[rendered] {info['output']} ({info['viewport']} @ {info['fps']}fps, "
                    f"audio={info['audio']}, {info['size_bytes'] / (1024 * 1024):.2f} MB)"
                )
                if args.no_keep_replay and s1rec_path.exists():
                    s1rec_path.unlink()
                    item.pop("s1rec", None)

            summary_items.append(item)
    finally:
        if args.session:
            _cleanup_session_files(args.session)

    if args.json:
        print(json.dumps(summary_items, indent=2))
    return 0


def _is_pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        process_query_limited_info = 0x1000
        still_active = 259
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        handle = kernel32.OpenProcess(process_query_limited_info, False, int(pid))
        if not handle:
            # ERROR_ACCESS_DENIED (5) indicates the PID exists under stricter permissions.
            return ctypes.get_last_error() == 5
        try:
            exit_code = wintypes.DWORD()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                return False
            return exit_code.value == still_active
        finally:
            kernel32.CloseHandle(handle)

    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False


def _load_sessions(prune: bool = False) -> list[dict[str, Any]]:
    if not SESSIONS_DIR.exists():
        return []
    entries: list[dict[str, Any]] = []
    for meta_path in sorted(SESSIONS_DIR.glob("*.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            meta = {"session": meta_path.stem, "pid": 0, "corrupt": True}

        pid = int(meta.get("pid", 0))
        running = _is_pid_running(pid)
        session_name = str(meta.get("session") or meta_path.stem)
        if prune and not running:
            stop_path = Path(meta.get("stop_sentinel", "")) if meta.get("stop_sentinel") else None
            if stop_path and stop_path.exists():
                try:
                    stop_path.unlink()
                except OSError:
                    pass
            try:
                meta_path.unlink()
            except OSError:
                pass
            continue

        entries.append(
            {
                "session": session_name,
                "pid": pid,
                "status": "running" if running else "stale",
                "world": meta.get("world"),
                "server": meta.get("server"),
                "started_at": meta.get("started_at"),
                "log": meta.get("log"),
                "meta_file": str(meta_path),
            }
        )
    return entries


def _cmd_sessions(args: argparse.Namespace) -> int:
    rows = _load_sessions(prune=args.prune)
    if args.json:
        print(json.dumps(rows, indent=2))
        return 0
    if not rows:
        print("No background recording sessions found.")
        return 0

    print(f"{'SESSION':<24} {'PID':<8} {'STATUS':<9} {'WORLD':<12} {'STARTED_AT'}")
    print("-" * 82)
    for r in rows:
        print(
            f"{str(r['session']):<24} {str(r['pid']):<8} {str(r['status']):<9} "
            f"{str(r.get('world') or ''):<12} {str(r.get('started_at') or '')}"
        )
    return 0


def _cmd_stop(args: argparse.Namespace) -> int:
    if not SESSIONS_DIR.exists():
        print("No active recording sessions directory found.")
        return 0

    meta_files = (
        sorted(SESSIONS_DIR.glob("*.json"))
        if args.all
        else ([_session_paths(args.session)[0]] if args.session else [])
    )
    if not meta_files:
        print("Specify --session <name> or --all.")
        return 1

    exit_code = 0
    for meta_path in meta_files:
        if not meta_path.exists():
            print(f"Session metadata not found: {meta_path}")
            exit_code = 1
            continue
        meta = None
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"Corrupt session metadata removed ({meta_path}): {exc}")
            try:
                meta_path.unlink()
            except OSError:
                pass
            exit_code = 1
            continue
        stop_path = Path(meta.get("stop_sentinel") or _session_paths(str(meta.get("session") or meta_path.stem))[1])
        pid = int(meta.get("pid", 0))
        session_name = str(meta.get("session") or meta_path.stem)

        if not _is_pid_running(pid):
            print(f"Session '{session_name}' (PID {pid}) is no longer running; cleaned stale metadata.")
            _cleanup_session_files(session_name)
            continue

        stop_path.write_text("stop\n", encoding="utf-8")
        print(f"Sent stop signal to session '{session_name}' (PID {pid})...")

        deadline = time.monotonic() + max(1.0, args.timeout)
        while time.monotonic() < deadline:
            if not meta_path.exists() or not _is_pid_running(pid):
                break
            time.sleep(0.25)

        if _is_pid_running(pid):
            print(f"Warning: session '{session_name}' (PID {pid}) is still finishing/rendering. Check {meta.get('log')}.")
        else:
            print(f"Session '{session_name}' stopped cleanly.")
            _cleanup_session_files(session_name)

    return exit_code


def _cmd_render(args: argparse.Namespace) -> int:
    src = Path(args.input)
    out = Path(args.output) if args.output else _default_render_output_path(src)
    opts = build_render_options(args)
    result = render_replay_to_mp4(src, out, opts)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(
            f"Rendered {result['output']} ({result['viewport']} @ {result['fps']}fps, "
            f"{result['duration_sec']}s, audio={result['audio']}, "
            f"{result['size_bytes'] / (1024 * 1024):.2f} MB)"
        )
    return 0


def _cmd_inspect(args: argparse.Namespace) -> int:
    info = inspect_replay(args.input)
    if args.json:
        print(json.dumps(info, indent=2))
        return 0

    hdr = info["header"]
    trk = hdr.get("tracking") or {}
    print(f"File:          {info['file']} ({info['file_size_bytes'] / 1024:.1f} KB)")
    print(f"World / Host:  {hdr.get('worldKey', '?')} @ {hdr.get('serverUrl', '?')}")
    print(
        f"Tracking:      mode={trk.get('mode', '?')} target={trk.get('target', '?')} "
        f"pov={trk.get('pov', '?')} radius={trk.get('viewportRadius', 2000)}"
    )
    print(
        f"Duration:      {info['duration_sec']:.2f}s ({info['world_view_frames']} world views, "
        f"{info['total_frames']} total packets, {info['avg_snapshot_hz']} Hz)"
    )
    print(f"World Size:    {info['world_size']} | Max Players: {info['max_player_count']}")
    print(f"Fleets Seen:   {info['fleet_ids_observed']}")
    print(f"Alive Spans:   {info['alive_segments']}")
    if info["announcements"]:
        print(f"Announcements ({len(info['announcements'])}):")
        for ann in info["announcements"][:15]:
            print(f"  t={ann['elapsed_ms']/1000:.2f}s [{ann['type']}] {ann['text']} ({ann['points_delta']})")
    return 0


def _cmd_export(args: argparse.Namespace) -> int:
    res = export_trajectories(
        s1rec_path=args.input,
        output_path=args.output,
        output_format=args.format,
        start_sec=args.start,
        end_sec=args.end,
        tracked_only=args.tracked_only,
        ships_only=args.ships_only,
    )
    print(json.dumps(res, indent=2))
    return 0


def _cmd_frames(args: argparse.Namespace) -> int:
    timestamps = (
        [float(x.strip()) for x in args.timestamps.split(",") if x.strip()]
        if args.timestamps
        else None
    )
    opts = build_render_options(args)
    res = extract_frames(
        s1rec_path=args.input,
        output_dir=args.output_dir,
        timestamps_sec=timestamps,
        interval_sec=args.interval,
        contact_sheet=args.contact_sheet,
        columns=args.columns,
        options=opts,
    )
    print(json.dumps(res, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.recorder",
        description="Spaceone.io Remake gameplay recording, inspection, and offline MP4 conversion toolkit.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # worlds
    p_worlds = sub.add_parser("worlds", help="List available worlds on a running server")
    p_worlds.add_argument("--server", default="http://localhost:5000")
    p_worlds.add_argument("--json", action="store_true")
    p_worlds.set_defaults(func=_cmd_worlds)

    # players
    p_players = sub.add_parser("players", help="List active players/bots and IDs in a world")
    p_players.add_argument("--server", default="http://localhost:5000")
    p_players.add_argument("--world", default="default")
    p_players.add_argument("--include-observers", action="store_true")
    p_players.add_argument("--full-ids", action="store_true")
    p_players.add_argument("--json", action="store_true")
    p_players.set_defaults(func=_cmd_players)

    # record
    p_rec = sub.add_parser("record", help="Record live gameplay to .s1rec and/or .mp4")
    p_rec.add_argument("--server", default="http://localhost:5000")
    p_rec.add_argument("--world", default="default")
    p_rec.add_argument("--player-id", action="append", help="Track player by PlayerID (or unique prefix)")
    p_rec.add_argument("--player-name", action="append", help="Track player/bot by fleet name")
    p_rec.add_argument("--fleet-id", type=int, action="append", help="Track fleet by numeric FleetID")
    p_rec.add_argument("--leader", action="store_true", help="Track the #1 arena leader dynamically")
    p_rec.add_argument("--auto", action="store_true", help="Spectator auto-follow mode")
    p_rec.add_argument("--point", default=None, help="Fixed world coordinate X,Y (e.g. 0,0)")
    p_rec.add_argument("--top", type=int, default=None, help="Record top N alive players concurrently")
    p_rec.add_argument("--all-players", action="store_true", help="Record all connected players concurrently")
    p_rec.add_argument("--wait-for-target", type=float, default=0.0, help="Seconds to wait for target to appear")
    p_rec.add_argument("--pov", action="store_true", help="Mirror target player's exact HUD/audio POV")
    p_rec.add_argument("--no-pov", action="store_true", help="Watch target as detached spectator")
    p_rec.add_argument("--viewport-radius", type=int, default=2000, help="Server spatial envelope half-size (1000..6000)")

    p_rec.add_argument("--duration", type=float, default=20.0, help="Recording duration in seconds (0 = indefinite)")
    p_rec.add_argument("--max-duration", type=float, default=3600.0, help="Safety cap in seconds (0 = unlimited)")
    p_rec.add_argument("--max-size-mb", type=float, default=500.0, help="Safety cap in MB (0 = unlimited)")
    p_rec.add_argument("--wait-for-spawn", action="store_true", help="Begin clock once target spawns alive")
    p_rec.add_argument("--stop-on-death", action="store_true", help="Stop recording after tracked player dies")
    p_rec.add_argument("--post-death-delay", type=float, default=1.5, help="Trailing seconds captured after death (default: 1.5)")
    p_rec.add_argument("--stop-on-disconnect", action="store_true", help="Stop if tracked player leaves world")

    p_rec.add_argument("-o", "--output", default=None, help="Output .s1rec, .s1rec.gz, or .mp4 file path")
    p_rec.add_argument("--output-dir", default=None, help="Directory for multi-target outputs")
    p_rec.add_argument("--keep-replay", default=None, help="Explicit path to save underlying .s1rec when output is .mp4")
    p_rec.add_argument("--no-keep-replay", action="store_true", help="Delete intermediate .s1rec after MP4 render")
    p_rec.add_argument("--s1rec-only", action="store_true", help="Default multi-target extension to .s1rec without MP4")
    p_rec.add_argument("--compress", action="store_true", help="Write gzip-compressed .s1rec.gz")
    p_rec.add_argument("--background", action="store_true", help="Run capture detached in background")
    p_rec.add_argument("--session", default=None, help="Session name for background recording")
    p_rec.add_argument("--sentinel-file", default=None, help=argparse.SUPPRESS)
    p_rec.add_argument("--json", action="store_true")
    _add_render_flags(p_rec, include_profile=True)
    p_rec.set_defaults(func=_cmd_record)

    # sessions
    p_sess = sub.add_parser("sessions", help="List background recording sessions and clean stale metadata")
    p_sess.add_argument("--prune", action="store_true", help="Remove stale metadata files whose PID has exited")
    p_sess.add_argument("--json", action="store_true")
    p_sess.set_defaults(func=_cmd_sessions)

    # stop
    p_stop = sub.add_parser("stop", help="Gracefully stop a background recording session")
    p_stop.add_argument("--session", default=None, help="Background session name")
    p_stop.add_argument("--all", action="store_true", help="Stop all active background sessions")
    p_stop.add_argument("--timeout", type=float, default=30.0, help="Seconds to wait for session exit")
    p_stop.set_defaults(func=_cmd_stop)

    # render / convert
    p_ren = sub.add_parser("render", aliases=["convert"], help="Convert .s1rec / .s1rec.gz to MP4 video")
    p_ren.add_argument("input", help="Input .s1rec or .s1rec.gz file")
    p_ren.add_argument("-o", "--output", default=None, help="Output .mp4 path (default: <input>.mp4)")
    p_ren.add_argument("--json", action="store_true")
    _add_render_flags(p_ren, include_profile=True)
    p_ren.set_defaults(func=_cmd_render)

    # inspect
    p_ins = sub.add_parser("inspect", help="Inspect .s1rec header, duration, fleet IDs, and events")
    p_ins.add_argument("input", help="Input .s1rec or .s1rec.gz file")
    p_ins.add_argument("--json", action="store_true")
    p_ins.set_defaults(func=_cmd_inspect)

    # export
    p_exp = sub.add_parser("export", help="Export entity trajectories from .s1rec to CSV or JSONL")
    p_exp.add_argument("input", help="Input .s1rec or .s1rec.gz file")
    p_exp.add_argument("-o", "--output", required=True, help="Output .csv or .jsonl path")
    p_exp.add_argument("--format", choices=("csv", "jsonl"), default=None)
    p_exp.add_argument("--start", type=float, default=0.0)
    p_exp.add_argument("--end", type=float, default=None)
    p_exp.add_argument("--tracked-only", action="store_true", help="Export only bodies belonging to tracked fleet")
    p_exp.add_argument("--ships-only", action="store_true", help="Export only ship entities")
    p_exp.set_defaults(func=_cmd_export)

    # frames
    p_frm = sub.add_parser("frames", help="Extract PNG keyframes or a contact sheet from .s1rec")
    p_frm.add_argument("input", help="Input .s1rec or .s1rec.gz file")
    p_frm.add_argument("-o", "--output-dir", required=True, help="Directory for output PNGs")
    p_frm.add_argument("--timestamps", default=None, help="Comma-separated timestamps in seconds (e.g. 1.0,5.5,12)")
    p_frm.add_argument("--interval", type=float, default=2.0, help="Frame sampling interval in seconds")
    p_frm.add_argument("--contact-sheet", action="store_true", help="Also generate contact_sheet.png")
    p_frm.add_argument("--columns", type=int, default=4, help="Contact sheet columns (default: 4)")
    _add_render_flags(p_frm, include_profile=True)
    p_frm.set_defaults(func=_cmd_frames)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))
