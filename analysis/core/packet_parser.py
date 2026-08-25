"""
Packet Parser & Schema Decoders for Spaceone.io Authoritative Server Protocol.
Parses WorldUpdates (0x10), Fleets, Cells, DeletedCells, and Borders (0x40).
"""

from typing import Dict, Any, Optional
from .binary_reader import BinaryReader


def parse_variable_header(reader: BinaryReader, extra: bool = False) -> Optional[int]:
    """Decodes packet preamble and returns the message type opcode (e.g. 0x10 for WorldUpdate)."""
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


def parse_cell(reader: BinaryReader) -> Dict[str, Any]:
    """Decodes a single Ship, Bullet, or Food cell from the binary stream."""
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

    cell["decayTick"] = 0
    cell["decayTotalTick"] = 0
    if cell["isInDecay"]:
        cell["decayTick"] = reader.next_int16()
        cell["decayTotalTick"] = reader.next_int16()

    return cell


def parse_fleet(reader: BinaryReader) -> Dict[str, Any]:
    """Decodes fleet metadata including centroid, flags, skin, and score."""
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


def parse_borders(reader: BinaryReader) -> Dict[str, float]:
    """Decodes arena boundary coordinates and danger zone margins."""
    b = {
        "minX": reader.next_double(),
        "minY": reader.next_double(),
        "maxX": reader.next_double(),
        "maxY": reader.next_double(),
    }
    if reader.has_remaining(32):
        b["deadMinX"] = reader.next_double()
        b["deadMinY"] = reader.next_double()
        b["deadMaxX"] = reader.next_double()
        b["deadMaxY"] = reader.next_double()
    return b


def parse_world_update(reader: BinaryReader) -> Dict[str, Any]:
    """Decodes a complete 0x10 WorldUpdate packet."""
    wu: Dict[str, Any] = {}
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
