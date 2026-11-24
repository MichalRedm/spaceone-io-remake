"""
Zero-dependency FlatBuffers binary wire encoder and decoder matching
`Game.Engine.Networking.FlatBuffers/game.fbs`.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any


class AllMessages(IntEnum):
    """FlatBuffers union tags matching `Game.Engine.Networking.FlatBuffers.AllMessages`."""

    NONE = 0
    NetWorldView = 1
    NetSpawn = 2
    NetEvent = 3
    NetControlInput = 4
    NetPing = 5
    NetLeaderboard = 6
    NetExit = 7
    NetAuthenticate = 8


# Exact 44-byte C# FlatBuffers `NetBody` struct layout:
# id:u32, defTime:u32, origX:f32, origY:f32, velX:f32, velY:f32,
# origAngle:f32, angVel:f32, size:u8, pad(1), sprite:u16, mode:u8, pad(3), group:u32
_NET_BODY_STRUCT = struct.Struct("<IIffffffBxHB3xI")
assert _NET_BODY_STRUCT.size == 44

# Exact 0..72 mapping matching Game.API.Common.Sprites & wwwroot/src/models/spriteIndices.ts
SPRITE_NAMES: dict[int, str] = {
    0: "none",
    1: "ship0",
    2: "ship_green",
    3: "ship_gray",
    4: "ship_orange",
    5: "ship_pink",
    6: "ship_red",
    7: "ship_cyan",
    8: "ship_blue",
    9: "ship_yellow",
    10: "ship_ab_green",
    11: "ship_ab_orange",
    12: "ship_ab_pink",
    13: "ship_ab_red",
    14: "ship_ab_cyan",
    15: "ship_ab_blue",
    16: "ship_ab_yellow",
    17: "ship_flash",
    18: "ship_secret",
    19: "ship_zed",
    20: "bullet_green",
    21: "bullet_orange",
    22: "bullet_pink",
    23: "bullet_red",
    24: "bullet_cyan",
    25: "bullet_blue",
    26: "bullet_yellow",
    27: "fish",
    28: "fish_green",
    29: "fish_orange",
    30: "fish_pink",
    31: "fish_red",
    32: "fish_cyan",
    33: "fish_blue",
    34: "fish_yellow",
    35: "bullet",
    36: "seeker",
    37: "seeker_pickup",
    38: "obstacle",
    39: "arrow",
    40: "ctf_flag_blue",
    41: "ctf_flag_red",
    42: "ctf_base",
    43: "ctf_score_final",
    44: "ctf_score_final_blue",
    45: "ctf_score_final_red",
    46: "ctf_score_left_0",
    47: "ctf_score_left_1",
    48: "ctf_score_left_2",
    49: "ctf_score_left_3",
    50: "ctf_score_left_4",
    51: "ctf_score_right_0",
    52: "ctf_score_right_1",
    53: "ctf_score_right_2",
    54: "ctf_score_right_3",
    55: "ctf_score_right_4",
    56: "ctf_score_stripes",
    57: "ctf_arrow_red",
    58: "ctf_arrow_blue",
    59: "ctf_arrow_trans_flag",
    60: "thruster_green",
    61: "thruster_orange",
    62: "thruster_pink",
    63: "thruster_red",
    64: "thruster_cyan",
    65: "thruster_blue",
    66: "thruster_yellow",
    67: "circles",
    68: "shield",
    69: "shield_pickup",
    70: "wormhole",
    71: "boom",
    72: "ctf_base_red",
}


class MiniFlatBufferBuilder:
    """Minimal back-to-front FlatBuffers binary builder (little-endian)."""

    def __init__(self, initial_size: int = 256) -> None:
        self._buf = bytearray(initial_size)
        self._space = initial_size
        self._minalign = 1
        self._vtable: list[int] = []
        self._object_start = 0
        self._vtables: list[int] = []

    def offset(self) -> int:
        return len(self._buf) - self._space

    def _grow(self) -> None:
        old_len = len(self._buf)
        new_buf = bytearray(old_len * 2)
        new_buf[old_len:] = self._buf
        self._space += old_len
        self._buf = new_buf

    def _prep(self, size: int, additional_bytes: int) -> None:
        if size > self._minalign:
            self._minalign = size
        align_size = ((~(len(self._buf) - self._space + additional_bytes)) + 1) & (size - 1)
        while self._space < align_size + size + additional_bytes:
            self._grow()
        self._pad(align_size)

    def _pad(self, byte_size: int) -> None:
        for _ in range(byte_size):
            self._space -= 1
            self._buf[self._space] = 0

    def _place_bytes(self, raw: bytes) -> None:
        n = len(raw)
        self._space -= n
        self._buf[self._space : self._space + n] = raw

    def put_uint8(self, v: int) -> None:
        self._prep(1, 0)
        self._place_bytes(struct.pack("<B", v & 0xFF))

    def put_bool(self, v: bool) -> None:
        self.put_uint8(1 if v else 0)

    def put_uint16(self, v: int) -> None:
        self._prep(2, 0)
        self._place_bytes(struct.pack("<H", v & 0xFFFF))

    def put_uint32(self, v: int) -> None:
        self._prep(4, 0)
        self._place_bytes(struct.pack("<I", v & 0xFFFFFFFF))

    def put_int32(self, v: int) -> None:
        self._prep(4, 0)
        self._place_bytes(struct.pack("<i", v))

    def put_float32(self, v: float) -> None:
        self._prep(4, 0)
        self._place_bytes(struct.pack("<f", v))

    def put_uoffset(self, target_off: int) -> None:
        self._prep(4, 0)
        rel = self.offset() - target_off + 4
        self._place_bytes(struct.pack("<I", rel))

    def create_string(self, text: str) -> int:
        encoded = text.encode("utf-8")
        self._prep(4, len(encoded) + 1)
        self.put_uint8(0)
        self._place_bytes(encoded)
        self.put_uint32(len(encoded))
        return self.offset()

    def start_object(self, num_fields: int) -> None:
        self._vtable = [0] * num_fields
        self._object_start = self.offset()

    def _slot(self, field_idx: int) -> None:
        self._vtable[field_idx] = self.offset()

    def add_bool(self, idx: int, val: bool, default: bool = False) -> None:
        if val != default:
            self.put_bool(val)
            self._slot(idx)

    def add_uint8(self, idx: int, val: int, default: int = 0) -> None:
        if val != default:
            self.put_uint8(val)
            self._slot(idx)

    def add_uint32(self, idx: int, val: int, default: int = 0) -> None:
        if val != default:
            self.put_uint32(val)
            self._slot(idx)

    def add_float32(self, idx: int, val: float, default: float = 0.0) -> None:
        if val != default:
            self.put_float32(val)
            self._slot(idx)

    def add_offset(self, idx: int, off: int, default: int = 0) -> None:
        if off != default:
            self.put_uoffset(off)
            self._slot(idx)

    def end_object(self) -> int:
        self.put_int32(0)  # placeholder for vtable soffset
        vtableloc = self.offset()
        i = len(self._vtable) - 1
        while i >= 0 and self._vtable[i] == 0:
            i -= 1
        trimmed_len = i + 1

        for j in range(trimmed_len - 1, -1, -1):
            off = vtableloc - self._vtable[j] if self._vtable[j] != 0 else 0
            self.put_uint16(off)

        object_size = vtableloc - self._object_start
        self.put_uint16(object_size)
        vtable_byte_size = (trimmed_len + 2) * 2
        self.put_uint16(vtable_byte_size)

        vtable_pos = self._space
        existing_vtable = 0
        for vt_off in self._vtables:
            vt_pos = len(self._buf) - vt_off
            if self._buf[vt_pos : vt_pos + vtable_byte_size] == self._buf[vtable_pos : vtable_pos + vtable_byte_size]:
                existing_vtable = vt_off
                break

        if existing_vtable != 0:
            self._space = len(self._buf) - vtableloc
            struct.pack_into("<i", self._buf, self._space, existing_vtable - vtableloc)
        else:
            new_vt_off = self.offset()
            self._vtables.append(new_vt_off)
            table_pos = len(self._buf) - vtableloc
            struct.pack_into("<i", self._buf, table_pos, new_vt_off - vtableloc)

        return vtableloc

    def finish(self, root_table_offset: int) -> bytes:
        self._prep(self._minalign, 4)
        self.put_uoffset(root_table_offset)
        return bytes(self._buf[self._space :])


def build_net_ping(
    bandwidth_throttle: int = 1000,
    time: int = 0,
    latency: int = 0,
    fps: int = 60,
    vps: int = 25,
    ups: int = 0,
    cs: int = 0,
    backgrounded: bool = False,
) -> bytes:
    """Builds a `NetQuantum` wrapping a `NetPing` message."""
    b = MiniFlatBufferBuilder(128)
    b.start_object(8)
    b.add_uint32(7, bandwidth_throttle, 0)
    b.add_bool(6, backgrounded, False)
    b.add_uint32(5, cs, 0)
    b.add_uint32(4, ups, 0)
    b.add_uint32(3, vps, 0)
    b.add_uint32(2, fps, 0)
    b.add_uint32(1, latency, 0)
    b.add_uint32(0, time, 0)
    ping_off = b.end_object()

    b.start_object(2)
    b.add_offset(1, ping_off, 0)
    b.add_uint8(0, int(AllMessages.NetPing), 0)
    q_off = b.end_object()
    return b.finish(q_off)


def build_net_control_input(
    spectate_control: str = "",
    angle: float = 0.0,
    x: float = 0.0,
    y: float = 0.0,
    boost: bool = False,
    shoot: bool = False,
    custom_data: str | None = None,
) -> bytes:
    """Builds a `NetQuantum` wrapping a `NetControlInput` message."""
    b = MiniFlatBufferBuilder(256)
    spec_off = b.create_string(spectate_control) if spectate_control else 0
    custom_off = b.create_string(custom_data) if custom_data else 0

    b.start_object(7)
    b.add_offset(6, custom_off, 0)
    b.add_offset(5, spec_off, 0)
    b.add_bool(4, shoot, False)
    b.add_bool(3, boost, False)
    b.add_float32(2, y, 0.0)
    b.add_float32(1, x, 0.0)
    b.add_float32(0, angle, 0.0)
    ctrl_off = b.end_object()

    b.start_object(2)
    b.add_offset(1, ctrl_off, 0)
    b.add_uint8(0, int(AllMessages.NetControlInput), 0)
    q_off = b.end_object()
    return b.finish(q_off)


class _TableReader:
    """Lightweight read-only FlatBuffers table accessor."""

    __slots__ = ("buf", "pos", "vtable_pos", "vtable_len")

    def __init__(self, buf: bytes | memoryview, table_pos: int) -> None:
        self.buf = buf
        self.pos = table_pos
        soffset = struct.unpack_from("<i", buf, table_pos)[0]
        self.vtable_pos = table_pos - soffset
        self.vtable_len = struct.unpack_from("<H", buf, self.vtable_pos)[0]

    def field_offset(self, vtable_byte_offset: int) -> int:
        if vtable_byte_offset >= self.vtable_len:
            return 0
        rel = struct.unpack_from("<H", self.buf, self.vtable_pos + vtable_byte_offset)[0]
        return self.pos + rel if rel != 0 else 0

    def get_uint8(self, vt_off: int, default: int = 0) -> int:
        p = self.field_offset(vt_off)
        return self.buf[p] if p else default

    def get_bool(self, vt_off: int, default: bool = False) -> bool:
        p = self.field_offset(vt_off)
        return bool(self.buf[p]) if p else default

    def get_uint16(self, vt_off: int, default: int = 0) -> int:
        p = self.field_offset(vt_off)
        return struct.unpack_from("<H", self.buf, p)[0] if p else default

    def get_int32(self, vt_off: int, default: int = 0) -> int:
        p = self.field_offset(vt_off)
        return struct.unpack_from("<i", self.buf, p)[0] if p else default

    def get_uint32(self, vt_off: int, default: int = 0) -> int:
        p = self.field_offset(vt_off)
        return struct.unpack_from("<I", self.buf, p)[0] if p else default

    def get_string(self, vt_off: int) -> str | None:
        p = self.field_offset(vt_off)
        if not p:
            return None
        s_pos = p + struct.unpack_from("<I", self.buf, p)[0]
        s_len = struct.unpack_from("<I", self.buf, s_pos)[0]
        return bytes(self.buf[s_pos + 4 : s_pos + 4 + s_len]).decode("utf-8", errors="replace")

    def get_indirect_table(self, vt_off: int) -> _TableReader | None:
        p = self.field_offset(vt_off)
        if not p:
            return None
        t_pos = p + struct.unpack_from("<I", self.buf, p)[0]
        return _TableReader(self.buf, t_pos)

    def get_vector_header(self, vt_off: int) -> tuple[int, int]:
        p = self.field_offset(vt_off)
        if not p:
            return 0, 0
        v_pos = p + struct.unpack_from("<I", self.buf, p)[0]
        length = struct.unpack_from("<I", self.buf, v_pos)[0]
        return v_pos + 4, length


@dataclass
class BodyUpdate:
    body_id: int
    definition_time: int
    x: float
    y: float
    vx: float
    vy: float
    angle: float
    angular_velocity: float
    size: int
    sprite_id: int
    sprite_name: str
    mode: int
    group_id: int


@dataclass
class GroupUpdate:
    group_id: int
    group_type: int
    caption: str
    zindex: int
    owner: int
    color: str
    custom_data: str | None


@dataclass
class AnnouncementEvent:
    event_type: str
    text: str
    points_delta: int
    extra_data: str | None


@dataclass
class QuantumSummary:
    message_type: AllMessages
    server_time: int = 0
    is_alive: bool = False
    fleet_id: int = 0
    world_size: int = 0
    player_count: int = 0
    spectator_count: int = 0
    camera_x: float = 0.0
    camera_y: float = 0.0
    updates_count: int = 0
    deletes_count: int = 0
    event_type: str | None = None
    event_data: str | None = None
    announcements: list[AnnouncementEvent] = field(default_factory=list)


def _decode_net_body(buf: bytes | memoryview, pos: int) -> BodyUpdate:
    (
        body_id,
        def_time,
        orig_x,
        orig_y,
        vel_x,
        vel_y,
        orig_angle,
        ang_vel,
        raw_size,
        sprite_id,
        mode,
        group_id,
    ) = _NET_BODY_STRUCT.unpack_from(buf, pos)
    sprite_name = (
        f"map[{sprite_id - 1000}]"
        if sprite_id >= 1000
        else SPRITE_NAMES.get(sprite_id, f"sprite_{sprite_id}")
    )
    return BodyUpdate(
        body_id=body_id,
        definition_time=def_time,
        x=orig_x,
        y=orig_y,
        vx=vel_x,
        vy=vel_y,
        angle=orig_angle,
        angular_velocity=ang_vel,
        size=(0 if raw_size == 255 else raw_size) * 5,
        sprite_id=sprite_id,
        sprite_name=sprite_name,
        mode=mode,
        group_id=group_id,
    )


def _decode_announcements(wv: _TableReader) -> list[AnnouncementEvent]:
    vec_start, count = wv.get_vector_header(20)
    items: list[AnnouncementEvent] = []
    for i in range(count):
        slot = vec_start + i * 4
        t_pos = slot + struct.unpack_from("<I", wv.buf, slot)[0]
        ann = _TableReader(wv.buf, t_pos)
        items.append(
            AnnouncementEvent(
                event_type=ann.get_string(6) or "",
                text=ann.get_string(4) or "",
                points_delta=ann.get_int32(8, 0),
                extra_data=ann.get_string(10),
            )
        )
    return items


def peek_quantum(payload: bytes) -> QuantumSummary:
    """Extracts high-level metadata from a serialized `NetQuantum` FlatBuffer packet."""
    root_pos = struct.unpack_from("<I", payload, 0)[0]
    q = _TableReader(payload, root_pos)
    msg_type_raw = q.get_uint8(4, 0)
    try:
        msg_type = AllMessages(msg_type_raw)
    except ValueError:
        msg_type = AllMessages.NONE

    summary = QuantumSummary(message_type=msg_type)

    if msg_type == AllMessages.NetWorldView:
        wv = q.get_indirect_table(6)
        if wv is None:
            return summary
        summary.server_time = wv.get_uint32(4, 0)
        cam_pos = wv.field_offset(6)
        if cam_pos:
            cam = _decode_net_body(payload, cam_pos)
            summary.camera_x = cam.x
            summary.camera_y = cam.y
        summary.fleet_id = wv.get_uint32(8, 0)
        summary.is_alive = wv.get_bool(10, True)
        _, summary.updates_count = wv.get_vector_header(12)
        _, summary.deletes_count = wv.get_vector_header(14)
        summary.player_count = wv.get_uint32(22, 0)
        summary.spectator_count = wv.get_uint32(24, 0)
        summary.world_size = wv.get_uint16(30, 0)
        summary.announcements = _decode_announcements(wv)
    elif msg_type == AllMessages.NetEvent:
        ev = q.get_indirect_table(6)
        if ev is not None:
            summary.event_type = ev.get_string(4)
            summary.event_data = ev.get_string(6)

    return summary


def decode_world_view_full(payload: bytes) -> dict[str, Any] | None:
    """
    Fully decodes a `NetWorldView` packet (camera, updates, deletes, groups,
    groupDeletes, announcements) for trajectory export and inspection.
    """
    root_pos = struct.unpack_from("<I", payload, 0)[0]
    q = _TableReader(payload, root_pos)
    if q.get_uint8(4, 0) != int(AllMessages.NetWorldView):
        return None

    wv = q.get_indirect_table(6)
    if wv is None:
        return None

    cam_pos = wv.field_offset(6)
    camera = _decode_net_body(payload, cam_pos) if cam_pos else None

    updates_start, updates_len = wv.get_vector_header(12)
    updates = [
        _decode_net_body(payload, updates_start + i * 44)
        for i in range(updates_len)
    ]

    deletes_start, deletes_len = wv.get_vector_header(14)
    deletes = [
        struct.unpack_from("<I", payload, deletes_start + i * 4)[0]
        for i in range(deletes_len)
    ]

    groups_start, groups_len = wv.get_vector_header(16)
    groups: list[GroupUpdate] = []
    for i in range(groups_len):
        slot = groups_start + i * 4
        t_pos = slot + struct.unpack_from("<I", payload, slot)[0]
        g = _TableReader(payload, t_pos)
        groups.append(
            GroupUpdate(
                group_id=g.get_uint32(4, 0),
                group_type=g.get_uint8(6, 0),
                caption=g.get_string(8) or "",
                zindex=g.get_uint32(10, 0),
                owner=g.get_uint32(12, 0),
                color=g.get_string(14) or "",
                custom_data=g.get_string(16),
            )
        )

    gdel_start, gdel_len = wv.get_vector_header(18)
    group_deletes = [
        struct.unpack_from("<I", payload, gdel_start + i * 4)[0]
        for i in range(gdel_len)
    ]

    return {
        "time": wv.get_uint32(4, 0),
        "fleet_id": wv.get_uint32(8, 0),
        "is_alive": wv.get_bool(10, True),
        "camera": camera,
        "updates": updates,
        "deletes": deletes,
        "groups": groups,
        "group_deletes": group_deletes,
        "announcements": _decode_announcements(wv),
        "player_count": wv.get_uint32(22, 0),
        "spectator_count": wv.get_uint32(24, 0),
        "cooldown_shoot": wv.get_uint8(26, 0),
        "cooldown_boost": wv.get_uint8(28, 0),
        "world_size": wv.get_uint16(30, 0),
        "custom_data": wv.get_string(32),
    }
