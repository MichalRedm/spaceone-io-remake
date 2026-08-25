#!/usr/bin/env python3
"""
Phase 1: Measure Empirical Shot Cooldowns across Playback Sessions.

Extracts all shot cooldown sequences (cooldownPerc), tracks duration in ticks and ms
as a function of fleet size N, analyzes cooldown step increments, compares with current
remake Hook parameters, and exports results to JSON dataset.
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


def measure_all_shot_cooldowns(
    playback_dir: str = None,
    min_size_bytes: int = 0,
    max_files: int = None,
    output_json: str = None,
):
    files = get_playback_files(playback_dir, min_size_bytes=min_size_bytes, max_files=max_files)
    print(f"[*] Ingesting {len(files)} playback recordings for shot cooldown measurement...")

    # Data structures for cooldown analysis
    # List of all completed cooldown events
    all_events = []
    
    # Detailed sample cooldown traces (for inspecting raw step values)
    traces_by_n = defaultdict(list)

    total_sessions_with_cooldowns = 0

    for file_idx, filepath in enumerate(files):
        session_cooldown_count = 0
        current_cycle = None
        prev_cooldown_perc = 1.0

        for tick, wu in iterate_world_updates(filepath):
            cd_perc = wu.get("cooldownPerc", 1.0)
            num_valid_boids = wu.get("numValidBoids", 0)

            # Find myFleet
            my_fleet = None
            for fleet in wu.get("fleets", []):
                if fleet.get("isMyFleet", False):
                    my_fleet = fleet
                    break

            # Calculate fleet size N
            fleet_size = 0
            if my_fleet is not None:
                ship_cells = [
                    c for c in my_fleet.get("cells", [])
                    if not c.get("isBullet", False) and not c.get("isSplitting", False)
                ]
                fleet_size = len(ship_cells) if len(ship_cells) > 0 else my_fleet.get("fleetSizeOnServer", 0)
            if fleet_size == 0:
                fleet_size = num_valid_boids

            # Detect cooldown transitions
            if prev_cooldown_perc >= 1.0 and cd_perc < 1.0:
                # Shot started!
                current_cycle = {
                    "session_file": os.path.basename(filepath),
                    "start_tick": tick,
                    "start_cd": cd_perc,
                    "start_fleet_size": fleet_size,
                    "num_valid_boids_start": num_valid_boids,
                    "fleet_sizes": [fleet_size],
                    "cd_values": [cd_perc],
                    "stable_fleet_size": True,
                }
            elif current_cycle is not None:
                current_cycle["cd_values"].append(cd_perc)
                current_cycle["fleet_sizes"].append(fleet_size)
                if fleet_size != current_cycle["start_fleet_size"]:
                    current_cycle["stable_fleet_size"] = False

                if cd_perc >= 1.0:
                    # Cooldown cycle completed!
                    current_cycle["end_tick"] = tick
                    current_cycle["duration_ticks"] = tick - current_cycle["start_tick"]
                    current_cycle["duration_ms"] = current_cycle["duration_ticks"] * 40.0
                    all_events.append(current_cycle)
                    session_cooldown_count += 1
                    
                    # Store trace sample
                    n = current_cycle["start_fleet_size"]
                    if len(traces_by_n[n]) < 5:
                        traces_by_n[n].append({
                            "duration_ticks": current_cycle["duration_ticks"],
                            "duration_ms": current_cycle["duration_ms"],
                            "cd_values": [round(v, 6) for v in current_cycle["cd_values"]],
                            "stable_n": current_cycle["stable_fleet_size"],
                        })

                    current_cycle = None

            prev_cooldown_perc = cd_perc

        if session_cooldown_count > 0:
            total_sessions_with_cooldowns += 1

    print(f"\n[+] Total Cooldown Cycles Detected: {len(all_events)}")
    print(f"[+] Sessions with Cooldown Activity: {total_sessions_with_cooldowns}/{len(files)}")

    # Filter stable fleet size events for clean calibration
    stable_events = [e for e in all_events if e["stable_fleet_size"] and e["start_fleet_size"] > 0]
    print(f"[+] Stable Fleet Size Cooldown Cycles: {len(stable_events)} ({len(stable_events)/len(all_events)*100:.1f}%)")

    # Group by fleet size N
    n_stats = defaultdict(lambda: {
        "ticks": [],
        "ms": [],
        "initial_cd_values": [],
        "step_increments": [],
    })

    for e in stable_events:
        N = e["start_fleet_size"]
        n_stats[N]["ticks"].append(e["duration_ticks"])
        n_stats[N]["ms"].append(e["duration_ms"])
        n_stats[N]["initial_cd_values"].append(e["cd_values"][0])
        # Calculate step increments
        steps = [e["cd_values"][i] - e["cd_values"][i-1] for i in range(1, len(e["cd_values"]))]
        if steps:
            n_stats[N]["step_increments"].extend(steps)

    # Print summary table
    print("\n" + "="*85)
    print(f"{'N (Fleet)':<10} | {'Count':<8} | {'Mode Ticks':<12} | {'Mean Ticks (std)':<18} | {'Mean MS':<10} | {'Step (1/ticks)':<15}")
    print("="*85)

    table_rows = []
    reg_N = []
    reg_ticks = []
    reg_ms = []

    for N in sorted(n_stats.keys()):
        st = n_stats[N]
        count = len(st["ticks"])
        if count == 0:
            continue
        
        mode_tick = Counter(st["ticks"]).most_common(1)[0][0]
        mode_tick_count = Counter(st["ticks"]).most_common(1)[0][1]
        mean_ticks = float(np.mean(st["ticks"]))
        std_ticks = float(np.std(st["ticks"]))
        mean_ms = float(np.mean(st["ms"]))
        mean_step = float(np.mean(st["step_increments"])) if st["step_increments"] else 0.0

        if count >= 3 and N <= 50:
            reg_N.append(N)
            reg_ticks.append(mean_ticks)
            reg_ms.append(mean_ms)

        print(f"{N:<10} | {count:<8} | {mode_tick:<12} | {mean_ticks:.2f} (±{std_ticks:.2f}){'':<6} | {mean_ms:<10.1f} | {mean_step:.6f} (~1/{1/mean_step if mean_step > 0 else 0:.1f})")

        table_rows.append({
            "fleet_size": N,
            "sample_count": count,
            "mode_duration_ticks": int(mode_tick),
            "mode_count_percentage": round(mode_tick_count / count * 100, 1),
            "mean_duration_ticks": round(mean_ticks, 3),
            "std_duration_ticks": round(std_ticks, 3),
            "mean_duration_ms": round(mean_ms, 1),
            "mean_step_increment": round(mean_step, 6),
            "current_remake_formula_ms": round(45 * N + 500, 1),
            "physics_model_doc_ms": round(36 * N + 450, 1),
        })

    # Fit linear regressions
    p_ticks = np.polyfit(reg_N, reg_ticks, 1)
    p_ms = np.polyfit(reg_N, reg_ms, 1)
    r_squared = float(np.corrcoef(reg_N, reg_ms)[0, 1] ** 2) if len(reg_N) > 1 else 1.0

    print("\n--- Empirical Shot Cooldown Regression ---")
    print(f"  ticks(N) = {p_ticks[0]:.4f} * N + {p_ticks[1]:.4f}")
    print(f"  ms(N)    = {p_ms[0]:.2f} * N + {p_ms[1]:.2f} ms")
    print(f"  R^2      = {r_squared:.5f}")

    if output_json is None:
        output_json = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "../../../datasets/shot_cooldown_experiment_results.json",
            )
        )

    os.makedirs(os.path.dirname(output_json), exist_ok=True)

    results = {
        "summary": {
            "total_playback_sessions": len(files),
            "sessions_with_cooldowns": total_sessions_with_cooldowns,
            "total_cooldown_events": len(all_events),
            "stable_fleet_size_events": len(stable_events),
            "tick_rate_ms": 40.0,
        },
        "regression_model": {
            "slope_ticks_per_ship": round(float(p_ticks[0]), 4),
            "intercept_ticks": round(float(p_ticks[1]), 4),
            "slope_ms_per_ship": round(float(p_ms[0]), 2),
            "intercept_ms": round(float(p_ms[1]), 2),
            "r_squared": round(r_squared, 5),
        },
        "table_rows": table_rows,
        "sample_traces": {str(k): v for k, v in traces_by_n.items() if k in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20)},
    }

    with open(output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n[+] Dataset written to {output_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Measure shot cooldowns from Spaceone playback sessions."
    )
    parser.add_argument(
        "--playback-dir", default=None, help="Path to playback recordings folder"
    )
    parser.add_argument(
        "--min-size-bytes", type=int, default=0, help="Minimum file size in bytes"
    )
    parser.add_argument(
        "--max-files", type=int, default=None, help="Max files to process"
    )
    parser.add_argument(
        "--output-json", default=None, help="Output JSON dataset path"
    )
    args = parser.parse_args()
    measure_all_shot_cooldowns(
        args.playback_dir, args.min_size_bytes, args.max_files, args.output_json
    )
