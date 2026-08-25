#!/usr/bin/env python3
"""
Telemetry Extraction Tool for Spaceone.io Reference Recordings.
Extracts empirical kinematic profiles, velocities, lifetimes, and arena borders.
"""

import os
import sys
import glob
import struct
import argparse
from collections import defaultdict, Counter

class BinaryReader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.length = len(data)

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

def parse_variable_header(reader: BinaryReader, extra: bool = False):
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
        if reader.pos < reader.length:
            msg_type = reader.next_uint8()
            return msg_type
    return None

def parse_cell(reader: BinaryReader) -> dict:
    cell = {
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
    cell["isFood"] = bool(cell["flags"] & 1)
    cell["isBullet"] = bool(cell["flags"] & 2)
    cell["isInDecay"] = bool(cell["flags"] & 4)
    cell["isSplitting"] = bool(cell["flags"] & 8)
    cell["shouldExplode"] = bool(cell["flags"] & 16)

    if cell["isBullet"]:
        cell["bulletLife"] = reader.next_int32()
        cell["maxBulletLife"] = reader.next_int32()

    if cell["isInDecay"]:
        cell["decayTick"] = reader.next_int16()
        cell["decayTotalTick"] = reader.next_int16()

    return cell

def parse_fleet(reader: BinaryReader) -> dict:
    fleet = {
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
    fleet["hasColor"] = bool(fleet["flags"] & 1)
    fleet["hasName"] = bool(fleet["flags"] & 2)
    fleet["isDashing"] = bool(fleet["flags"] & 4)

    if fleet["hasColor"]:
        fleet["color"] = (reader.next_uint8(), reader.next_uint8(), reader.next_uint8())

    fleet["selectedSet"] = reader.next_uint8()

    if fleet["isDashing"]:
        fleet["dashTicks"] = reader.next_int32()

    fleet["name"] = reader.next_utf8_string() if fleet["hasName"] else ""
    fleet["leaderboardPosition"] = reader.next_uint32()
    fleet["score"] = reader.next_uint32()
    fleet["isMyFleet"] = reader.next_uint8() == 1
    return fleet

def parse_borders(reader: BinaryReader) -> dict:
    b = {
        "minX": reader.next_double(),
        "minY": reader.next_double(),
        "maxX": reader.next_double(),
        "maxY": reader.next_double(),
    }
    if reader.pos < reader.length:
        b["deadMinX"] = reader.next_double()
        b["deadMinY"] = reader.next_double()
        b["deadMaxX"] = reader.next_double()
        b["deadMaxY"] = reader.next_double()
    return b

def parse_world_update(reader: BinaryReader) -> dict:
    wu = {}
    wu["shouldRenderLeader"] = reader.next_uint8()
    if wu["shouldRenderLeader"]:
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

    wu["numFleets"] = reader.next_uint32()
    wu["fleets"] = []
    for _ in range(wu["numFleets"]):
        fleet_size = reader.next_uint32()
        if fleet_size == 0:
            continue
        fleet = parse_fleet(reader)
        fleet["cells"] = [parse_cell(reader) for _ in range(fleet_size)]
        wu["fleets"].append(fleet)

    wu["numOtherCells"] = reader.next_uint32()
    wu["food"] = [parse_cell(reader) for _ in range(wu["numOtherCells"])]

    wu["numDeleted"] = reader.next_uint16()
    wu["deleted"] = []
    for _ in range(wu["numDeleted"]):
        del_id = reader.next_uint32()
        del_flags = reader.next_uint8()
        wu["deleted"].append((del_id, del_flags))

    return wu

def extract_telemetry(playback_dir: str, output_csv: str = None, max_files: int = 15):
    files = [
        f for f in glob.glob(os.path.join(playback_dir, "*"))
        if os.path.isfile(f) and os.path.getsize(f) > 500000
    ]
    files.sort(key=lambda x: os.path.getsize(x), reverse=True)

    print(f"Processing {min(len(files), max_files)} largest session streams from {playback_dir}...")

    borders_list = []
    ship_speeds = defaultdict(list)
    bullet_speeds = defaultdict(list)
    bullet_lifetimes = defaultdict(list)

    for filepath in files[:max_files]:
        with open(filepath, "rb") as f:
            data = f.read()

        pos = 0
        while pos + 12 <= len(data):
            high, low, length = struct.unpack_from("<III", data, pos)
            ticks = (high << 32) | low
            payload = data[pos+12 : pos+12+length]
            pos += 12 + length

            try:
                reader = BinaryReader(payload)
                msg_type = parse_variable_header(reader)
                if msg_type == 0x40:
                    borders_list.append(parse_borders(reader))
                elif msg_type == 0x10:
                    wu = parse_world_update(reader)
                    for fleet in wu["fleets"]:
                        ship_cells = [c for c in fleet["cells"] if not c["isBullet"] and not c["isSplitting"]]
                        bullet_cells = [c for c in fleet["cells"] if c["isBullet"]]
                        fsize = len(ship_cells)
                        if fsize == 0:
                            continue

                        for c in ship_cells:
                            spd = (c["velX"]**2 + c["velY"]**2)**0.5
                            if spd > 0.1:
                                ship_speeds[fsize].append(spd)

                        for b in bullet_cells:
                            bspd = (b["velX"]**2 + b["velY"]**2)**0.5
                            if bspd > 1.0:
                                bullet_speeds[fsize].append(bspd)
                            if "maxBulletLife" in b and b["maxBulletLife"] > 0:
                                bullet_lifetimes[fsize].append(b["maxBulletLife"])
            except Exception:
                pass

    print("\n=======================================================")
    print("  EMPIRICAL TELEMETRY EXTRACTION RESULTS (Spaceone.io) ")
    print("=======================================================")
    if borders_list:
        b = borders_list[0]
        print(f"Arena Boundaries: X, Y in [{b['minX']:.2f}, {b['maxX']:.2f}] (Span: {b['maxX']-b['minX']:.2f})")
        print(f"Danger Zone:      X, Y in [{b.get('deadMinX', 0):.2f}, {b.get('deadMaxX', 0):.2f}] (Margin: {b['maxX']-b.get('deadMaxX', 0):.2f})")

    print("\nFleet Cruise Speeds (Displacement / 40ms tick):")
    for size in sorted(ship_speeds.keys()):
        if size in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30]:
            spds = ship_speeds[size]
            spds.sort()
            median = spds[len(spds)//2]
            print(f"  Fleet size {size:2d}: median = {median:.2f} px/tick ({median*25:.1f} px/s), N={len(spds)}")

    print("\nBullet Velocities (Displacement / 40ms tick):")
    for size in sorted(bullet_speeds.keys()):
        if size in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30]:
            bspds = bullet_speeds[size]
            bspds.sort()
            median = bspds[len(bspds)//2]
            print(f"  Fleet size {size:2d}: median = {median:.2f} px/tick ({median*25:.1f} px/s), N={len(bspds)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract telemetry from original Spaceone recordings.")
    parser.add_argument(
        "--playback-dir",
        default=os.path.join(os.path.dirname(__file__), "..", "..", "reference", "space1-original", "server-ansible", "record", "playback"),
        help="Path to playback recordings directory"
    )
    args = parser.parse_args()
    extract_telemetry(os.path.abspath(args.playback_dir))
