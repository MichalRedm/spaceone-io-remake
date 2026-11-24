"""
Deterministic offline `.s1rec` -> `.mp4` and keyframe PNG renderer powered by
headless Playwright Chromium, Web Audio `OfflineAudioContext`, and FFmpeg.
"""

from __future__ import annotations

import base64
import json
import math
import mimetypes
import shutil
import subprocess
import tempfile
import time
import urllib.parse
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from PIL import Image
from playwright.sync_api import sync_playwright

from .format import read_replay

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DIST_DIR = REPO_ROOT / "Game.Engine" / "wwwroot" / "dist"

UI_ELEMENT_KEYS: tuple[str, ...] = (
    "leaderboard",
    "arenaRecord",
    "names",
    "ownName",
    "fleetSize",
    "cooldown",
    "autofire",
    "trackingArrows",
    "killBanner",
    "scorePopups",
    "dangerZone",
    "ctfHud",
    "fpsHud",
    "vignette",
    "deathMenu",
)

UI_PRESETS: tuple[str, ...] = ("player", "spectator", "clean", "none")
GRAPHICS_MODES: tuple[str, ...] = ("high", "medium", "low")

RENDER_PROFILES: dict[str, dict[str, Any]] = {
    "human": {"viewport": (1280, 720), "fps": 30, "crf": 20, "graphics": "high"},
    "hd": {"viewport": (1920, 1080), "fps": 60, "crf": 18, "graphics": "high"},
    "agent": {"viewport": (960, 540), "fps": 30, "crf": 24, "graphics": "high"},
}


@dataclass
class RenderOptions:
    """Configuration options for offline MP4 video and keyframe rendering."""

    width: int = 1280
    height: int = 720
    fps: int = 30
    crf: int = 20
    preset: str = "medium"
    graphics: str = "high"
    ui_preset: str | None = None
    ui_overrides: dict[str, bool] | None = None
    enable_audio: bool = True
    audio_volume: int = 100
    zoom: float = 1000.0
    overlay_info: bool = False
    start_sec: float = 0.0
    end_sec: float | None = None
    speed: float = 1.0
    seed: int | None = None
    lossless_frames: bool = True
    dist_dir: Path = DEFAULT_DIST_DIR


def parse_viewport(spec: str) -> tuple[int, int]:
    """Parses and validates a `WxH` viewport string (even dimensions >= 160)."""
    parts = spec.lower().strip().split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid viewport '{spec}'. Expected WxH (e.g. 1280x720).")
    w, h = int(parts[0]), int(parts[1])
    if w < 160 or h < 160:
        raise ValueError(f"Viewport {w}x{h} is too small (minimum 160x160).")
    if w % 2 != 0 or h % 2 != 0:
        raise ValueError(
            f"Viewport {w}x{h} must use even pixel dimensions for H.264 yuv420p encoding."
        )
    return w, h


def parse_ui_overrides(show_items: list[str] | None, hide_items: list[str] | None) -> dict[str, bool]:
    """Parses comma-separated `--ui-show` and `--ui-hide` keys into a validated override map."""
    overrides: dict[str, bool] = {}
    valid = set(UI_ELEMENT_KEYS)

    def _consume(items: list[str] | None, state: bool) -> None:
        if not items:
            return
        for raw in items:
            for token in raw.split(","):
                key = token.strip()
                if not key:
                    continue
                if key not in valid:
                    raise ValueError(
                        f"Unknown UI element '{key}'. Valid keys: {', '.join(UI_ELEMENT_KEYS)}"
                    )
                overrides[key] = state

    _consume(show_items, True)
    _consume(hide_items, False)
    return overrides


OFFLINE_ORIGIN = "http://spaceone.local"

_MIME_TYPES: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".ico": "image/x-icon",
}


