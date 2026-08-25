#!/usr/bin/env python3
"""
Phase 1: Measure Empirical Bullet Lifetimes across Playback Sessions.

Extracts fresh bullet firings, identifies full natural expirations vs premature destructions,
computes lifetime statistics per fleet size N, and exports results to JSON.
"""

import os
import sys
import argparse
import json
from collections import defaultdict, Counter
import numpy as np

# Ensure repository root is in sys.path
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
)
from analysis.core import get_playback_files, iterate_world_updates


def measure_all_bullet_lifetimes(
    playback_dir: str = None,
    max_files: int = None,
    output_json: str = None,
):
    files = get_playback_files(playback_dir, max_files=max_files)
    print(f"[*] Ingesting {len(files)} playback recordings...")

    fleet_stats = defaultdict(
        lambda: {
            "total": 0,
            "full": 0,
            "premature": 0,
            "max_lifes": [],
            "full_lifespans": [],
            "premature_lifespans": [],
        }
    )
    total_fresh_bullets = 0

    for file_idx, filepath in enumerate(files):
        spawned = {}
        for tick, wu in iterate_world_updates(filepath):
            # 1. Process deletions
            for del_id, del_flags in wu.get("deleted", []):
                if del_id in spawned:
                    b = spawned[del_id]
                    b["del_tick"] = tick
                    b["del_flags"] = del_flags
                    b["lifespan"] = tick - b["spawn_tick"]

            # 2. Process fleets & bullets
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
                        spawned[b_id] = {
                            "id": b_id,
                            "fleet_id": f_id,
                            "fleet_size": f_size,
                            "spawn_tick": tick,
                            "bLife": b.get("bulletLife"),
                            "maxBLife": b.get("maxBulletLife"),
                            "del_tick": None,
                            "lifespan": None,
                        }

        # Tally session results
        for b_id, b in spawned.items():
            if b["bLife"] is not None and b["maxBLife"] is not None:
                if b["maxBLife"] - b["bLife"] <= 1:
                    total_fresh_bullets += 1
                    N = b["fleet_size"]
                    max_l = b["maxBLife"]
                    life = b["lifespan"]

                    fleet_stats[N]["total"] += 1
                    fleet_stats[N]["max_lifes"].append(max_l)

                    if life is not None:
                        diff = max_l - life
                        if diff in (0, 1):
                            fleet_stats[N]["full"] += 1
                            fleet_stats[N]["full_lifespans"].append(life)
                        elif diff > 1:
                            fleet_stats[N]["premature"] += 1
                            fleet_stats[N]["premature_lifespans"].append(life)

    total_full = sum(st["full"] for st in fleet_stats.values())
    total_premature = sum(st["premature"] for st in fleet_stats.values())

    print(f"\n[+] Total Fresh Shots: {total_fresh_bullets}")
    print(
        f"[+] Confident Full Expirations: {total_full} ({total_full/(total_full+total_premature)*100:.2f}%)"
    )
    print(
        f"[+] Premature Destructions: {total_premature} ({total_premature/(total_full+total_premature)*100:.2f}%)"
    )

    table_rows = []
    reg_N, reg_ticks, reg_ms = [], [], []

    for N in sorted(fleet_stats.keys()):
        st = fleet_stats[N]
        if st["total"] >= 10:
            max_mode = Counter(st["max_lifes"]).most_common(1)[0]
            full_mean = (
                float(np.mean(st["full_lifespans"])) if st["full_lifespans"] else 0.0
            )
            full_std = (
                float(np.std(st["full_lifespans"])) if st["full_lifespans"] else 0.0
            )
            full_ms = full_mean * 40.0

            if N <= 50 and st["full"] >= 5:
                reg_N.append(N)
                reg_ticks.append(full_mean)
                reg_ms.append(full_ms)

            table_rows.append(
                {
                    "fleet_size": N,
                    "total_shots": st["total"],
                    "full_shots": st["full"],
                    "premature_shots": st["premature"],
                    "maxBLife_mode_ticks": int(max_mode[0]),
                    "maxBLife_mode_count_pct": f"{max_mode[1]/len(st['max_lifes'])*100:.1f}%",
                    "full_life_mean_ticks": round(full_mean, 2),
                    "full_life_std_ticks": round(full_std, 2),
                    "full_life_mean_ms": round(full_ms, 1),
                    "remake_hook_ms": 1900 + 25 * N,
                }
            )

    p_ticks = np.polyfit(reg_N, reg_ticks, 1)
    p_ms = np.polyfit(reg_N, reg_ms, 1)

    print("\n--- Empirical Bullet Lifetime Regression ---")
    print(f"  ticks(N) = {p_ticks[0]:.4f} * N + {p_ticks[1]:.4f}")
    print(f"  ms(N)    = {p_ms[0]:.2f} * N + {p_ms[1]:.2f} ms")

    if output_json is None:
        output_json = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "../../../datasets/bullet_lifetime_experiment_results.json",
            )
        )

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    results = {
        "summary": {
            "total_playback_sessions": len(files),
            "total_fresh_bullets": total_fresh_bullets,
            "total_full_natural_expirations": total_full,
            "total_premature_destructions": total_premature,
            "full_lifetime_percentage": round(
                total_full / (total_full + total_premature) * 100, 2
            ),
            "premature_percentage": round(
                total_premature / (total_full + total_premature) * 100, 2
            ),
            "tick_rate_ms": 40.0,
        },
        "regression_model": {
            "slope_ticks_per_ship": round(float(p_ticks[0]), 4),
            "intercept_ticks": round(float(p_ticks[1]), 4),
            "slope_ms_per_ship": round(float(p_ms[0]), 2),
            "intercept_ms": round(float(p_ms[1]), 2),
            "r_squared": round(
                float(np.corrcoef(reg_N, reg_ms)[0, 1] ** 2), 5
            ),
        },
        "table_rows": table_rows,
    }

    with open(output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[+] Dataset written to {output_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract bullet lifetime statistics from Spaceone playback sessions."
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
    measure_all_bullet_lifetimes(
        args.playback_dir, args.max_files, args.output_json
    )
