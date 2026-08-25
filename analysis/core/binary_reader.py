"""
Binary Stream Reader for Spaceone.io Network Packets & Playback Sessions.
Handles little-endian primitive decoding, null-terminated UTF-8 strings, and variable-byte integers.
"""

import struct


class BinaryReader:
    """Decodes little-endian primitives and vbyte integers from a binary buffer."""

    def __init__(self, data: bytes):
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
        chars = []
        while self.pos < self.length:
            c = self.next_uint8()
            if c == 0:
                break
            chars.append(c)
        try:
            return bytes(chars).decode("utf-8")
        except Exception:
            return bytes(chars).decode("latin-1", errors="ignore")

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
