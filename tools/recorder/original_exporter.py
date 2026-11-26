"""
Trajectory exporter for original Spaceone.io binary playback recordings.
Outputs per-tick ship, bullet, and food kinematics to CSV or JSONL for `analysis/`.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from .original_format import (
    OPCODE_WORLD_UPDATE,
    _BinaryReader,
    iter_original_packets,
    parse_variable_header,
    parse_world_update,
    resolve_original_recording,
)


def _classify_cell(cell: dict[str, Any]) -> str:
    if cell.get("isBullet"):
        return "bullet"
    if cell.get("isFood"):
        return "food"
    return "ship"


def export_original_trajectories(
    recording_path: str | Path,
    output_path: str | Path,
    output_format: str | None = None,
    start_sec: float = 0.0,
    end_sec: float | None = None,
    tracked_only: bool = False,
    ships_only: bool = False,
) -> dict[str, Any]:
    """
    Decodes `0x10` WorldUpdate packets in `[start_sec, end_sec]` and writes CSV or JSONL
    entity trajectories for quantitative physics reconstruction.
    """
    src_path = resolve_original_recording(recording_path)
    out_file = Path(output_path)
    fmt = (
        output_format.lower()
        if output_format
        else ("jsonl" if out_file.suffix.lower() in (".jsonl", ".ndjson") else "csv")
    )
    if fmt not in ("csv", "jsonl"):
        raise ValueError(f"Unsupported export format '{fmt}'. Use 'csv' or 'jsonl'.")

    start_ms = max(0, int(round(start_sec * 1000)))
    end_ms = int(round(end_sec * 1000)) if end_sec is not None else None
    if end_ms is not None and end_ms <= start_ms:
        raise ValueError(
            f"--end ({end_sec:.2f}s) must be greater than --start ({start_sec:.2f}s)."
        )

    out_file.parent.mkdir(parents=True, exist_ok=True)
    rows_written = 0
    ticks_exported = 0
    wu_index = 0
    fleet_names: dict[int, str] = {}

    with open(
        out_file,
        "w",
        newline="" if fmt == "csv" else None,
        encoding="utf-8",
    ) as fp:
        writer = csv.writer(fp) if fmt == "csv" else None
        if writer is not None:
            writer.writerow(
                [
                    "elapsed_ms",
                    "timestamp_ms",
                    "wu_index",
                    "fleet_id",
                    "fleet_name",
                    "fleet_size",
                    "is_my_fleet",
                    "is_dashing",
                    "is_danger_zone",
                    "cell_id",
                    "entity_type",
                    "x",
                    "y",
                    "vx",
                    "vy",
                    "bcx",
                    "bcy",
                    "dbfx",
                    "dbfy",
                    "bftx",
                    "bfty",
                    "radius",
                    "armor",
                    "is_splitting",
                    "is_in_decay",
                ]
            )

        for pkt in iter_original_packets(src_path):
            reader = _BinaryReader(pkt.payload)
            try:
                opcode = parse_variable_header(reader)
            except Exception:
                continue
            if opcode != OPCODE_WORLD_UPDATE:
                continue

            try:
                wu = parse_world_update(reader)
            except Exception:
                continue

            wu_index += 1
            for fleet in wu["fleets"]:
                fid = int(fleet["id"])
                if fleet.get("name"):
                    fleet_names[fid] = str(fleet["name"])

            if pkt.elapsed_ms < start_ms:
                continue
            if end_ms is not None and pkt.elapsed_ms > end_ms:
                break

            ticks_exported += 1
            is_danger = int(bool(wu.get("isDangerZone")))

            for fleet in wu["fleets"]:
                fid = int(fleet["id"])
                is_mine = bool(fleet.get("isMyFleet"))
                if tracked_only and not is_mine:
                    continue

                fname = str(fleet.get("name") or fleet_names.get(fid, ""))
                fsize = int(fleet.get("fleetSizeOnServer") or 0)
                is_dash = int(bool(fleet.get("isDashing")))
                bcx = int(fleet.get("bcx") or 0)
                bcy = int(fleet.get("bcy") or 0)
                dbfx = float(fleet.get("dbfx") or 0.0)
                dbfy = float(fleet.get("dbfy") or 0.0)
                bftx = int(fleet.get("bftx") or 0)
                bfty = int(fleet.get("bfty") or 0)

                for cell in fleet.get("cells", []):
                    etype = _classify_cell(cell)
                    if ships_only and etype != "ship":
                        continue
                    rows_written += 1
                    if writer is not None:
                        writer.writerow(
                            [
                                pkt.elapsed_ms,
                                pkt.timestamp_ms,
                                wu_index,
                                fid,
                                fname,
                                fsize,
                                int(is_mine),
                                is_dash,
                                is_danger,
                                int(cell["id"]),
                                etype,
                                int(cell["x"]),
                                int(cell["y"]),
                                int(cell["velX"]),
                                int(cell["velY"]),
                                bcx,
                                bcy,
                                f"{dbfx:.6f}",
                                f"{dbfy:.6f}",
                                bftx,
                                bfty,
                                int(cell["radius"]),
                                int(cell["armor"]),
                                int(bool(cell.get("isSplitting"))),
                                int(bool(cell.get("isInDecay"))),
                            ]
                        )
                    else:
                        fp.write(
                            json.dumps(
                                {
                                    "elapsed_ms": pkt.elapsed_ms,
                                    "timestamp_ms": pkt.timestamp_ms,
                                    "wu_index": wu_index,
                                    "fleet_id": fid,
                                    "fleet_name": fname,
                                    "fleet_size": fsize,
                                    "is_my_fleet": is_mine,
                                    "is_dashing": bool(is_dash),
                                    "is_danger_zone": bool(is_danger),
                                    "cell_id": int(cell["id"]),
                                    "entity_type": etype,
                                    "x": int(cell["x"]),
                                    "y": int(cell["y"]),
                                    "vx": int(cell["velX"]),
                                    "vy": int(cell["velY"]),
                                    "bcx": bcx,
                                    "bcy": bcy,
                                    "dbfx": dbfx,
                                    "dbfy": dbfy,
                                    "bftx": bftx,
                                    "bfty": bfty,
                                    "radius": int(cell["radius"]),
                                    "armor": int(cell["armor"]),
                                    "is_splitting": bool(cell.get("isSplitting")),
                                    "is_in_decay": bool(cell.get("isInDecay")),
                                }
                            )
                            + "\n"
                        )

            if not tracked_only and not ships_only:
                for food in wu.get("food", []):
                    rows_written += 1
                    if writer is not None:
                        writer.writerow(
                            [
                                pkt.elapsed_ms,
                                pkt.timestamp_ms,
                                wu_index,
                                0,
                                "",
                                0,
                                0,
                                0,
                                is_danger,
                                int(food["id"]),
                                "food",
                                int(food["x"]),
                                int(food["y"]),
                                int(food["velX"]),
                                int(food["velY"]),
                                0,
                                0,
                                "0.000000",
                                "0.000000",
                                0,
                                0,
                                int(food["radius"]),
                                int(food["armor"]),
                                0,
                                int(bool(food.get("isInDecay"))),
                            ]
                        )
                    else:
                        fp.write(
                            json.dumps(
                                {
                                    "elapsed_ms": pkt.elapsed_ms,
                                    "timestamp_ms": pkt.timestamp_ms,
                                    "wu_index": wu_index,
                                    "fleet_id": 0,
                                    "fleet_name": "",
                                    "fleet_size": 0,
                                    "is_my_fleet": False,
                                    "is_dashing": False,
                                    "is_danger_zone": bool(is_danger),
                                    "cell_id": int(food["id"]),
                                    "entity_type": "food",
                                    "x": int(food["x"]),
                                    "y": int(food["y"]),
                                    "vx": int(food["velX"]),
                                    "vy": int(food["velY"]),
                                    "bcx": 0,
                                    "bcy": 0,
                                    "dbfx": 0.0,
                                    "dbfy": 0.0,
                                    "bftx": 0,
                                    "bfty": 0,
                                    "radius": int(food["radius"]),
                                    "armor": int(food["armor"]),
                                    "is_splitting": False,
                                    "is_in_decay": bool(food.get("isInDecay")),
                                }
                            )
                            + "\n"
                        )

    return {
        "recording": str(src_path),
        "output": str(out_file),
        "format": fmt,
        "ticks_exported": ticks_exported,
        "rows_written": rows_written,
    }
