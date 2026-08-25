"""
Session Loader & Batch Iterators for Playback Files.
Provides clean Python generators to iterate through recorded WebSocket packet streams.
"""

import os
import glob
import struct
from typing import Generator, List, Tuple, Optional, Dict, Any
from .binary_reader import BinaryReader
from .packet_parser import parse_variable_header, parse_world_update, parse_borders


def get_playback_files(
    playback_dir: Optional[str] = None,
    min_size_bytes: int = 500000,
    max_files: Optional[int] = None,
) -> List[str]:
    """Returns sorted list of playback files descending by size."""
    if playback_dir is None:
        playback_dir = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "reference",
                "space1-original",
                "server-ansible",
                "record",
                "playback",
            )
        )

    files = [
        f
        for f in glob.glob(os.path.join(playback_dir, "*"))
        if os.path.isfile(f) and os.path.getsize(f) >= min_size_bytes
    ]
    files.sort(key=lambda x: os.path.getsize(x), reverse=True)
    if max_files:
        files = files[:max_files]
    return files


def iterate_session_packets(
    filepath: str,
) -> Generator[Tuple[int, int, bytes], None, None]:
    """
    Iterates through binary frames in a .playback file.
    Yields (tick_index, timestamp_ms, payload_bytes).
    """
    with open(filepath, "rb") as f:
        data = f.read()

    pos = 0
    tick_index = 0
    while pos + 12 <= len(data):
        high, low, length = struct.unpack_from("<III", data, pos)
        timestamp_ms = (high << 32) | low
        payload = data[pos + 12 : pos + 12 + length]
        pos += 12 + length

        yield tick_index, timestamp_ms, payload
        tick_index += 1


def iterate_world_updates(
    filepath: str,
) -> Generator[Tuple[int, Dict[str, Any]], None, None]:
    """
    Decodes and yields (tick_index, world_update_dict) for all 0x10 WorldUpdate packets in a session.
    """
    for tick_index, _, payload in iterate_session_packets(filepath):
        try:
            reader = BinaryReader(payload)
            msg_type = parse_variable_header(reader)
            if msg_type == 0x10:
                wu = parse_world_update(reader)
                yield tick_index, wu
        except Exception:
            continue
