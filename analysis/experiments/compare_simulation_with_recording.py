#!/usr/bin/env python3
"""
Direct Kinematic Comparison: Spaceone Recording vs. Remake C# Simulation
-------------------------------------------------------------------------
Extracts true trajectories from recorded sessions and steps our exact C#
discrete physics engine (Ship.cs / Fleet.cs / Body.cs) side-by-side with
identical inputs, calculating trajectory MSE, velocity residuals, and
generating visual comparison metrics.
"""

import os
import sys
import glob
import math
import json
import struct
import numpy as np

sys.path.append(os.path.abspath("analysis/experiments"))
from extract_telemetry import BinaryReader, parse_variable_header, parse_world_update

class CSharpShipSimulation:
    def __init__(self, base_thrust_table, base_thrust_converter, drag, step_ms=40.0):
        self.base_thrust_table = base_thrust_table
        self.btc = base_thrust_converter
        self.drag = drag
        self.step_ms = step_ms

    def simulate_trajectory(self, initial_pos, initial_vel, angles, fleet_size):
        """
        Replicates exact C# discrete step loop:
        Vector2 thrust = new Vector2(cos(angle), sin(angle)) * ThrustAmount;
        Momentum = (Momentum + thrust) * Drag;
        Position += Momentum * StepTime;
        """
        thrust_amount = self.base_thrust_table.get(fleet_size, 10.0) * self.btc
        positions = [np.array(initial_pos, dtype=np.float64)]
        # In C#, Momentum is in units/ms. initial_vel from recording is in units/tick (40ms)
        momentum = np.array(initial_vel, dtype=np.float64) / self.step_ms

        for angle in angles:
            thrust = np.array([math.cos(angle), math.sin(angle)]) * thrust_amount
            momentum = (momentum + thrust) * self.drag
            pos = positions[-1] + momentum * self.step_ms
            positions.append(pos)

        return np.array(positions)

def run_direct_comparison():
    playback_files = sorted(glob.glob("reference/space1-original/server-ansible/record/playback/*"), key=lambda x: -os.path.getsize(x))
    print(f"[*] Analyzing ground-truth recordings from {len(playback_files)} files...")

    # Extract long continuous ship tracks with turning maneuvers
    long_tracks = []
    for fpath in playback_files[:15]:
        with open(fpath, "rb") as f:
            data = f.read()
        pos = 0
        tick = 0
        fleet_history = {} # f_id -> list of pts
        while pos + 12 <= len(data):
            high, low, length = struct.unpack_from("<III", data, pos)
            payload = data[pos + 12 : pos + 12 + length]
            pos += 12 + length
            try:
                reader = BinaryReader(payload)
                if parse_variable_header(reader) == 0x10:
                    wu = parse_world_update(reader)
                    for fleet in wu.get("fleets", []):
                        f_id = fleet["id"]
                        f_size = fleet.get("fleetSizeOnServer", 1)
                        if fleet.get("isDashing", False):
                            continue
                        for cell in fleet.get("cells", []):
                            if not cell["isBullet"]:
                                if f_id not in fleet_history:
                                    fleet_history[f_id] = []
                                fleet_history[f_id].append({
                                    "tick": tick,
                                    "x": float(cell["x"]),
                                    "y": float(cell["y"]),
                                    "vx": float(cell["velX"]),
                                    "vy": float(cell["velY"]),
                                    "size": f_size
                                })
                                break
                    tick += 1
            except Exception:
                pass
        
        for f_id, pts in fleet_history.items():
            if len(pts) >= 50: # at least 2 seconds (50 ticks)
                # Check for continuous ticks
                is_continuous = all(pts[i]["tick"] == pts[i-1]["tick"] + 1 for i in range(1, len(pts)))
                if is_continuous:
                    long_tracks.append(pts)

    print(f"[+] Found {len(long_tracks)} high-quality continuous ground-truth tracks (>= 50 frames).")

    base_thrust_table = {
        1: 13.600, 2: 11.799, 3: 10.857, 4: 10.236, 5: 9.778,
        6: 9.419, 7: 9.126, 8: 8.880, 9: 8.668, 10: 8.483,
        15: 7.608, 20: 7.359
    }

    # Evaluate multiple physics parameter sets
    param_sets = [
        {"name": "Original Spaceone Analytical", "btc": 0.0038, "drag": 0.88},
        {"name": "Calibrated Responsive (0.0042 / 0.88)", "btc": 0.0042, "drag": 0.88},
        {"name": "Calibrated Responsive (0.0048 / 0.88)", "btc": 0.0048, "drag": 0.88},
        {"name": "Fast Preset (0.00586 / 0.88)", "btc": 0.00586, "drag": 0.88},
    ]

    track_sample = long_tracks[:30]
    comparison_results = []

    for pset in param_sets:
        sim = CSharpShipSimulation(base_thrust_table, pset["btc"], pset["drag"])
        mse_errors = []
        speed_diffs = []

        for track in track_sample:
            true_pos = np.array([[p["x"], p["y"]] for p in track])
            true_vels = np.array([[p["vx"], p["vy"]] for p in track])
            true_speeds = np.hypot(true_vels[:, 0], true_vels[:, 1])

            # Derive applied thrust angles from velocity heading change
            angles = [math.atan2(p["vy"], p["vx"]) for p in track[:-1]]
            f_size = track[0]["size"]

            sim_pos = sim.simulate_trajectory(
                initial_pos=[track[0]["x"], track[0]["y"]],
                initial_vel=[track[0]["vx"], track[0]["vy"]],
                angles=angles,
                fleet_size=f_size
            )

            mse = np.mean(np.sum((sim_pos - true_pos) ** 2, axis=-1))
            mse_errors.append(mse)

            # Compute steady state speed comparison
            sim_vels = np.diff(sim_pos, axis=0) # displacement per tick
            sim_speeds = np.hypot(sim_vels[:, 0], sim_vels[:, 1])
            speed_diffs.append(np.mean(np.abs(sim_speeds - true_speeds[1:])))

        avg_mse = float(np.mean(mse_errors))
        rmse = float(math.sqrt(avg_mse))
        avg_speed_diff = float(np.mean(speed_diffs))

        comparison_results.append({
            "name": pset["name"],
            "base_thrust_converter": pset["btc"],
            "drag": pset["drag"],
            "rmse_position_error_px": rmse,
            "avg_speed_residual_px_tick": avg_speed_diff
        })
        print(f"Preset [{pset['name']:<35}]: RMSE = {rmse:7.2f} px, Speed Residual = {avg_speed_diff:5.2f} px/tick")

    out_path = "analysis/datasets/recording_vs_simulation_comparison.json"
    with open(out_path, "w") as f:
        json.dump(comparison_results, f, indent=2)

    print(f"\n[+] Saved direct recording comparison results to {out_path}")
    return comparison_results

if __name__ == "__main__":
    run_direct_comparison()
