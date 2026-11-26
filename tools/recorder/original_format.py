"""
Original Spaceone.io binary playback capture reader, stream slicer, and inspector.

Original recordings (preserved in ``reference/space1-original/server-ansible/record/playback/``)
store raw Maestro-tunneled WebSocket frames prefixed with a 12-byte little-endian header:
  - ``uint32 high`` + ``uint32 low``: Unix timestamp in milliseconds ``(high << 32) | low``
  - ``uint32 length``: payload byte length followed by ``length`` payload bytes.
"""

from __future__ import annotations

import datetime
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from .format import is_s1rec_file
from .timeparse import format_timestamp

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_ORIGINAL_PLAYBACK_DIR = (
    REPO_ROOT
    / "reference"
    / "space1-original"
    / "server-ansible"
    / "record"
    / "playback"
)
DEFAULT_ORIGINAL_WASM_DIR = (
    REPO_ROOT / "reference" / "space1-original" / "client" / "wasm"
)
DEFAULT_ORIGINAL_ASSETS_DIR = REPO_ROOT / "reference" / "space1-original" / "assets"

_FRAME_HDR = struct.Struct("<III")
_MIN_PLAUSIBLE_EPOCH_MS = 1_000_000_000_000
_MAX_PLAUSIBLE_EPOCH_MS = 4_000_000_000_000
_MAX_FRAME_PAYLOAD_BYTES = 1024 * 1024

OPCODE_WORLD_UPDATE = 0x10
OPCODE_CELL_ADDED = 0x20
OPCODE_SCOREBOARD = 0x31
OPCODE_BORDERS = 0x40
OPCODE_ANNOUNCEMENT = 0x50
OPCODE_PONG = 0x60


@dataclass
class OriginalPacketRecord:
    """Single timestamped binary packet from an original Spaceone.io recording."""

    index: int
    timestamp_ms: int
    elapsed_ms: int
    payload: bytes


class _BinaryReader:
    """Decodes little-endian primitives and vbyte integers from a binary buffer."""

    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0
        self.length = len(data)

    def has_remaining(self, count: int = 1) -> bool:
        return self.pos + count <= self.length

    def next_uint8(self) -> int:
        val = self.data[self.pos]
        self.pos += 1
        return val

    def next_int16(self) -> int:
        val = struct.unpack_from("<h", self.data, self.pos)[0]
        self.pos += 2
        return val

    def next_uint16(self) -> int:
        val = struct.unpack_from("<H", self.data, self.pos)[0]
        self.pos += 2
        return val

    def next_int32(self) -> int:
        val = struct.unpack_from("<i", self.data, self.pos)[0]
        self.pos += 4
        return val

    def next_uint32(self) -> int:
        val = struct.unpack_from("<I", self.data, self.pos)[0]
        self.pos += 4
        return val

    def next_float32(self) -> float:
        val = struct.unpack_from("<f", self.data, self.pos)[0]
        self.pos += 4
        return val

    def next_double(self) -> float:
        val = struct.unpack_from("<d", self.data, self.pos)[0]
        self.pos += 8
        return val

    def next_utf8_string(self) -> str:
        chars = bytearray()
        while self.pos < self.length:
            c = self.next_uint8()
            if c == 0:
                break
            chars.append(c)
        try:
            return chars.decode("utf-8")
        except UnicodeDecodeError:
            return chars.decode("latin-1", errors="ignore")

    def next_vbyte_integer(self) -> int:
        val = 0
        shift = 0
        while self.pos < self.length:
            b = self.next_uint8()
            val |= (b & 0x7F) << shift
            if (b & 0x80) == 0:
                break
            shift += 7
        return val


def parse_variable_header(reader: _BinaryReader, extra: bool = False) -> int | None:
    """Decodes Maestro/game variable preamble and returns the opcode byte, if present."""
    three_byte_headers = 2 if extra else 1
    for _ in range(three_byte_headers):
        reader.next_uint8()
        reader.next_uint8()
        reader.next_uint8()
        reader.next_vbyte_integer()

    reader.next_uint16()
    vb1 = reader.next_vbyte_integer()
    if vb1 != 0:
        reader.next_uint8()
        reader.next_vbyte_integer()
        if reader.has_remaining():
            return reader.next_uint8()
    return None


