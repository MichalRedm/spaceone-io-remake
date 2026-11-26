"""
Deterministic offline MP4 and PNG keyframe renderer for archived original
Spaceone.io binary recordings, powered by the original WebAssembly client,
headless Playwright Chromium, and FFmpeg.
"""

from __future__ import annotations

import base64
import math
import mimetypes
import subprocess
import tempfile
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

from .original_format import (
    DEFAULT_ORIGINAL_ASSETS_DIR,
    DEFAULT_ORIGINAL_WASM_DIR,
    inspect_original_recording,
    resolve_original_recording,
    slice_original_stream,
)
from .renderer import (
    OFFLINE_MIME_TYPES,
    RENDER_PROFILES,
    build_contact_sheet,
    ensure_ffmpeg_tools,
    launch_chromium,
    probe_media,
)

ORIGINAL_HARNESS_HTML = Path(__file__).resolve().parent / "original_harness.html"
ORIGINAL_OFFLINE_ORIGIN = "http://spaceone-original.local"


@dataclass
class OriginalRenderOptions:
    """Configuration options for offline rendering of original Spaceone.io captures."""

    width: int = 1280
    height: int = 720
    fps: int = 30
    crf: int = 20
    preset: str = "medium"
    graphics: str = "high"
    no_fadeout: bool = False
    overlay_info: bool = False
    start_sec: float = 0.0
    end_sec: float | None = None
    speed: float = 1.0
    lossless_frames: bool = True
    allow_remote_fonts: bool = False
    wasm_dir: Path = DEFAULT_ORIGINAL_WASM_DIR
    assets_dir: Path = DEFAULT_ORIGINAL_ASSETS_DIR


def _install_original_offline_routes(
    page: Any,
    recording_bytes: bytes,
    options: OriginalRenderOptions,
) -> str:
    """
    Serves `original_harness.html`, archived `spaceone.io_wasm.{js,wasm}`,
    `reference/space1-original/assets/`, and `/__recording__.bin` offline.
    """
    wasm_root = Path(options.wasm_dir).resolve()
    assets_root = Path(options.assets_dir).resolve()

    if not ORIGINAL_HARNESS_HTML.is_file():
        raise FileNotFoundError(f"Original harness HTML missing at {ORIGINAL_HARNESS_HTML}")
    if not (wasm_root / "spaceone.io_wasm.js").is_file():
        raise FileNotFoundError(f"Original WASM JS missing under {wasm_root}")
    if not (wasm_root / "spaceone.io_wasm.wasm").is_file():
        raise FileNotFoundError(f"Original WASM binary missing under {wasm_root}")

    def _fulfill_file(route: Any, file_path: Path) -> None:
        ctype = (
            OFFLINE_MIME_TYPES.get(file_path.suffix.lower())
            or mimetypes.guess_type(str(file_path))[0]
            or "application/octet-stream"
        )
        route.fulfill(status=200, path=str(file_path), content_type=ctype)

    def _handle_route(route: Any) -> None:
        url: str = route.request.url
        if url.startswith(("data:", "blob:")):
            route.continue_()
            return

        if options.allow_remote_fonts and url.startswith(
            ("https://fonts.googleapis.com/", "https://fonts.gstatic.com/")
        ):
            route.continue_()
            return

        if url == ORIGINAL_OFFLINE_ORIGIN or url.startswith(f"{ORIGINAL_OFFLINE_ORIGIN}/"):
            raw_path = url[len(ORIGINAL_OFFLINE_ORIGIN) :].split("#", 1)[0].split("?", 1)[0]
            rel = urllib.parse.unquote(raw_path.lstrip("/")) or "index.html"

            if rel in ("", "index.html"):
                route.fulfill(
                    status=200,
                    path=str(ORIGINAL_HARNESS_HTML),
                    content_type="text/html; charset=utf-8",
                )
                return

            if rel == "__recording__.bin":
                route.fulfill(
                    status=200,
                    body=recording_bytes,
                    content_type="application/octet-stream",
                )
                return

            if rel in ("spaceone.io_wasm.js", "spaceone.io_wasm.wasm"):
                fp = (wasm_root / rel).resolve()
                if fp.is_relative_to(wasm_root) and fp.is_file():
                    _fulfill_file(route, fp)
                    return

            asset_fp = (assets_root / rel).resolve()
            if asset_fp.is_relative_to(assets_root) and asset_fp.is_file():
                _fulfill_file(route, asset_fp)
                return

            route.fulfill(status=404, body="Not found")
            return

        route.abort()

    page.route("**/*", _handle_route)
    return ORIGINAL_OFFLINE_ORIGIN


