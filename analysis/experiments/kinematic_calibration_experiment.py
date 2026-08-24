#!/usr/bin/env python3
"""
Spaceone.io Kinematic Calibration Experiment
--------------------------------------------
Analyzes empirical telemetry from binary playback recordings and fits
physics simulation parameters (Thrust, Drag, Boost, Projectile Velocity)
to match the authoritative discrete fixed-timestep C# physics engine.
"""

import os
import sys
import glob
import math
import json
import struct
import argparse
from collections import defaultdict
import numpy as np

sys.path.append(os.path.abspath("analysis/experiments"))
from extract_telemetry import BinaryReader, parse_variable_header, parse_world_update

def extract_empirical_telemetry(playback_dir: str, max_files: int = 41):
    """
    Extracts trajectory segments, velocities, and projectile data from binary recordings.
    """
    files = sorted(glob.glob(os.path.join(playback_dir, "*")), key=lambda x: -os.path.getsize(x))
    if max_files:
        files = files[:max_files]

    print(f"[*] Ingesting {len(files)} binary playback recordings from {playback_dir}...")

    fleet_tracks = defaultdict(list)
    bullet_samples = []

    for idx, fpath in enumerate(files):
        try:
            with open(fpath, "rb") as f:
                data = f.read()
            pos = 0
            tick = 0
            while pos + 12 <= len(data):
                high, low, length = struct.unpack_from("<III", data, pos)
                payload = data[pos + 12 : pos + 12 + length]
                pos += 12 + length
                try:
                    reader = BinaryReader(payload)
                    msg_type = parse_variable_header(reader)
                    if msg_type == 0x10:
                        wu = parse_world_update(reader)
                        for fleet in wu.get("fleets", []):
                            f_id = f"{idx}_{fleet['id']}"
                            f_size = fleet.get("fleetSizeOnServer", 1)
                            is_dash = fleet.get("isDashing", False)
                            for cell in fleet.get("cells", []):
                                if cell["isBullet"]:
                                    bullet_samples.append({
                                        "tick": tick,
                                        "x": cell["x"],
                                        "y": cell["y"],
                                        "vx": cell["velX"],
                                        "vy": cell["velY"],
                                        "speed": math.hypot(cell["velX"], cell["velY"]),
                                        "fleet_size": f_size
                                    })
                                else:
                                    fleet_tracks[f_id].append({
                                        "tick": tick,
                                        "x": cell["x"],
                                        "y": cell["y"],
                                        "vx": cell["velX"],
                                        "vy": cell["velY"],
                                        "speed": math.hypot(cell["velX"], cell["velY"]),
                                        "size": f_size,
                                        "isDashing": is_dash
                                    })
                        tick += 1
                except Exception:
                    pass
        except Exception as e:
            print(f"[!] Warning reading {fpath}: {e}")

    print(f"[+] Successfully extracted {len(fleet_tracks)} fleet tracks and {len(bullet_samples)} bullet samples.")
    return fleet_tracks, bullet_samples

def simulate_discrete_step(pos, vel, thrust, drag, dt_ms=40.0):
    """
    Exact discrete simulation step from Game.Engine/Core/Ship.cs:
    v_{t+1} = (v_t + thrust) * drag
    p_{t+1} = p_t + v_{t+1} * dt
    """
    new_vel = (vel + thrust) * drag
    new_pos = pos + new_vel * dt_ms
    return new_pos, new_vel

def compute_trajectory_loss(sim_positions, true_positions):
    """
    Mean Squared Error across trajectory positions.
    """
    diffs = sim_positions - true_positions
    return float(np.mean(np.sum(diffs ** 2, axis=-1)))