def parse_borders(reader: _BinaryReader) -> dict[str, float]:
    """Decodes a `0x40` arena borders and danger-zone boundary packet."""
    borders = {
        "minX": reader.next_double(),
        "minY": reader.next_double(),
        "maxX": reader.next_double(),
        "maxY": reader.next_double(),
    }
    if reader.has_remaining(32):
        borders["deadMinX"] = reader.next_double()
        borders["deadMinY"] = reader.next_double()
        borders["deadMaxX"] = reader.next_double()
        borders["deadMaxY"] = reader.next_double()
    return borders


def parse_announcement(reader: _BinaryReader) -> dict[str, Any]:
    """Decodes a `0x50` kill announcement (`YouKilled`) packet."""
    victim_name = reader.next_utf8_string()
    points_delta = reader.next_int32() if reader.has_remaining(4) else 0
    return {
        "victim_name": victim_name or "an unknown fleet",
        "points_delta": points_delta,
    }


def _parse_cell(reader: _BinaryReader) -> dict[str, Any]:
    cell: dict[str, Any] = {
        "id": reader.next_uint32(),
        "x": reader.next_int32(),
        "y": reader.next_int32(),
        "velX": reader.next_int32(),
        "velY": reader.next_int32(),
        "alpha": reader.next_double(),
        "armor": reader.next_uint8(),
        "radius": reader.next_int16(),
        "flags": reader.next_int16(),
    }
    flags = cell["flags"]
    cell["isFood"] = bool(flags & 1)
    cell["isBullet"] = bool(flags & 2)
    cell["isInDecay"] = bool(flags & 4)
    cell["isSplitting"] = bool(flags & 8)
    cell["shouldExplode"] = bool(flags & 16)

    if cell["isBullet"]:
        cell["bulletLife"] = reader.next_int32()
        cell["maxBulletLife"] = reader.next_int32()

    cell["decayTick"] = 0
    cell["decayTotalTick"] = 0
    if cell["isInDecay"]:
        cell["decayTick"] = reader.next_int16()
        cell["decayTotalTick"] = reader.next_int16()
    return cell


def _parse_fleet(reader: _BinaryReader) -> dict[str, Any]:
    fleet: dict[str, Any] = {
        "id": reader.next_uint32(),
        "fleetSizeOnServer": reader.next_uint16(),
        "bcx": reader.next_int32(),
        "bcy": reader.next_int32(),
        "dbfx": reader.next_double(),
        "dbfy": reader.next_double(),
        "bftx": reader.next_int32(),
        "bfty": reader.next_int32(),
        "foodsEaten": reader.next_int32(),
        "boidsDestroyed": reader.next_int32(),
        "flags": reader.next_uint16(),
        "isSpawnProtected": reader.next_uint8(),
    }
    flags = fleet["flags"]
    fleet["hasColor"] = bool(flags & 1)
    fleet["hasName"] = bool(flags & 2)
    fleet["isDashing"] = bool(flags & 4)

    if fleet["hasColor"]:
        fleet["color"] = (reader.next_uint8(), reader.next_uint8(), reader.next_uint8())

    fleet["selectedSet"] = reader.next_uint8()
    fleet["dashTicks"] = reader.next_int32() if fleet["isDashing"] else 0
    fleet["name"] = reader.next_utf8_string() if fleet["hasName"] else ""
    fleet["leaderboardPosition"] = reader.next_uint32()
    fleet["score"] = reader.next_uint32()
    fleet["isMyFleet"] = reader.next_uint8() == 1
    return fleet


def parse_world_update(reader: _BinaryReader) -> dict[str, Any]:
    """Decodes a complete `0x10` (`S2C_ARENA_STATE`) WorldUpdate packet."""
    wu: dict[str, Any] = {}
    should_render_leader = reader.next_uint8()
    wu["shouldRenderLeader"] = should_render_leader
    if should_render_leader:
        wu["leader_x"] = reader.next_float32()
        wu["leader_y"] = reader.next_float32()

    wu["version"] = reader.next_utf8_string()
    wu["drawStarfield"] = reader.next_uint8()
    wu["isInterpolating"] = reader.next_uint8()
    wu["numValidBoids"] = reader.next_uint16()
    wu["isDangerZone"] = reader.next_uint8()
    wu["cooldownPerc"] = min(1.0, max(reader.next_double(), 0.0))
    wu["currentFoodForNextBoid"] = reader.next_uint8()
    wu["foodForNextBoid"] = reader.next_uint8()

    num_fleets = reader.next_uint32()
    wu["numFleets"] = num_fleets
    fleets: list[dict[str, Any]] = []
    for _ in range(num_fleets):
        fleet_size = reader.next_uint32()
        if fleet_size == 0:
            continue
        fleet = _parse_fleet(reader)
        fleet["cells"] = [_parse_cell(reader) for _ in range(fleet_size)]
        fleets.append(fleet)
    wu["fleets"] = fleets

    num_other = reader.next_uint32()
    wu["numOtherCells"] = num_other
    wu["food"] = [_parse_cell(reader) for _ in range(num_other)]

    num_deleted = reader.next_uint16()
    wu["numDeleted"] = num_deleted
    deleted: list[tuple[int, int]] = []
    for _ in range(num_deleted):
        del_id = reader.next_uint32()
        del_flags = reader.next_uint8()
        deleted.append((del_id, del_flags))
    wu["deleted"] = deleted
    return wu


