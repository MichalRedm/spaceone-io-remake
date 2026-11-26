"""
Binary `.s1rec` v1 replay format reader, streaming writer, and session inspector.

Format layout (all multi-byte integers little-endian):
  - Bytes 0..7:  Magic ``S1REC\\x00\\x01\\x00``
  - Bytes 8..11: ``uint32`` header JSON byte length ``H``
  - Bytes 12..(12+H-1): UTF-8 JSON header metadata
  - Repeated until EOF: ``elapsed_ms`` (``uint32``), ``payload_len`` (``uint32``),
    followed by ``payload_len`` bytes of raw serialized ``NetQuantum`` FlatBuffer.
"""

from __future__ import annotations

import contextlib
import gzip
import io
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Iterator

from .flatbuffers_wire import AllMessages, peek_quantum

S1REC_MAGIC = b"S1REC\x00\x01\x00"
_FRAME_HDR = struct.Struct("<II")


@dataclass
class ReplayFrameRecord:
    """Single timestamped NetQuantum packet from a `.s1rec` archive."""

    elapsed_ms: int
    payload: bytes


@dataclass
class ReplayArchive:
    """Loaded `.s1rec` header and frame stream."""

    header: dict[str, Any]
    frames: list[ReplayFrameRecord]
    duration_ms: int


class ReplayWriter:
    """Streaming `.s1rec` / `.s1rec.gz` writer with per-frame flush for crash resilience."""

    def __init__(
        self,
        path: str | Path,
        header: dict[str, Any],
        compress: bool | None = None,
    ) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.compress = (
            self.path.suffix.lower() == ".gz" if compress is None else compress
        )
        self.header = {"version": 1, **header}
        self._fp: BinaryIO | None = None
        self.frame_count = 0
        self.bytes_written = 0
        self.last_elapsed_ms = 0

    def __enter__(self) -> ReplayWriter:
        header_bytes = json.dumps(self.header, ensure_ascii=False).encode("utf-8")
        if self.compress:
            self._fp = gzip.open(self.path, "wb")
        else:
            self._fp = open(self.path, "wb")

        self._fp.write(S1REC_MAGIC)
        self._fp.write(struct.pack("<I", len(header_bytes)))
        self._fp.write(header_bytes)
        self._fp.flush()
        self.bytes_written = len(S1REC_MAGIC) + 4 + len(header_bytes)
        return self

    def write_frame(self, elapsed_ms: int, payload: bytes) -> None:
        if self._fp is None:
            raise RuntimeError("ReplayWriter must be used as a context manager.")
        safe_elapsed = max(self.last_elapsed_ms, max(0, int(elapsed_ms)))
        self._fp.write(_FRAME_HDR.pack(safe_elapsed, len(payload)))
        self._fp.write(payload)
        if not self.compress:
            self._fp.flush()
        self.frame_count += 1
        self.bytes_written += 8 + len(payload)
        self.last_elapsed_ms = safe_elapsed

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if self._fp is not None:
            try:
                self._fp.flush()
            finally:
                self._fp.close()
                self._fp = None


def _open_replay_stream(path: Path) -> BinaryIO:
    with open(path, "rb") as probe:
        prefix = probe.read(2)
    if prefix == b"\x1f\x8b":
        return gzip.open(path, "rb")
    return open(path, "rb")


def is_s1rec_file(path: str | Path) -> bool:
    """Returns True if `path` is a valid raw or gzip-compressed `.s1rec` v1 archive."""
    file_path = Path(path)
    if not file_path.is_file():
        return False
    try:
        with _open_replay_stream(file_path) as stream:
            return _read_exact(stream, len(S1REC_MAGIC)) == S1REC_MAGIC
    except (OSError, EOFError, ValueError):
        return False


