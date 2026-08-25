#!/usr/bin/env python3
"""
Phase 1: Validate Viewport Boundaries & Network AOI Culling.

Proves that bullets naturally expire before reaching the network AOI radius,
and measures distance traveled from camera to verify full lifetime fidelity.
"""

import os
import sys
import math
import argparse

# Ensure repository root is in sys.path
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
)
from analysis.core import get_playback_files, iterate_world_updates


def validate_viewport_and_aoi(playback_dir: str = None, sample_file: str = None):
    if sample_file:
        files = [sample_file]
    else:
        files = get_playback_files(playback_dir, max_files=1)

    filepath = files[0]
    print(f"[*] Validating viewport & AOI boundaries on: {os.path.basename(filepath)}")

    spawned = {}
    my_fleet_positions = {}
    all_bullets = []

    for tick, wu in iterate_world_updates(filepath):
        for fleet in wu.get("fleets", []):
            if fleet.get("isMyFleet"):
                my_fleet_positions[tick] = (fleet.get("bcx", 0), fleet.get("bcy", 0))

        for del_id, del_flags in wu.get("deleted", []):
            if del_id in spawned:
                b = spawned[del_id]
                b["del_tick"] = tick
                b["del_flags"] = del_flags
                b["lifespan"] = tick - b["spawn_tick"]

        for fleet in wu.get("fleets", []):
            f_id = fleet["id"]
            ship_cells = [
                c
                for c in fleet.get("cells", [])
                if not c["isBullet"] and not c["isSplitting"]
            ]
            bullet_cells = [c for c in fleet.get("cells", []) if c["isBullet"]]
            f_size = (
                len(ship_cells)
                if len(ship_cells) > 0
                else fleet.get("fleetSizeOnServer", 1)
            )

            for b in bullet_cells:
                b_id = b["id"]
                if b_id not in spawned:
                    rec = {
                        "id": b_id,
                        "fleet_id": f_id,
                        "fleet_size": f_size,
                        "spawn_tick": tick,
                        "spawn_x": b["x"],
                        "spawn_y": b["y"],
                        "velX": b["velX"],
                        "velY": b["velY"],
                        "bLife": b.get("bulletLife"),
                        "maxBLife": b.get("maxBulletLife"),
                        "del_tick": None,
                        "lifespan": None,
                        "is_my_fleet": fleet.get("isMyFleet", False),
                    }
                    spawned[b_id] = rec
                    all_bullets.append(rec)

    full_life = [
        b
        for b in all_bullets
        if b["lifespan"] is not None
        and b["maxBLife"] is not None
        and (b["maxBLife"] - b["lifespan"]) in (0, 1)
        and (b["maxBLife"] - b["bLife"]) <= 1
    ]

    my_full = [b for b in full_life if b["is_my_fleet"]]
    no_del = [b for b in all_bullets if b["del_tick"] is None]

    print(f"\n[+] Total Bullets Processed: {len(all_bullets)}")
    print(f"[+] Total Confirmed Full Lifespans: {len(full_life)}")
    print(
        f"[+] Bullets Without Deletion Packet: {len(no_del)} ({len(no_del)/len(all_bullets)*100:.3f}%)"
    )

    print("\n--- Sample Distance Traveled from Camera (Spawn -> Expiration) ---")
    for s in my_full[:5]:
        cam_spawn = my_fleet_positions.get(s["spawn_tick"], (0, 0))
        dist_spawn = math.hypot(
            s["spawn_x"] - cam_spawn[0], s["spawn_y"] - cam_spawn[1]
        )
        proj_x = s["spawn_x"] + s["velX"] * s["lifespan"]
        proj_y = s["spawn_y"] + s["velY"] * s["lifespan"]
        cam_del = my_fleet_positions.get(s["del_tick"], (0, 0))
        dist_del = math.hypot(proj_x - cam_del[0], proj_y - cam_del[1])
        print(
            f"  ID {s['id']}: FleetSize={s['fleet_size']:2d} | Life={s['lifespan']} ticks ({s['lifespan']*40}ms) | DistSpawn={dist_spawn:5.1f}px | DistDeath={dist_del:6.1f}px"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate viewport and AOI boundaries for bullet lifetimes."
    )
    parser.add_argument(
        "--playback-dir", default=None, help="Playback recordings folder"
    )
    parser.add_argument(
        "--sample-file", default=None, help="Specific playback file to analyze"
    )
    args = parser.parse_args()
    validate_viewport_and_aoi(args.playback_dir, args.sample_file)