def resolve_original_recording(
    spec: str | Path,
    playback_dir: Path | None = None,
) -> Path:
    """
    Resolves either an explicit filesystem path or a recording ID inside
    ``reference/space1-original/server-ansible/record/playback/``.
    """
    candidate = Path(spec)
    if candidate.is_file():
        return candidate

    root = playback_dir or DEFAULT_ORIGINAL_PLAYBACK_DIR
    by_id = root / str(spec)
    if by_id.is_file():
        return by_id

    raise FileNotFoundError(
        f"Original Spaceone.io recording '{spec}' not found as a file or under {root}."
    )


def is_original_playback_file(path: str | Path) -> bool:
    """
    Returns True if `path` looks like an original Spaceone.io ``<III`` binary capture
    (and is not a `.s1rec` archive).
    """
    file_path = Path(path)
    if not file_path.is_file():
        return False
    size = file_path.stat().st_size
    if size < _FRAME_HDR.size or is_s1rec_file(file_path):
        return False

    try:
        with open(file_path, "rb") as fp:
            hdr = fp.read(_FRAME_HDR.size)
    except OSError:
        return False

    if len(hdr) < _FRAME_HDR.size:
        return False
    high, low, length = _FRAME_HDR.unpack(hdr)
    ts_ms = (high << 32) | low
    if not (1 <= length <= _MAX_FRAME_PAYLOAD_BYTES):
        return False
    if _FRAME_HDR.size + length > size:
        return False
    return _MIN_PLAUSIBLE_EPOCH_MS <= ts_ms <= _MAX_PLAUSIBLE_EPOCH_MS


def iter_original_packets(path: str | Path) -> Iterator[OriginalPacketRecord]:
    """
    Streams packets from an original binary recording file, stopping cleanly on
    truncated tail frames.
    """
    file_path = Path(path)
    first_ts: int | None = None
    index = 0

    with open(file_path, "rb") as fp:
        while True:
            hdr = fp.read(_FRAME_HDR.size)
            if len(hdr) < _FRAME_HDR.size:
                break
            high, low, length = _FRAME_HDR.unpack(hdr)
            if length > _MAX_FRAME_PAYLOAD_BYTES:
                break
            payload = fp.read(length)
            if len(payload) < length:
                break
            ts_ms = (high << 32) | low
            if first_ts is None:
                first_ts = ts_ms
            elapsed_ms = max(0, ts_ms - first_ts)
            yield OriginalPacketRecord(
                index=index,
                timestamp_ms=ts_ms,
                elapsed_ms=elapsed_ms,
                payload=payload,
            )
            index += 1


def slice_original_stream(
    path: str | Path,
    max_elapsed_ms: int | None = None,
) -> tuple[bytes, int, int]:
    """
    Reads an original recording and returns:
      - ``stream_bytes``: raw ``<III + payload`` framed bytes up to ``max_elapsed_ms``
      - ``total_duration_ms``: full recording duration in milliseconds
      - ``included_packets``: number of packets copied into ``stream_bytes``
    """
    chunks: list[bytes] = []
    total_duration_ms = 0
    included_packets = 0

    for pkt in iter_original_packets(path):
        total_duration_ms = max(total_duration_ms, pkt.elapsed_ms)
        if max_elapsed_ms is None or pkt.elapsed_ms <= max_elapsed_ms:
            high = (pkt.timestamp_ms >> 32) & 0xFFFFFFFF
            low = pkt.timestamp_ms & 0xFFFFFFFF
            chunks.append(_FRAME_HDR.pack(high, low, len(pkt.payload)))
            chunks.append(pkt.payload)
            included_packets += 1

    return b"".join(chunks), total_duration_ms, included_packets


