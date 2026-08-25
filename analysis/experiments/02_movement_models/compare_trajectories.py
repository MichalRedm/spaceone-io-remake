#!/usr/bin/env python3
"""
Phase 2: Benchmark Simulation Trajectories vs Ground-Truth Playback Tracks.

Steps the discrete C# physics engine side-by-side with identical steering angles,
calculates position RMSE, velocity errors, and outputs JSON metrics for reporting.
"""

import os
import sys
import math
import json
import argparse
from typing import List, Dict, Any
import numpy as np

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core import (
    get_playback_files,
    iterate_world_updates,
    compute_trajectory_rmse,
)


class CSharpShipSimulation:
    def __init__(
        self,
        base_thrust_table: Dict[int, float],
        base_thrust_converter: float,
        drag: float,
        step_ms: float = 40.0,
    ):
        self.base_thrust_table = base_thrust_table
        self.btc = base_thrust_converter
        self.drag = drag
        self.step_ms = step_ms

    def simulate_trajectory(
        self,
        initial_pos: np.ndarray,
        initial_vel: np.ndarray,
        angles: List[float],
        fleet_size: int,
    ) -> np.ndarray:
        thrust_amount = self.base_thrust_table.get(fleet_size, 10.0) * self.btc
        positions = [np.array(initial_pos, dtype=np.float64)]
        momentum = np.array(initial_vel, dtype=np.float64) / self.step_ms

        for angle in angles:
            thrust = (
                np.array([math.cos(angle), math.sin(angle)]) * thrust_amount
            )
            momentum = (momentum + thrust) * self.drag
            pos = positions[-1] + momentum * self.step_ms
            positions.append(pos)

        return np.array(positions)


def extract_continuous_tracks(
    playback_dir: str = None, max_files: int = 15, min_length: int = 50
) -> List[List[Dict[str, Any]]]:
    files = get_playback_files(playback_dir, max_files=max_files)
    print(f"[*] Extracting continuous tracks from {len(files)} playback files...")

    long_tracks = []
    for fpath in files:
        fleet_history = {}
        for tick, wu in iterate_world_updates(fpath):
            for fleet in wu.get("fleets", []):
                f_id = fleet["id"]
                f_size = fleet.get("fleetSizeOnServer", 1)
                if fleet.get("isDashing", False):
                    continue
                for cell in fleet.get("cells", []):
                    if not cell["isBullet"]:
                        if f_id not in fleet_history:
                            fleet_history[f_id] = []
                        fleet_history[f_id].append(
                            {
                                "tick": tick,
                                "x": float(cell["x"]),
                                "y": float(cell["y"]),
                                "vx": float(cell["velX"]),
                                "vy": float(cell["velY"]),
                                "size": f_size,
                            }
                        )
                        break

        for f_id, pts in fleet_history.items():
            if len(pts) >= min_length:
                is_continuous = all(
                    pts[i]["tick"] == pts[i - 1]["tick"] + 1
                    for i in range(1, len(pts))
                )
                if is_continuous:
                    long_tracks.append(pts)

    print(
        f"[+] Found {len(long_tracks)} high-quality continuous ground-truth tracks (>={min_length} frames)."
    )
    return long_tracks


def run_benchmark(
    playback_dir: str = None,
    max_files: int = 15,
    output_json: str = None,
):
    long_tracks = extract_continuous_tracks(playback_dir, max_files=max_files)
    if not long_tracks:
        print("[!] No continuous tracks found.")
        return

    base_thrust_table = {
        1: 13.600,
        2: 11.799,
        3: 10.857,
        5: 9.778,
        10: 8.483,
        20: 7.359,
    }

    candidates = {
        "Default (BTC=0.0012, Drag=0.87)": CSharpShipSimulation(
            base_thrust_table, 0.0012, 0.87
        ),
        "Calibrated Drag=0.90": CSharpShipSimulation(
            base_thrust_table, 0.0012, 0.90
        ),
        "Calibrated Drag=0.85": CSharpShipSimulation(
            base_thrust_table, 0.0012, 0.85
        ),
    }

    results = {}
    for name, sim in candidates.items():
        rmses = []
        for track in long_tracks[:100]:
            initial_pos = np.array([track[0]["x"], track[0]["y"]])
            initial_vel = np.array([track[0]["vx"], track[0]["vy"]])
            f_size = track[0]["size"]

            angles = []
            for i in range(len(track) - 1):
                angles.append(
                    math.atan2(
                        track[i + 1]["y"] - track[i]["y"],
                        track[i + 1]["x"] - track[i]["x"],
                    )
                )

            true_pos = np.array([[p["x"], p["y"]] for p in track])
            sim_pos = sim.simulate_trajectory(
                initial_pos, initial_vel, angles, f_size
            )
            rmse = compute_trajectory_rmse(sim_pos, true_pos)
            rmses.append(rmse)

        mean_rmse = float(np.mean(rmses))
        results[name] = {"mean_rmse": round(mean_rmse, 2), "tracks_evaluated": len(rmses)}
        print(f"  {name:35s}: Mean Trajectory RMSE = {mean_rmse:6.2f} px")

    if output_json is None:
        output_json = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "../../datasets/recording_vs_simulation_comparison.json",
            )
        )

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[+] Benchmark results written to {output_json}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run trajectory tracking benchmark."
    )
    parser.add_argument("--playback-dir", default=None)
    parser.add_argument("--max-files", type=int, default=15)
    parser.add_argument("--output-json", default=None)
    args = parser.parse_args()
    run_benchmark(args.playback_dir, args.max_files, args.output_json)