def _read_exact(stream: BinaryIO, count: int) -> bytes:
    chunks: list[bytes] = []
    remaining = count
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def iter_replay_frames(
    path: str | Path,
) -> tuple[dict[str, Any], Iterator[ReplayFrameRecord]]:
    """
    Opens a `.s1rec` or `.s1rec.gz` file, parses its JSON header immediately, and returns
    `(header, frame_iterator)`. Stops cleanly if the final frame was truncated mid-write.
    """
    file_path = Path(path)
    stream = _open_replay_stream(file_path)
    try:
        magic = _read_exact(stream, len(S1REC_MAGIC))
        if magic != S1REC_MAGIC:
            raise ValueError(f"Invalid S1REC magic header in {file_path}")
        hdr_len_bytes = _read_exact(stream, 4)
        if len(hdr_len_bytes) < 4:
            raise ValueError(f"Truncated S1REC header length in {file_path}")
        (hdr_len,) = struct.unpack("<I", hdr_len_bytes)
        hdr_raw = _read_exact(stream, hdr_len)
        if len(hdr_raw) < hdr_len:
            raise ValueError(f"Truncated S1REC header JSON in {file_path}")
        header = json.loads(hdr_raw.decode("utf-8"))
    except Exception:
        stream.close()
        raise

    def _gen() -> Iterator[ReplayFrameRecord]:
        try:
            while True:
                frame_hdr = _read_exact(stream, 8)
                if len(frame_hdr) < 8:
                    break
                elapsed_ms, payload_len = _FRAME_HDR.unpack(frame_hdr)
                if payload_len > 32 * 1024 * 1024:
                    break
                payload = _read_exact(stream, payload_len)
                if len(payload) < payload_len:
                    break
                yield ReplayFrameRecord(elapsed_ms=elapsed_ms, payload=payload)
        except (EOFError, OSError, io.BlockingIOError):
            pass
        finally:
            stream.close()

    return header, _gen()


def read_replay(path: str | Path) -> ReplayArchive:
    """Reads an entire `.s1rec` or `.s1rec.gz` archive into memory."""
    header, gen = iter_replay_frames(path)
    with contextlib.closing(gen):
        frames = list(gen)
    duration_ms = frames[-1].elapsed_ms if frames else 0
    return ReplayArchive(header=header, frames=frames, duration_ms=duration_ms)


def inspect_replay(path: str | Path) -> dict[str, Any]:
    """Produces a detailed metadata, timeline, and event summary of a `.s1rec` file."""
    file_path = Path(path)
    header, gen = iter_replay_frames(file_path)

    total_frames = 0
    world_view_frames = 0
    duration_ms = 0
    first_server_time: int | None = None
    last_server_time = 0
    world_size = 0
    max_players = 0
    alive_segments: list[dict[str, int]] = []
    current_alive: bool | None = None
    segment_start = 0
    announcements: list[dict[str, Any]] = []
    fleet_ids_seen: set[int] = set()

    with contextlib.closing(gen):
        for frame in gen:
            total_frames += 1
            duration_ms = frame.elapsed_ms
            try:
                summary = peek_quantum(frame.payload)
            except Exception:
                continue

            if summary.message_type != AllMessages.NetWorldView:
                continue

            world_view_frames += 1
            if first_server_time is None:
                first_server_time = summary.server_time
            last_server_time = summary.server_time
            world_size = summary.world_size or world_size
            max_players = max(max_players, summary.player_count)
            if summary.fleet_id:
                fleet_ids_seen.add(summary.fleet_id)

            if current_alive is None:
                current_alive = summary.is_alive
                segment_start = frame.elapsed_ms
            elif summary.is_alive != current_alive:
                if current_alive:
                    alive_segments.append(
                        {"start_ms": segment_start, "end_ms": frame.elapsed_ms}
                    )
                current_alive = summary.is_alive
                segment_start = frame.elapsed_ms

            for ann in summary.announcements:
                announcements.append(
                    {
                        "elapsed_ms": frame.elapsed_ms,
                        "type": ann.event_type,
                        "text": ann.text,
                        "points_delta": ann.points_delta,
                    }
                )

    if current_alive:
        alive_segments.append({"start_ms": segment_start, "end_ms": duration_ms})

    avg_view_hz = (
        round(world_view_frames / (duration_ms / 1000.0), 2)
        if duration_ms > 0
        else 0.0
    )

    return {
        "file": str(file_path),
        "file_size_bytes": file_path.stat().st_size,
        "header": header,
        "total_frames": total_frames,
        "world_view_frames": world_view_frames,
        "duration_ms": duration_ms,
        "duration_sec": round(duration_ms / 1000.0, 3),
        "avg_snapshot_hz": avg_view_hz,
        "server_time_start_ms": first_server_time or 0,
        "server_time_end_ms": last_server_time,
        "world_size": world_size,
        "max_player_count": max_players,
        "fleet_ids_observed": sorted(fleet_ids_seen),
        "alive_segments": alive_segments,
        "announcements": announcements,
    }