def inspect_original_recording(path: str | Path) -> dict[str, Any]:
    """Produces a detailed timeline, alive-span, border, and event summary."""
    file_path = resolve_original_recording(path)
    total_packets = 0
    world_update_count = 0
    duration_ms = 0
    first_ts_ms: int | None = None
    borders: dict[str, float] | None = None

    player_names_seen: list[str] = []
    player_names_set: set[str] = set()
    my_fleet_ids_seen: list[int] = []
    my_fleet_ids_set: set[int] = set()
    max_fleet_size = 0
    max_score = 0
    dash_events_count = 0
    announcements: list[dict[str, Any]] = []

    alive_segments: list[dict[str, Any]] = []
    active_seg: dict[str, Any] | None = None
    was_dashing = False

    for pkt in iter_original_packets(file_path):
        total_packets += 1
        if first_ts_ms is None:
            first_ts_ms = pkt.timestamp_ms
        duration_ms = pkt.elapsed_ms

        reader = _BinaryReader(pkt.payload)
        try:
            opcode = parse_variable_header(reader)
        except Exception:
            continue

        if opcode == OPCODE_BORDERS:
            try:
                borders = parse_borders(reader)
            except Exception:
                pass
        elif opcode == OPCODE_ANNOUNCEMENT:
            try:
                ann = parse_announcement(reader)
                announcements.append(
                    {
                        "elapsed_ms": pkt.elapsed_ms,
                        "time_fmt": format_timestamp(pkt.elapsed_ms / 1000.0),
                        "victim_name": ann["victim_name"],
                        "points_delta": ann["points_delta"],
                    }
                )
            except Exception:
                pass
        elif opcode == OPCODE_WORLD_UPDATE:
            try:
                wu = parse_world_update(reader)
            except Exception:
                continue

            world_update_count += 1
            my_fleet = next(
                (f for f in wu["fleets"] if f.get("isMyFleet")),
                None,
            )
            my_ship_count = 0
            if my_fleet is not None:
                my_ship_count = sum(
                    1
                    for c in my_fleet.get("cells", [])
                    if not c.get("isBullet") and not c.get("isFood")
                )

            is_alive_now = my_fleet is not None and my_ship_count > 0
            if is_alive_now:
                assert my_fleet is not None
                fid = int(my_fleet["id"])
                fname = str(my_fleet.get("name") or "")
                fsize = int(my_fleet.get("fleetSizeOnServer") or my_ship_count)
                fscore = int(my_fleet.get("score") or 0)
                is_dashing = bool(my_fleet.get("isDashing", False))

                if fid not in my_fleet_ids_set:
                    my_fleet_ids_set.add(fid)
                    my_fleet_ids_seen.append(fid)
                if fname and fname not in player_names_set:
                    player_names_set.add(fname)
                    player_names_seen.append(fname)

                max_fleet_size = max(max_fleet_size, fsize)
                max_score = max(max_score, fscore)
                if is_dashing and not was_dashing:
                    dash_events_count += 1
                was_dashing = is_dashing

                if active_seg is None or active_seg["fleet_id"] != fid:
                    if active_seg is not None:
                        active_seg["end_ms"] = pkt.elapsed_ms
                        active_seg["end_fmt"] = format_timestamp(pkt.elapsed_ms / 1000.0)
                        active_seg["duration_sec"] = round(
                            (active_seg["end_ms"] - active_seg["start_ms"]) / 1000.0, 2
                        )
                        alive_segments.append(active_seg)
                    active_seg = {
                        "index": len(alive_segments) + 1,
                        "start_ms": pkt.elapsed_ms,
                        "end_ms": pkt.elapsed_ms,
                        "start_fmt": format_timestamp(pkt.elapsed_ms / 1000.0),
                        "end_fmt": format_timestamp(pkt.elapsed_ms / 1000.0),
                        "duration_sec": 0.0,
                        "fleet_id": fid,
                        "player_name": fname,
                        "peak_ships": fsize,
                        "peak_score": fscore,
                    }
                else:
                    if fname and not active_seg["player_name"]:
                        active_seg["player_name"] = fname
                    active_seg["peak_ships"] = max(active_seg["peak_ships"], fsize)
                    active_seg["peak_score"] = max(active_seg["peak_score"], fscore)
                    active_seg["end_ms"] = pkt.elapsed_ms
            else:
                was_dashing = False
                if active_seg is not None:
                    active_seg["end_ms"] = pkt.elapsed_ms
                    active_seg["end_fmt"] = format_timestamp(pkt.elapsed_ms / 1000.0)
                    active_seg["duration_sec"] = round(
                        (active_seg["end_ms"] - active_seg["start_ms"]) / 1000.0, 2
                    )
                    alive_segments.append(active_seg)
                    active_seg = None

    if active_seg is not None:
        active_seg["end_ms"] = duration_ms
        active_seg["end_fmt"] = format_timestamp(duration_ms / 1000.0)
        active_seg["duration_sec"] = round(
            (active_seg["end_ms"] - active_seg["start_ms"]) / 1000.0, 2
        )
        alive_segments.append(active_seg)

    recorded_at_utc = (
        datetime.datetime.fromtimestamp(
            first_ts_ms / 1000.0, tz=datetime.timezone.utc
        ).isoformat()
        if first_ts_ms is not None
        else None
    )
    avg_hz = (
        round(world_update_count / (duration_ms / 1000.0), 2)
        if duration_ms > 0
        else 0.0
    )

    return {
        "file": str(file_path),
        "recording_id": file_path.name,
        "file_size_bytes": file_path.stat().st_size,
        "playable": world_update_count > 0,
        "total_packets": total_packets,
        "world_update_count": world_update_count,
        "duration_ms": duration_ms,
        "duration_sec": round(duration_ms / 1000.0, 3),
        "duration_fmt": format_timestamp(duration_ms / 1000.0),
        "avg_snapshot_hz": avg_hz,
        "recorded_at_utc": recorded_at_utc,
        "borders": borders,
        "player_names": player_names_seen,
        "my_fleet_ids": my_fleet_ids_seen,
        "max_fleet_size": max_fleet_size,
        "max_score": max_score,
        "alive_segments": alive_segments,
        "dash_events_count": dash_events_count,
        "announcements": announcements,
    }


