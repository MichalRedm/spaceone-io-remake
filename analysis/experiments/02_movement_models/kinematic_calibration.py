#!/usr/bin/env python3
"""
Phase 2: Kinematic Calibration & Empirical Speed Profiler.

Extracts empirical cruise, dash, and projectile velocity profiles across fleet sizes,
and computes optimal parameter fits matching the authoritative C# physics engine.
"""

import os
import sys
import math
import json
import argparse
from collections import defaultdict
import numpy as np

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core import get_playback_files, iterate_world_updates


def extract_empirical_telemetry(playback_dir: str = None, max_files: int = 20):
    files = get_playback_files(playback_dir, max_files=max_files)
    print(f"[*] Ingesting {len(files)} binary playback recordings...")

    fleet_tracks = defaultdict(list)
    bullet_samples = []

    for idx, fpath in enumerate(files):
        for tick, wu in iterate_world_updates(fpath):
            for fleet in wu.get("fleets", []):
                f_id = f"{idx}_{fleet['id']}"
                f_size = fleet.get("fleetSizeOnServer", 1)
                is_dash = fleet.get("isDashing", False)

                for cell in fleet.get("cells", []):
                    if cell["isBullet"]:
                        bullet_samples.append(
                            {
                                "tick": tick,
                                "x": cell["x"],
                                "y": cell["y"],
                                "vx": cell["velX"],
                                "vy": cell["velY"],
                                "speed": math.hypot(cell["velX"], cell["velY"]),
                                "fleet_size": f_size,
                            }
                        )
                    else:
                        fleet_tracks[f_id].append(
                            {
                                "tick": tick,
                                "x": cell["x"],
                                "y": cell["y"],
                                "vx": cell["velX"],
                                "vy": cell["velY"],
                                "speed": math.hypot(cell["velX"], cell["velY"]),
                                "size": f_size,
                                "isDashing": is_dash,
                            }
                        )

    print(
        f"[+] Successfully extracted {len(fleet_tracks)} fleet tracks and {len(bullet_samples)} bullet samples."
    )
    return fleet_tracks, bullet_samples


def run_calibration_experiment(
    playback_dir: str = None,
    max_files: int = 20,
    output_json: str = None,
):
    fleet_tracks, bullet_samples = extract_empirical_telemetry(
        playback_dir, max_files=max_files
    )

    # 1. Bullet stats
    bullet_speeds = [b["speed"] for b in bullet_samples if b["speed"] > 1.0]
    bullet_stats = {
        "count": len(bullet_speeds),
        "median_px_tick": (
            float(np.median(bullet_speeds)) if bullet_speeds else 0.0
        ),
        "mean_px_tick": (
            float(np.mean(bullet_speeds)) if bullet_speeds else 0.0
        ),
        "p90_px_tick": (
            float(np.percentile(bullet_speeds, 90)) if bullet_speeds else 0.0
        ),
        "max_px_tick": float(max(bullet_speeds)) if bullet_speeds else 0.0,
        "median_px_s": (
            float(np.median(bullet_speeds) * 25.0) if bullet_speeds else 0.0
        ),
        "mean_px_s": (
            float(np.mean(bullet_speeds) * 25.0) if bullet_speeds else 0.0
        ),
    }

    # 2. Ship stats
    ship_stats_by_size = {}
    for sz in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20]:
        normal_speeds = []
        dash_speeds = []
        for pts in fleet_tracks.values():
            for p in pts:
                if p["size"] == sz and p["speed"] > 1.0:
                    if p["isDashing"]:
                        dash_speeds.append(p["speed"])
                    else:
                        normal_speeds.append(p["speed"])
        if normal_speeds:
            ship_stats_by_size[str(sz)] = {
                "count": len(normal_speeds),
                "cruise_median_px_tick": float(np.median(normal_speeds)),
                "cruise_mean_px_tick": float(np.mean(normal_speeds)),
                "cruise_speed_px_s": float(np.median(normal_speeds) * 25.0),
                "dash_median_px_tick": (
                    float(np.median(dash_speeds)) if dash_speeds else 0.0
                ),
                "dash_speed_px_s": (
                    float(np.median(dash_speeds) * 25.0) if dash_speeds else 0.0
                ),
            }

    results = {
        "empirical_ground_truth": {
            "ship_speeds_by_size": ship_stats_by_size,
            "bullet_speed": bullet_stats,
        }
    }

    if output_json is None:
        output_json = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "../../datasets/kinematic_calibration_results.json",
            )
        )

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[+] Calibration results saved to {output_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run kinematic calibration analysis."
    )
    parser.add_argument("--playback-dir", default=None)
    parser.add_argument("--max-files", type=int, default=20)
    parser.add_argument("--output-json", default=None)
    args = parser.parse_args()
    run_calibration_experiment(
        args.playback_dir, args.max_files, args.output_json
    )