def _install_offline_dist_routes(page: Any, dist_dir: Path) -> str:
    """
    Serves `Game.Engine/wwwroot/dist/` deterministically via Playwright `route.fulfill`
    and aborts external CDN URLs so offline rendering never stalls or depends on sockets.
    """
    dist_root = Path(dist_dir).resolve()
    index_file = dist_root / "index.html"
    if not index_file.is_file():
        raise FileNotFoundError(
            f"Built web client not found at {index_file}. "
            "Run 'npm run build' inside Game.Engine/wwwroot first."
        )

    def _handle_route(route: Any) -> None:
        url: str = route.request.url
        if url.startswith(("data:", "blob:")):
            route.continue_()
            return
        if url == OFFLINE_ORIGIN or url.startswith(f"{OFFLINE_ORIGIN}/"):
            raw_path = url[len(OFFLINE_ORIGIN) :].split("#", 1)[0].split("?", 1)[0]
            rel = urllib.parse.unquote(raw_path.lstrip("/")) or "index.html"
            fp = (dist_root / rel).resolve()
            if fp.is_relative_to(dist_root) and fp.is_file():
                ctype = (
                    _MIME_TYPES.get(fp.suffix.lower())
                    or mimetypes.guess_type(str(fp))[0]
                    or "application/octet-stream"
                )
                route.fulfill(status=200, path=str(fp), content_type=ctype)
                return
            route.fulfill(status=404, body="Not found")
            return
        route.abort()

    page.route("**/*", _handle_route)
    return OFFLINE_ORIGIN


def _ensure_ffmpeg_tools() -> tuple[str, str]:
    ffmpeg_bin = shutil.which("ffmpeg")
    ffprobe_bin = shutil.which("ffprobe")
    if not ffmpeg_bin or not ffprobe_bin:
        raise RuntimeError(
            "Both 'ffmpeg' and 'ffprobe' must be installed and available on PATH."
        )
    return ffmpeg_bin, ffprobe_bin


