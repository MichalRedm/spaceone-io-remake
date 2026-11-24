"""
Trajectory and event exporter reconstructing full per-tick entity states from `.s1rec` files
for quantitative physics analysis and bot evaluation (`analysis/`).
"""

from __future__ import annotations

import contextlib
import csv
import json
from pathlib import Path
from typing import Any

from .flatbuffers_wire import (
    AllMessages,
    BodyUpdate,
    GroupUpdate,
    decode_world_view_full,
    peek_quantum,
)
from .format import iter_replay_frames


def export_trajectories(
    s1rec_path: str | Path,
    output_path: str | Path,
    output_format: str | None = None,
    start_sec: float = 0.0,
    end_sec: float | None = None,
    tracked_only: bool = False,
    ships_only: bool = False,
) -> dict[str, Any]:
    """
    Reconstructs active bodies and groups across snapshots and exports CSV or JSONL trajectories.
    """
    out_file = Path(output_path)
    fmt = (
        output_format.lower()
        if output_format
        else ("jsonl" if out_file.suffix.lower() in (".jsonl", ".ndjson") else "csv")
    )
    if fmt not in ("csv", "jsonl"):
        raise ValueError(f"Unsupported export format '{fmt}'. Use 'csv' or 'jsonl'.")

    out_file.parent.mkdir(parents=True, exist_ok=True)
    _, gen = iter_replay_frames(s1rec_path)
    bodies: dict[int, BodyUpdate] = {}
    groups: dict[int, GroupUpdate] = {}

    start_ms = max(0, int(round(start_sec * 1000)))
    end_ms = int(round(end_sec * 1000)) if end_sec is not None else None

    rows_written = 0
    ticks_exported = 0

    with contextlib.closing(gen), open(
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
                    "server_time_ms",
                    "tracked_fleet_id",
                    "is_alive",
                    "camera_x",
                    "camera_y",
                    "body_id",
                    "group_id",
                    "group_name",
                    "sprite",
                    "x",
                    "y",
                    "vx",
                    "vy",
                    "angle",
                    "angular_velocity",
                    "size",
                    "mode",
                    "is_tracked_fleet",
                ]
            )
        for frame in gen:
            summary = peek_quantum(frame.payload)
            if summary.message_type != AllMessages.NetWorldView:
                continue

            wv = decode_world_view_full(frame.payload)
            if wv is None:
                continue

            for del_id in wv["deletes"]:
                bodies.pop(del_id, None)
            for gdel_id in wv["group_deletes"]:
                groups.pop(gdel_id, None)
            for g in wv["groups"]:
                groups[g.group_id] = g
            for b in wv["updates"]:
                bodies[b.body_id] = b

            if frame.elapsed_ms < start_ms:
                continue
            if end_ms is not None and frame.elapsed_ms > end_ms:
                break

            ticks_exported += 1
            tracked_fid = int(wv["fleet_id"])
            cam = wv["camera"]
            cam_x = cam.x if cam else 0.0
            cam_y = cam.y if cam else 0.0
            server_t = int(wv["time"])

            for b in bodies.values():
                if tracked_only and (tracked_fid == 0 or b.group_id != tracked_fid):
                    continue
                if ships_only and not b.sprite_name.startswith("ship"):
                    continue

                dt_ms = server_t - b.definition_time
                proj_x = b.x + b.vx * dt_ms
                proj_y = b.y + b.vy * dt_ms
                proj_angle = b.angle + b.angular_velocity * dt_ms
                grp = groups.get(b.group_id)
                grp_name = grp.caption if grp else ""
                is_tracked = bool(tracked_fid and b.group_id == tracked_fid)

                if writer is not None:
                    writer.writerow(
                        [
                            frame.elapsed_ms,
                            server_t,
                            tracked_fid,
                            int(bool(wv["is_alive"])),
                            f"{cam_x:.3f}",
                            f"{cam_y:.3f}",
                            b.body_id,
                            b.group_id,
                            grp_name,
                            b.sprite_name,
                            f"{proj_x:.3f}",
                            f"{proj_y:.3f}",
                            f"{b.vx:.6f}",
                            f"{b.vy:.6f}",
                            f"{proj_angle:.6f}",
                            f"{b.angular_velocity:.6f}",
                            b.size,
                            b.mode,
                            int(is_tracked),
                        ]
                    )
                else:
                    fp.write(
                        json.dumps(
                            {
                                "elapsed_ms": frame.elapsed_ms,
                                "server_time_ms": server_t,
                                "tracked_fleet_id": tracked_fid,
                                "is_alive": bool(wv["is_alive"]),
                                "camera": {"x": cam_x, "y": cam_y},
                                "body_id": b.body_id,
                                "group_id": b.group_id,
                                "group_name": grp_name,
                                "sprite": b.sprite_name,
                                "x": proj_x,
                                "y": proj_y,
                                "vx": b.vx,
                                "vy": b.vy,
                                "angle": proj_angle,
                                "angular_velocity": b.angular_velocity,
                                "size": b.size,
                                "mode": b.mode,
                                "is_tracked_fleet": is_tracked,
                            }
                        )
                        + "\n"
                    )
                rows_written += 1

    return {
        "output": str(out_file),
        "format": fmt,
        "ticks_exported": ticks_exported,
        "rows_written": rows_written,
    }