def _setup_original_page(
    page: Any,
    recording_id: str,
    recording_bytes: bytes,
    options: OriginalRenderOptions,
    start_ms: int,
) -> None:
    base_url = _install_original_offline_routes(page, recording_bytes, options)
    query = urllib.parse.urlencode(
        {"allowRemoteFonts": "1" if options.allow_remote_fonts else "0"}
    )
    page.goto(f"{base_url}/?{query}", wait_until="domcontentloaded", timeout=30000)

    page.wait_for_function(
        "() => Boolean(window.__spaceoneOriginalReplay)", timeout=30000
    )
    page.evaluate("() => window.__spaceoneOriginalReplay.waitForReady()")
    page.evaluate(
        "cfg => window.__spaceoneOriginalReplay.configure(cfg)",
        {
            "graphics": options.graphics,
            "noFadeout": options.no_fadeout,
            "overlayInfo": options.overlay_info,
            "recordingId": recording_id,
            "speed": options.speed,
        },
    )
    page.evaluate(
        "args => window.__spaceoneOriginalReplay.loadRecording(args.url, args.startMs)",
        {"url": "/__recording__.bin", "startMs": start_ms},
    )


def render_original_to_mp4(
    recording_path: str | Path,
    output_mp4: str | Path,
    options: OriginalRenderOptions | None = None,
) -> dict[str, Any]:
    """
    Renders an archived original Spaceone.io binary capture to a deterministic H.264
    `.mp4` video using the archived original WASM frontend.
    """
    opts = options or OriginalRenderOptions()
    if opts.width % 2 != 0 or opts.height % 2 != 0:
        raise ValueError("MP4 rendering requires even viewport width and height.")

    ffmpeg_bin, ffprobe_bin = ensure_ffmpeg_tools()
    src_path = resolve_original_recording(recording_path)
    out_path = Path(output_mp4)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    summary = inspect_original_recording(src_path)
    if not summary["playable"]:
        raise ValueError(
            f"Original recording '{src_path}' contains zero WorldUpdate packets."
        )

    duration_ms = int(summary["duration_ms"])
    start_ms = max(0, int(round(opts.start_sec * 1000)))
    if duration_ms > 0 and start_ms >= duration_ms:
        raise ValueError(
            f"--start ({opts.start_sec:.2f}s) must be less than recording duration ({duration_ms / 1000.0:.2f}s)."
        )

    raw_end_ms = (
        duration_ms
        if opts.end_sec is None
        else min(duration_ms, int(round(opts.end_sec * 1000)))
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

    recording_bytes, _, included_packets = slice_original_stream(
        src_path, max_elapsed_ms=end_ms + 1000
    )

    frame_fmt = "png" if opts.lossless_frames else "jpeg"
    input_codec = "png" if opts.lossless_frames else "mjpeg"

    with tempfile.TemporaryDirectory(prefix="orig_render_") as tmp_dir_str:
        ffmpeg_log_path = Path(tmp_dir_str) / "ffmpeg_video.log"
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
            "-movflags",
            "+faststart",
            str(out_path),
        ]

        with sync_playwright() as pw:
            browser = launch_chromium(pw)
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
                        try:
                            _setup_original_page(
                                page, src_path.name, recording_bytes, opts, start_ms
                            )

                            shot_params: dict[str, Any] = {"format": frame_fmt}
                            if frame_fmt == "jpeg":
                                shot_params["quality"] = 94

                            assert ff_proc.stdin is not None
                            for i in range(num_frames):
                                output_ms = (i * 1000.0) / opts.fps
                                page.evaluate(
                                    "t => window.__spaceoneOriginalReplay.stepTo(t)",
                                    output_ms,
                                )
                                shot = cdp.send("Page.captureScreenshot", shot_params)
                                ff_proc.stdin.write(base64.b64decode(shot["data"]))

                            ff_proc.stdin.close()
                            rc = ff_proc.wait()
                            ff_log_fp.flush()
                            if rc != 0:
                                ff_stderr = ffmpeg_log_path.read_text(
                                    encoding="utf-8", errors="replace"
                                )
                                raise RuntimeError(
                                    f"FFmpeg video encode failed ({rc}):\n{ff_stderr}"
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

    probe = probe_media(ffprobe_bin, out_path)
    return {
        "recording": str(src_path),
        "recording_id": src_path.name,
        "output": str(out_path),
        "frames_rendered": num_frames,
        "packets_loaded": included_packets,
        "duration_sec": round(output_duration_sec, 3),
        "range_sec": [round(start_ms / 1000.0, 3), round(end_ms / 1000.0, 3)],
        "viewport": f"{opts.width}x{opts.height}",
        "fps": opts.fps,
        "graphics": opts.graphics,
        "audio": False,
        "size_bytes": out_path.stat().st_size,
        "probe": probe,
    }


def extract_original_frames(
    recording_path: str | Path,
    output_dir: str | Path,
    timestamps_sec: list[float] | None = None,
    interval_sec: float | None = None,
    contact_sheet: bool = False,
    columns: int = 4,
    options: OriginalRenderOptions | None = None,
) -> dict[str, Any]:
    """
    Extracts PNG keyframes (and an optional tiled contact sheet) from an archived
    original Spaceone.io recording over `[start_sec, end_sec]` or explicit timestamps.
    """
    opts = options or OriginalRenderOptions()
    src_path = resolve_original_recording(recording_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = inspect_original_recording(src_path)
    if not summary["playable"]:
        raise ValueError(
            f"Original recording '{src_path}' contains zero WorldUpdate packets."
        )

    duration_sec = summary["duration_ms"] / 1000.0
    start_sec = max(0.0, float(opts.start_sec))
    if summary["duration_ms"] > 0 and start_sec >= duration_sec:
        raise ValueError(
            f"--start ({start_sec:.2f}s) must be less than recording duration ({duration_sec:.2f}s)."
        )
    end_sec = (
        duration_sec
        if opts.end_sec is None
        else min(duration_sec, float(opts.end_sec))
    )
    if opts.end_sec is not None and end_sec <= start_sec:
        raise ValueError(
            f"--end ({opts.end_sec:.2f}s) must be greater than --start ({start_sec:.2f}s)."
        )

    if timestamps_sec:
        targets = sorted(
            {max(0.0, min(duration_sec, float(t))) for t in timestamps_sec}
        )
        setup_start_ms = 0
        base_sec = 0.0
        max_stream_ms = int(round(max(targets) * 1000.0)) + 1000
    else:
        step = max(0.25, interval_sec if interval_sec and interval_sec > 0 else 2.0)
        targets = []
        t = start_sec
        while t <= end_sec + 1e-6:
            targets.append(round(min(end_sec, t), 3))
            t += step
        if not targets:
            targets = [round(start_sec, 3)]
        setup_start_ms = int(round(start_sec * 1000.0))
        base_sec = start_sec
        max_stream_ms = int(round(end_sec * 1000.0)) + 1000

    recording_bytes, _, _ = slice_original_stream(src_path, max_elapsed_ms=max_stream_ms)
    saved_files: list[Path] = []
    frame_opts = OriginalRenderOptions(
        width=opts.width,
        height=opts.height,
        fps=opts.fps,
        crf=opts.crf,
        preset=opts.preset,
        graphics=opts.graphics,
        no_fadeout=opts.no_fadeout,
        overlay_info=opts.overlay_info,
        start_sec=opts.start_sec,
        end_sec=opts.end_sec,
        speed=1.0,
        lossless_frames=opts.lossless_frames,
        allow_remote_fonts=opts.allow_remote_fonts,
        wasm_dir=opts.wasm_dir,
        assets_dir=opts.assets_dir,
    )

    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        try:
            context = browser.new_context(
                viewport={"width": frame_opts.width, "height": frame_opts.height},
                device_scale_factor=1,
            )
            try:
                page = context.new_page()
                cdp = context.new_cdp_session(page)
                _setup_original_page(
                    page, src_path.name, recording_bytes, frame_opts, setup_start_ms
                )
                for idx, t_sec in enumerate(targets):
                    rel_ms = max(0.0, (t_sec - base_sec) * 1000.0)
                    page.evaluate(
                        "t => window.__spaceoneOriginalReplay.stepTo(t)", rel_ms
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
        contact_sheet_path = build_contact_sheet(
            saved_files,
            out_dir / "contact_sheet.png",
            opts.width,
            opts.height,
            columns=columns,
        )

    return {
        "recording": str(src_path),
        "recording_id": src_path.name,
        "output_dir": str(out_dir),
        "frames": [str(p) for p in saved_files],
        "contact_sheet": str(contact_sheet_path) if contact_sheet_path else None,
    }


__all__ = [
    "ORIGINAL_HARNESS_HTML",
    "ORIGINAL_OFFLINE_ORIGIN",
    "OriginalRenderOptions",
    "RENDER_PROFILES",
    "extract_original_frames",
    "render_original_to_mp4",
]
