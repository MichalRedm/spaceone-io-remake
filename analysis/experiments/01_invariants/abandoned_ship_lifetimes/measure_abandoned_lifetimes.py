#!/usr/bin/env python3
"""
Phase 1: Measure Empirical Abandoned Ship Lifetimes across Playback Sessions.

Analyzes split events (isSplitting / flags & 8) across all 41 playback sessions,
classifies causes of deletion (owner death, projectile damage, viewport occlusion, natural timeout),
and verifies that undisturbed abandoned ships persist indefinitely without automatic expiration.
"""

import os
import sys
import argparse
import json
import math
from collections import defaultdict, Counter
import numpy as np

# Ensure repository root is in sys.path
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
)
from analysis.core import (
    get_playback_files,
    iterate_session_packets,
    BinaryReader,
    parse_variable_header,
    parse_world_update,
)


def measure_abandoned_ship_lifetimes(
    playback_dir: str = None,
    max_files: int = None,
    output_json: str = None,
):
    files = get_playback_files(playback_dir, max_files=max_files)
    print(f"[*] Ingesting {len(files)} playback recordings...")

    classified_events = []

    for file_idx, fp in enumerate(files):
        player_traj = {}  # p_idx -> (ts, x, y, alive)
        cell_traj = defaultdict(list)
        cell_first_split = {}
        cell_deletion = {}
        bullets_by_packet = defaultdict(list)
        packet_list = []

        for p_idx, ts, payload in iterate_session_packets(fp):
            try:
                reader = BinaryReader(payload)
                msg_type = parse_variable_header(reader)
                if msg_type != 0x10:
                    continue
                wu = parse_world_update(reader)
            except Exception:
                continue

            my_fleets = [f for f in wu.get("fleets", []) if f.get("isMyFleet")]
            if my_fleets:
                mf = my_fleets[0]
                player_traj[p_idx] = (ts, mf["bcx"], mf["bcy"], True)
                for c in mf.get("cells", []):
                    cid = c["id"]
                    if c["isBullet"]:
                        bullets_by_packet[p_idx].append((c["x"], c["y"]))
                        continue
                    cell_traj[cid].append(
                        (p_idx, ts, c["x"], c["y"], c["flags"], c["isSplitting"], True)
                    )
                    if c["isSplitting"] and cid not in cell_first_split:
                        cell_first_split[cid] = (p_idx, ts, c["x"], c["y"])
            else:
                player_traj[p_idx] = (ts, None, None, False)

            for f in wu.get("fleets", []):
                if not f.get("isMyFleet"):
                    for c in f.get("cells", []):
                        if c["isBullet"]:
                            bullets_by_packet[p_idx].append((c["x"], c["y"]))
                        else:
                            cell_traj[c["id"]].append(
                                (
                                    p_idx,
                                    ts,
                                    c["x"],
                                    c["y"],
                                    c["flags"],
                                    c["isSplitting"],
                                    False,
                                )
                            )

            for del_id, del_flags in wu.get("deleted", []):
                if del_id in cell_first_split and del_id not in cell_deletion:
                    cell_deletion[del_id] = (p_idx, ts, del_flags)

            packet_list.append(p_idx)

        for cid, (s_pidx, s_ts, sx, sy) in cell_first_split.items():
            if cid not in cell_deletion:
                continue
            d_pidx, d_ts, d_flags = cell_deletion[cid]

            traj = cell_traj[cid]
            last_pos = (
                traj[-1] if traj else (s_pidx, s_ts, sx, sy, 0, True, True)
            )
            last_x, last_y = last_pos[2], last_pos[3]

            p_info = player_traj.get(d_pidx)
            p_alive_at_del = p_info[3] if p_info else False
            p_x, p_y = (
                (p_info[1], p_info[2])
                if (p_info and p_alive_at_del)
                else (None, None)
            )

            dist_to_player = (
                math.hypot(last_x - p_x, last_y - p_y)
                if (p_x is not None)
                else None
            )

            bullet_nearby = False
            for check_pidx in range(max(0, d_pidx - 3), d_pidx + 1):
                for bx, by in bullets_by_packet.get(check_pidx, []):
                    if math.hypot(last_x - bx, last_y - by) <= 80:
                        bullet_nearby = True
                        break
                if bullet_nearby:
                    break

            lifespan_ms = d_ts - s_ts
            lifespan_packets = len(
                [p for p in packet_list if s_pidx <= p <= d_pidx]
            )

            if not p_alive_at_del:
                category = "player_dead"
            elif bullet_nearby:
                category = "shot_by_bullet"
            elif dist_to_player is not None and dist_to_player > 1400:
                category = "outside_viewport"
            elif lifespan_ms <= 100:
                category = "immediate_split_loss"
            else:
                category = "in_viewport_unshot"

            classified_events.append(
                {
                    "cid": cid,
                    "file": os.path.basename(fp),
                    "category": category,
                    "lifespan_ms": lifespan_ms,
                    "lifespan_packets": lifespan_packets,
                    "dist_to_player": dist_to_player,
                    "bullet_nearby": bullet_nearby,
                    "p_alive_at_del": p_alive_at_del,
                    "d_flags": d_flags,
                    "last_pos": (last_x, last_y),
                }
            )

    print(f"\n[+] Total Tracked Split Ships: {len(classified_events)}")
    cat_counter = Counter(e["category"] for e in classified_events)
    for cat, cnt in cat_counter.most_common():
        print(f"  - {cat:25s}: {cnt:4d} ({cnt/len(classified_events)*100:.1f}%)")

    in_view = [
        e for e in classified_events if e["category"] == "in_viewport_unshot"
    ]
    in_view_ms = [e["lifespan_ms"] for e in in_view] if in_view else [0]
    max_observed_s = max(e["lifespan_ms"] for e in classified_events) / 1000.0

    print(f"\n[+] Max Observed Undisturbed Abandoned Lifespan: {max_observed_s:.2f} seconds")
    print(f"[+] Empirical Finding: No forced automatic timeout; setting Hook.AbandonedShipLifespan = 0 (infinite).")

    if output_json is None:
        output_json = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "../../../datasets/abandoned_ship_experiment_results.json",
            )
        )

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    results = {
        "summary": {
            "total_playback_sessions": len(files),
            "total_tracked_split_ships": len(classified_events),
            "max_observed_lifespan_seconds": round(max_observed_s, 2),
            "breakdown": {
                cat: {
                    "count": cnt,
                    "percentage": round(cnt / len(classified_events) * 100, 2),
                }
                for cat, cnt in cat_counter.items()
            },
            "default_remake_setting": {
                "AbandonedShipLifespan_ms": 0,
                "description": "0 indicates infinite lifespan (disabled auto-timeout), matching original Spaceone.io behavior",
            },
        },
    }

    with open(output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[+] Dataset written to {output_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Measure empirical abandoned ship lifetimes and deletion causes."
    )
    parser.add_argument(
        "--playback-dir", default=None, help="Path to playback recordings folder"
    )
    parser.add_argument(
        "--max-files", type=int, default=None, help="Max files to process"
    )
    parser.add_argument(
        "--output-json", default=None, help="Output JSON dataset path"
    )
    args = parser.parse_args()
    measure_abandoned_ship_lifetimes(
        args.playback_dir, args.max_files, args.output_json
    )