def _probe_media(ffprobe_bin: str, path: Path) -> dict[str, Any]:
    proc = subprocess.run(
        [
            ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate",
            "-show_entries",
            "format=duration,size",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout)


def _launch_chromium(playwright_obj: Any):
    return playwright_obj.chromium.launch(
        headless=True,
        args=[
            "--autoplay-policy=no-user-gesture-required",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
        ],
    )


def _setup_replay_page(
    page: Any,
    s1rec_path: Path,
    options: RenderOptions,
    start_ms: int,
    pov_default: bool,
) -> None:
    base_url = _install_offline_dist_routes(page, options.dist_dir)

    query = urllib.parse.urlencode(
        {
            "replay": "1",
            "graphics": options.graphics,
            "soundEnabled": "true" if options.enable_audio else "false",
            "soundVolume": str(options.audio_volume),
        }
    )
    page.goto(f"{base_url}/?{query}", wait_until="domcontentloaded", timeout=30000)

    deadline = time.monotonic() + 30.0
    while not page.evaluate("() => Boolean(window.__spaceoneReplay)"):
        if time.monotonic() >= deadline:
            raise TimeoutError("Timed out waiting for window.__spaceoneReplay to initialize.")
        time.sleep(0.05)

    resolved_ui_preset = options.ui_preset or ("player" if pov_default else "spectator")
    page.evaluate(
        "args => window.__spaceoneReplay.waitForReady(args.enableAudio)",
        {"enableAudio": options.enable_audio},
    )
    page.evaluate(
        "cfg => window.__spaceoneReplay.configure(cfg)",
        {
            "uiPreset": resolved_ui_preset,
            "uiOverrides": options.ui_overrides or {},
            "graphics": options.graphics,
            "soundEnabled": options.enable_audio,
            "soundVolume": options.audio_volume,
            "zoom": options.zoom,
            "overlayInfo": options.overlay_info,
            "speed": options.speed,
            "seed": options.seed,
            "povMode": pov_default,
        },
    )

    from .format import _open_replay_stream  # internal helper for transparent .gz decode

    # Send uncompressed S1REC payload bytes directly to ReplayController
    with _open_replay_stream(s1rec_path) as stream:
        raw_bytes = stream.read()
    b64_payload = base64.b64encode(raw_bytes).decode("ascii")
    page.evaluate(
        "args => window.__spaceoneReplay.loadReplayBase64(args.b64, args.startMs)",
        {"b64": b64_payload, "startMs": start_ms},
    )


def render_replay_to_mp4(
    s1rec_path: str | Path,
    output_mp4: str | Path,
    options: RenderOptions | None = None,
) -> dict[str, Any]:
    """
    Renders a `.s1rec` / `.s1rec.gz` archive to a deterministic `.mp4` video
    using the real PixiJS WebGL client, DOM HUD, and Web Audio SFX graph.
    """
    opts = options or RenderOptions()
    if opts.width % 2 != 0 or opts.height % 2 != 0:
        raise ValueError("MP4 rendering requires even viewport width and height.")

    ffmpeg_bin, ffprobe_bin = _ensure_ffmpeg_tools()
    src_path = Path(s1rec_path)
    out_path = Path(output_mp4)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    archive = read_replay(src_path)
    if not archive.frames:
        raise ValueError(f"Replay archive {src_path} contains zero frames.")

    tracking = archive.header.get("tracking") or {}
    pov_default = bool(tracking.get("pov", True))

    start_ms = max(0, int(round(opts.start_sec * 1000)))
    if archive.duration_ms > 0 and start_ms >= archive.duration_ms:
        raise ValueError(
            f"--start ({opts.start_sec:.2f}s) must be less than replay duration ({archive.duration_ms / 1000.0:.2f}s)."
        )
    raw_end_ms = (
        archive.duration_ms
        if opts.end_sec is None
        else min(archive.duration_ms, int(round(opts.end_sec * 1000)))
    )
    if opts.end_sec is not None and raw_end_ms <= start_ms:
        raise ValueError(
            f"--end ({opts.end_sec:.2f}s) must be greater than --start ({opts.start_sec:.2f}s)."
        )
    end_ms = max(start_ms + 1, raw_end_ms)
    replay_span_ms = max(1, end_ms - start_ms)
    speed = opts.speed if opts.speed > 0 else 1.0
    output_duration_sec = (replay_span_ms / 1000.0) / speed
    num_frames = max(1, int(math.floor(output_duration_sec * opts.fps)) + 1)

    effective_audio = opts.enable_audio and speed <= 2.5
    page_opts = opts if effective_audio == opts.enable_audio else replace(opts, enable_audio=effective_audio)

    frame_fmt = "png" if opts.lossless_frames else "jpeg"
    input_codec = "png" if opts.lossless_frames else "mjpeg"

    with tempfile.TemporaryDirectory(prefix="s1rec_render_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        video_only_path = tmp_dir / "video_only.mp4"
        wav_path = tmp_dir / "audio.wav"
        ffmpeg_log_path = tmp_dir / "ffmpeg_video.log"
        target_video_path = video_only_path if effective_audio else out_path

        ffmpeg_cmd = [
            ffmpeg_bin,
            "-y",
            "-nostats",
            "-loglevel",
            "warning",
            "-f",
            "image2pipe",
            "-vcodec",
            input_codec,
            "-framerate",
            str(opts.fps),
            "-i",
            "pipe:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            str(opts.crf),
            "-preset",
            opts.preset,
            "-an",
        ]
        if not effective_audio:
            ffmpeg_cmd.extend(["-movflags", "+faststart"])
        ffmpeg_cmd.append(str(target_video_path))

        with sync_playwright() as pw:
            browser = _launch_chromium(pw)
            try:
                context = browser.new_context(
                    viewport={"width": opts.width, "height": opts.height},
                    device_scale_factor=1,
                )
                try:
                    page = context.new_page()
                    cdp = context.new_cdp_session(page)

                    with open(ffmpeg_log_path, "w", encoding="utf-8") as ff_log_fp:
                        ff_proc = subprocess.Popen(
                            ffmpeg_cmd,
                            stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL,
                            stderr=ff_log_fp,
                        )

                        audio_b64 = ""
                        try:
                            _setup_replay_page(page, src_path, page_opts, start_ms, pov_default)

                            shot_params: dict[str, Any] = {"format": frame_fmt}
                            if frame_fmt == "jpeg":
                                shot_params["quality"] = 94

                            assert ff_proc.stdin is not None
                            for i in range(num_frames):
                                output_ms = (i * 1000.0) / opts.fps
                                page.evaluate(
                                    "t => window.__spaceoneReplay.stepTo(t)", output_ms
                                )
                                shot = cdp.send("Page.captureScreenshot", shot_params)
                                ff_proc.stdin.write(base64.b64decode(shot["data"]))

                            ff_proc.stdin.close()
                            rc = ff_proc.wait()
                            ff_log_fp.flush()
                            if rc != 0:
                                ff_stderr = ffmpeg_log_path.read_text(encoding="utf-8", errors="replace")
                                raise RuntimeError(f"FFmpeg video encode failed ({rc}):\n{ff_stderr}")

                            if effective_audio:
                                audio_b64 = page.evaluate(
                                    "d => window.__spaceoneReplay.renderAudioWavBase64(d)",
                                    output_duration_sec,
                                )
                        finally:
                            if ff_proc.poll() is None:
                                try:
                                    if ff_proc.stdin and not ff_proc.stdin.closed:
                                        ff_proc.stdin.close()
                                except Exception:
                                    pass
                                ff_proc.kill()
                                ff_proc.wait()
                finally:
                    context.close()
            finally:
                browser.close()

        if effective_audio:
            wav_bytes = base64.b64decode(audio_b64) if audio_b64 else b""
            if not wav_bytes:
                shutil.copyfile(video_only_path, out_path)
            else:
                wav_path.write_bytes(wav_bytes)
                mux_proc = subprocess.run(
                    [
                        ffmpeg_bin,
                        "-y",
                        "-i",
                        str(video_only_path),
                        "-i",
                        str(wav_path),
                        "-c:v",
                        "copy",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                        "-movflags",
                        "+faststart",
                        "-shortest",
                        str(out_path),
                    ],
                    capture_output=True,
                    text=True,
                )
                if mux_proc.returncode != 0:
                    raise RuntimeError(
                        f"FFmpeg audio mux failed ({mux_proc.returncode}):\n{mux_proc.stderr}"
                    )

    probe = _probe_media(ffprobe_bin, out_path)
    return {
        "output": str(out_path),
        "frames_rendered": num_frames,
        "duration_sec": round(output_duration_sec, 3),
        "viewport": f"{opts.width}x{opts.height}",
        "fps": opts.fps,
        "audio": effective_audio,
        "size_bytes": out_path.stat().st_size,
        "probe": probe,
    }


def extract_frames(
    s1rec_path: str | Path,
    output_dir: str | Path,
    timestamps_sec: list[float] | None = None,
    interval_sec: float | None = None,
    contact_sheet: bool = False,
    columns: int = 4,
    options: RenderOptions | None = None,
) -> dict[str, Any]:
    """
    Extracts individual PNG keyframes (and an optional tiled contact sheet) from a `.s1rec` file.
    """
    opts = options or RenderOptions()
    src_path = Path(s1rec_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    archive = read_replay(src_path)
    if not archive.frames:
        raise ValueError(f"Replay archive {src_path} contains zero frames.")

    tracking = archive.header.get("tracking") or {}
    pov_default = bool(tracking.get("pov", True))
    duration_sec = archive.duration_ms / 1000.0

    if timestamps_sec:
        targets = sorted(
            {max(0.0, min(duration_sec, float(t))) for t in timestamps_sec}
        )
    else:
        step = max(0.25, interval_sec if interval_sec and interval_sec > 0 else 2.0)
        targets = []
        t = 0.0
        while t <= duration_sec + 1e-6:
            targets.append(round(min(duration_sec, t), 3))
            t += step
        if not targets:
            targets = [0.0]

    saved_files: list[Path] = []
    # Disable audio decode overhead during pure image extraction
    frame_opts = replace(opts, enable_audio=False)

    with sync_playwright() as pw:
        browser = _launch_chromium(pw)
        try:
            context = browser.new_context(
                viewport={"width": frame_opts.width, "height": frame_opts.height},
                device_scale_factor=1,
            )
            try:
                page = context.new_page()
                cdp = context.new_cdp_session(page)
                _setup_replay_page(page, src_path, frame_opts, 0, pov_default)
                for idx, t_sec in enumerate(targets):
                    page.evaluate(
                        "t => window.__spaceoneReplay.stepTo(t)", t_sec * 1000.0
                    )
                    shot = cdp.send("Page.captureScreenshot", {"format": "png"})
                    frame_path = out_dir / f"frame_{idx:03d}_{t_sec:.2f}s.png"
                    frame_path.write_bytes(base64.b64decode(shot["data"]))
                    saved_files.append(frame_path)
            finally:
                context.close()
        finally:
            browser.close()

    contact_sheet_path: Path | None = None
    if contact_sheet and saved_files:
        cols = max(1, columns)
        rows = math.ceil(len(saved_files) / cols)
        thumb_w = max(160, frame_opts.width // 2)
        thumb_h = max(90, frame_opts.height // 2)
        sheet = Image.new("RGB", (cols * thumb_w, rows * thumb_h), (6, 10, 22))
        for idx, fp in enumerate(saved_files):
            with Image.open(fp) as im:
                resized = im.convert("RGB").resize(
                    (thumb_w, thumb_h), Image.Resampling.LANCZOS
                )
                r, c = divmod(idx, cols)
                sheet.paste(resized, (c * thumb_w, r * thumb_h))
        contact_sheet_path = out_dir / "contact_sheet.png"
        sheet.save(contact_sheet_path)

    return {
        "output_dir": str(out_dir),
        "frames": [str(p) for p in saved_files],
        "contact_sheet": str(contact_sheet_path) if contact_sheet_path else None,
    }