def _quick_scan_recording(file_path: Path) -> dict[str, Any]:
    """Fast header-only scan (no WorldUpdate body parsing) for listing playback files."""
    total_packets = 0
    world_update_count = 0
    has_borders = False
    duration_ms = 0
    first_ts_ms: int | None = None

    for pkt in iter_original_packets(file_path):
        total_packets += 1
        if first_ts_ms is None:
            first_ts_ms = pkt.timestamp_ms
        duration_ms = pkt.elapsed_ms

        reader = _BinaryReader(pkt.payload)
        try:
            opcode = parse_variable_header(reader)
        except Exception:
            continue
        if opcode == OPCODE_WORLD_UPDATE:
            world_update_count += 1
        elif opcode == OPCODE_BORDERS:
            has_borders = True

    recorded_at_utc = (
        datetime.datetime.fromtimestamp(
            first_ts_ms / 1000.0, tz=datetime.timezone.utc
        ).isoformat()
        if first_ts_ms is not None
        else None
    )
    return {
        "file": str(file_path),
        "recording_id": file_path.name,
        "file_size_bytes": file_path.stat().st_size,
        "playable": world_update_count > 0,
        "has_borders": has_borders,
        "total_packets": total_packets,
        "world_update_count": world_update_count,
        "duration_ms": duration_ms,
        "duration_sec": round(duration_ms / 1000.0, 3),
        "duration_fmt": format_timestamp(duration_ms / 1000.0),
        "recorded_at_utc": recorded_at_utc,
    }


def list_original_recordings(
    playback_dir: Path | None = None,
    include_empty: bool = False,
    detailed: bool = False,
) -> list[dict[str, Any]]:
    """
    Lists archived original Spaceone.io binary recordings sorted descending by size.
    """
    target_dir = playback_dir or DEFAULT_ORIGINAL_PLAYBACK_DIR
    if not target_dir.is_dir():
        return []

    candidates = sorted(
        (p for p in target_dir.iterdir() if p.is_file()),
        key=lambda p: p.stat().st_size,
        reverse=True,
    )

    items: list[dict[str, Any]] = []
    for file_path in candidates:
        summary = (
            inspect_original_recording(file_path)
            if detailed
            else _quick_scan_recording(file_path)
        )
        if not include_empty and not summary["playable"]:
            continue
        items.append(summary)
    return items