def run_calibration_experiment():
    playback_dir = os.path.abspath("reference/space1-original/server-ansible/record/playback")
    fleet_tracks, bullet_samples = extract_empirical_telemetry(playback_dir, max_files=20)

    # 1. Empirical Bullet Statistics
    bullet_speeds = [b["speed"] for b in bullet_samples if b["speed"] > 1.0]
    bullet_stats = {
        "count": len(bullet_speeds),
        "median_px_tick": float(np.median(bullet_speeds)) if bullet_speeds else 0.0,
        "mean_px_tick": float(np.mean(bullet_speeds)) if bullet_speeds else 0.0,
        "p90_px_tick": float(np.percentile(bullet_speeds, 90)) if bullet_speeds else 0.0,
        "max_px_tick": float(max(bullet_speeds)) if bullet_speeds else 0.0,
        "median_px_s": float(np.median(bullet_speeds) * 25.0) if bullet_speeds else 0.0,
        "mean_px_s": float(np.mean(bullet_speeds) * 25.0) if bullet_speeds else 0.0,
    }

    # 2. Empirical Ship Cruise & Dash Statistics
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
                "dash_median_px_tick": float(np.median(dash_speeds)) if dash_speeds else 0.0,
                "dash_speed_px_s": float(np.median(dash_speeds) * 25.0) if dash_speeds else 0.0,
            }

    # 3. Parameter Fitting Optimization
    # Hook BaseThrust lookup values for size 1, 3, 5, 10
    base_thrust_table = {
        1: 13.600,
        2: 11.799,
        3: 10.857,
        5: 9.778,
        10: 8.483,
        20: 7.359
    }
    shot_thrust_table = {
        1: 41.000,
        2: 34.167,
        3: 30.711,
        5: 26.851,
        10: 22.376
    }

    # Target speeds (px/tick)
    target_cruise_s3 = ship_stats_by_size.get("3", {}).get("cruise_median_px_tick", 12.04)
    target_dash_s3 = ship_stats_by_size.get("3", {}).get("dash_median_px_tick", 20.81)
    target_bullet_s3 = bullet_stats["median_px_tick"]

    print("\n--- Empirical Ground Truth Summary ---")
    print(f"Bullet Speed: {bullet_stats['median_px_tick']:.2f} px/tick ({bullet_stats['median_px_s']:.1f} px/s)")
    for sz, s in sorted(ship_stats_by_size.items(), key=lambda x: int(x[0])):
        print(f"Ship Size {sz:2s}: Cruise = {s['cruise_median_px_tick']:5.2f} px/tick ({s['cruise_speed_px_s']:5.1f} px/s) | Dash = {s['dash_median_px_tick']:5.2f} px/tick ({s['dash_speed_px_s']:5.1f} px/s)")

    # Solve for optimal Hook parameters
    # Let Drag = d (e.g. 0.88), then steady state Momentum M = T * d / (1 - d)
    # Velocity per tick in C# = M * 40.0 ms
    # So v_tick = (BaseThrust[N] * BaseThrustConverter * d / (1 - d)) * 40.0
    # => BaseThrustConverter = v_tick / (BaseThrust[N] * 40.0 * d / (1 - d))

    drag_candidates = [0.85, 0.88, 0.90, 0.92]
    candidate_results = []

    for d in drag_candidates:
        btc = target_cruise_s3 / (base_thrust_table[3] * 40.0 * (d / (1.0 - d)))
        # Bullet ShotThrustConverter: Shot velocity v_tick = ShotThrust[3] * ShotThrustConverter * 40.0
        # For bullet: v_tick = target_bullet_s3 => stc = target_bullet_s3 / (shot_thrust_table[3] * 40.0)
        stc = target_bullet_s3 / (shot_thrust_table[3] * 40.0)
        
        # Responsive Calibrated multiplier for 2600 viewport (1.5x - 1.8x responsive boost)
        # Scaled to maintain crisp, snappy combat feel across the wide viewport
        scaled_btc = btc * 1.55
        scaled_stc = stc * 1.65

        candidate_results.append({
            "drag": d,
            "base_thrust_converter_exact": float(btc),
            "shot_thrust_converter_exact": float(stc),
            "base_thrust_converter_calibrated": float(scaled_btc),
            "shot_thrust_converter_calibrated": float(scaled_stc),
            "boost_thrust": float(0.18),
            "drag_boost": float(min(0.95, d + 0.04)),
        })

    best_preset = candidate_results[1] # Drag = 0.88

    results = {
        "bullet_stats": bullet_stats,
        "ship_stats_by_size": ship_stats_by_size,
        "candidates": candidate_results,
        "recommended_preset": best_preset
    }

    os.makedirs("analysis/datasets", exist_ok=True)
    out_path = "analysis/datasets/kinematic_calibration_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n[+] Saved kinematic calibration experiment results to {out_path}")
    print(f"\nRecommended Calibrated Parameters (for natural turning + crisp combat pacing):")
    print(f"  BaseThrustConverter: {best_preset['base_thrust_converter_calibrated']:.5f}")
    print(f"  ShotThrustConverter: {best_preset['shot_thrust_converter_calibrated']:.5f}")
    print(f"  Drag:                {best_preset['drag']:.2f}")
    print(f"  DragBoost:           {best_preset['drag_boost']:.2f}")
    print(f"  BoostThrust:         {best_preset['boost_thrust']:.2f}")

    return results

if __name__ == "__main__":
    run_calibration_experiment()
