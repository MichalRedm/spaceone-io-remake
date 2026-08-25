#!/usr/bin/env python3
"""
Flocking Model Benchmark & Multi-Horizon Rollout Evaluator for Spaceone.io.

Evaluates 3 distinct swarm modeling paradigms across 30-tick open-loop rollouts:
1. Baseline Kinematic (Zero inter-ship forces / pure heading followers)
2. Angle-Space Boids (Steering vector angle fusion - current remake)
3. Kinematic Solid-Disc PBD (Ray convergence + pairwise position relaxation - proposed)

Quantifies Position RMSE, Internal Relative RMSE, Collision Violation Rate, and Packing Density.
"""

import os
import sys
import math
import json
import argparse
from typing import List, Dict, Any, Tuple
import numpy as np

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update


def wrap_angle(a: float) -> float:
    return (a + math.pi) % (2.0 * math.pi) - math.pi


speed_table = {1: 13.6, 2: 13.04, 3: 12.04, 4: 11.5, 5: 11.31, 6: 11.0, 7: 10.7, 8: 10.5, 9: 10.2, 10: 10.0, 15: 9.5, 20: 9.22}
def get_cruise_speed(N: int) -> float:
    if N in speed_table:
        return speed_table[N]
    return 13.6 * (N ** -0.12)


def sim_baseline_kinematic(pos: np.ndarray, vel: np.ndarray, dbf: np.ndarray, N: int, speed: float) -> Tuple[np.ndarray, np.ndarray]:
    turn_rate = 0.1393
    target_angle = math.atan2(dbf[1], dbf[0])
    new_pos = np.zeros_like(pos)
    new_vel = np.zeros_like(vel)
    for i in range(N):
        curr_ang = math.atan2(vel[i, 1], vel[i, 0]) if np.linalg.norm(vel[i]) > 0.1 else target_angle
        diff = wrap_angle(target_angle - curr_ang)
        new_ang = curr_ang + np.clip(diff, -turn_rate, turn_rate)
        v = speed * np.array([math.cos(new_ang), math.sin(new_ang)])
        new_vel[i] = v
        new_pos[i] = pos[i] + v
    return new_pos, new_vel


def sim_angle_boids(pos: np.ndarray, vel: np.ndarray, dbf: np.ndarray, N: int, speed: float,
                    w_sep: float = 150.0, d_sep: float = 60.0, w_coh: float = 0.0003, d_coh: float = 300.0) -> Tuple[np.ndarray, np.ndarray]:
    turn_rate = 0.1393
    target_angle = math.atan2(dbf[1], dbf[0])
    base_heading = np.array([math.cos(target_angle), math.sin(target_angle)])
    center = np.mean(pos, axis=0)
    new_pos = np.zeros_like(pos)
    new_vel = np.zeros_like(vel)
    
    for i in range(N):
        sep_vec = np.zeros(2)
        diffs = pos[i] - pos
        dists = np.linalg.norm(diffs, axis=1)
        for j in range(N):
            if i != j and dists[j] < d_sep and dists[j] > 0.01:
                sep_vec += (diffs[j] / dists[j]) * (1.0 / (dists[j]*dists[j]) - 1.0 / (d_sep*d_sep))
                
        coh_vec = np.zeros(2)
        dist_to_center = np.linalg.norm(center - pos[i])
        if dist_to_center < d_coh and dist_to_center > 0.01:
            coh_vec = (center - pos[i]) / dist_to_center * dist_to_center
            
        steering = base_heading + w_sep * sep_vec + w_coh * coh_vec
        desired_angle = math.atan2(steering[1], steering[0])
        
        curr_ang = math.atan2(vel[i, 1], vel[i, 0]) if np.linalg.norm(vel[i]) > 0.1 else target_angle
        diff = wrap_angle(desired_angle - curr_ang)
        new_ang = curr_ang + np.clip(diff, -turn_rate, turn_rate)
        
        v = speed * np.array([math.cos(new_ang), math.sin(new_ang)])
        new_vel[i] = v
        new_pos[i] = pos[i] + v
    return new_pos, new_vel


def sim_solid_disc_pbd(pos: np.ndarray, vel: np.ndarray, dbf: np.ndarray, N: int, speed: float,
                       d_solid: float = 25.0, stiffness: float = 0.60,
                       coh_dist: float = 80.0, coh_weight: float = 0.0056) -> Tuple[np.ndarray, np.ndarray]:
    turn_rate = 0.1393
    target_angle = math.atan2(dbf[1], dbf[0])
    new_pos = np.zeros_like(pos)
    new_vel = np.zeros_like(vel)
    
    # 1. Kinematic forward step with heading steering
    for i in range(N):
        curr_ang = math.atan2(vel[i, 1], vel[i, 0]) if np.linalg.norm(vel[i]) > 0.1 else target_angle
        diff = wrap_angle(target_angle - curr_ang)
        new_ang = curr_ang + np.clip(diff, -turn_rate, turn_rate)
        v = speed * np.array([math.cos(new_ang), math.sin(new_ang)])
        new_vel[i] = v
        new_pos[i] = pos[i] + v
        
    # 2. Pairwise solid-disc non-penetration relaxation
    for _ in range(2): # 2 relaxation sub-steps
        for i in range(N):
            for j in range(i + 1, N):
                r_vec = new_pos[j] - new_pos[i]
                d = np.linalg.norm(r_vec)
                if d < d_solid and d > 0.01:
                    overlap = d_solid - d
                    push = (r_vec / d) * (overlap * 0.5 * stiffness)
                    new_pos[i] -= push
                    new_pos[j] += push
                    
    # 3. Soft straggler cohesion bounding
    if coh_weight > 1e-6 and N >= 3:
        center = np.mean(new_pos, axis=0)
        for i in range(N):
            to_center = center - new_pos[i]
            d_center = np.linalg.norm(to_center)
            if d_center > coh_dist:
                new_pos[i] += (to_center / d_center) * ((d_center - coh_dist) * coh_weight)
                
    return new_pos, new_vel


def evaluate_rollout(sim_fn, track: Dict[str, Any], steps: int = 25) -> Dict[str, float]:
    N = track["fleet_size"]
    p_sim = np.copy(track["positions"][0])
    v_sim = np.copy(track["velocities"][0])
    
    true_positions = np.array(track["positions"][:steps+1])
    sim_positions = [np.copy(p_sim)]
    min_dists = []
    
    speed = get_cruise_speed(N)
    
    for t in range(steps):
        dbf = np.array(track["dbf"][t])
        p_sim, v_sim = sim_fn(p_sim, v_sim, dbf, N, speed)
        sim_positions.append(np.copy(p_sim))
        
        diffs = p_sim[:, np.newaxis, :] - p_sim[np.newaxis, :, :]
        dists = np.sqrt(np.sum(diffs**2, axis=-1))
        np.fill_diagonal(dists, np.inf)
        min_dists.append(float(np.min(dists)))
        
    sim_positions = np.array(sim_positions)
    pos_rmse = float(np.sqrt(np.mean((sim_positions - true_positions)**2)))
    
    sim_centroids = np.mean(sim_positions, axis=1)
    true_centroids = np.mean(true_positions, axis=1)
    centroid_rmse = float(np.sqrt(np.mean((sim_centroids - true_centroids)**2)))
    
    sim_rel = sim_positions - sim_centroids[:, np.newaxis, :]
    true_rel = true_positions - true_centroids[:, np.newaxis, :]
    internal_rmse = float(np.sqrt(np.mean((sim_rel - true_rel)**2)))
    
    collision_rate = float(np.mean(np.array(min_dists) < 20.0))
    mean_min_dist = float(np.mean(min_dists))
    
    return {
        "pos_rmse": pos_rmse,
        "centroid_rmse": centroid_rmse,
        "internal_rmse": internal_rmse,
        "collision_rate": collision_rate,
        "mean_min_dist": mean_min_dist,
    }


def extract_tracks_from_playbacks(playback_files: List[str], min_length: int = 30) -> List[Dict[str, Any]]:
    from collections import defaultdict
    tracks = []
    for fpath in playback_files[:8]:
        current_fleets = defaultdict(list)
        for tick, ts, payload in iterate_session_packets(fpath):
            try:
                reader = BinaryReader(payload)
                msg_type = parse_variable_header(reader)
                if msg_type != 0x10:
                    continue
                wu = parse_world_update(reader)
            except Exception:
                continue

            for f in wu.get("fleets", []):
                f_id = f["id"]
                if f.get("isDashing", False):
                    if len(current_fleets[f_id]) >= min_length:
                        tracks.append(current_fleets[f_id])
                    current_fleets[f_id] = []
                    continue

                cells = [c for c in f.get("cells", []) if not c.get("isBullet") and not c.get("isInDecay")]
                N = len(cells)
                if N < 3:
                    if len(current_fleets[f_id]) >= min_length:
                        tracks.append(current_fleets[f_id])
                    current_fleets[f_id] = []
                    continue

                if current_fleets[f_id] and current_fleets[f_id][-1]["N"] != N:
                    if len(current_fleets[f_id]) >= min_length:
                        tracks.append(current_fleets[f_id])
                    current_fleets[f_id] = []

                current_fleets[f_id].append({
                    "tick": tick,
                    "N": N,
                    "dbf": [float(f.get("dbfx", 1.0)), float(f.get("dbfy", 0.0))],
                    "positions": [[float(c["x"]), float(c["y"])] for c in cells],
                    "velocities": [[float(c["velX"]), float(c["velY"])] for c in cells],
                })

        for f_id, tr in current_fleets.items():
            if len(tr) >= min_length:
                tracks.append(tr)

    formatted = []
    for tr in tracks:
        formatted.append({
            "fleet_size": tr[0]["N"],
            "length": len(tr),
            "dbf": [fr["dbf"] for fr in tr],
            "positions": [fr["positions"] for fr in tr],
            "velocities": [fr["velocities"] for fr in tr],
        })
    return formatted


def main():
    parser = argparse.ArgumentParser(description="Run flocking model comparative benchmark.")
    parser.add_argument("--output", type=str, default="analysis/datasets/flocking_model_benchmark_results.json")
    parser.add_argument("--num-tracks", type=int, default=100)
    args = parser.parse_args()

    files = get_playback_files()
    if not files:
        print("[-] No playback files found.")
        return

    print(f"[*] Extracting continuous multi-ship tracks for benchmarking...")
    tracks = extract_tracks_from_playbacks(files)
    print(f"[+] Loaded {len(tracks)} continuous multi-ship tracks.")

    # Filter for tracks with angular steering dynamics
    turning_tracks = []
    for tr in tracks:
        headings = [math.atan2(d[1], d[0]) for d in tr["dbf"]]
        diffs = [abs(wrap_angle(headings[i+1] - headings[i])) for i in range(len(headings)-1)]
        if sum(diffs) > 0.4:
            turning_tracks.append(tr)

    eval_tracks = turning_tracks[:args.num_tracks]
    print(f"[*] Benchmarking on {len(eval_tracks)} turning tracks over 25-step rollouts...")

    res_baseline = [evaluate_rollout(sim_baseline_kinematic, tr, steps=25) for tr in eval_tracks]
    res_boids = [evaluate_rollout(sim_angle_boids, tr, steps=25) for tr in eval_tracks]
    res_solid_pbd = [evaluate_rollout(sim_solid_disc_pbd, tr, steps=25) for tr in eval_tracks]

    benchmark_summary = {
        "num_evaluated_tracks": len(eval_tracks),
        "rollout_steps": 25,
        "models": {
            "BaselineKinematic": {
                "description": "Zero inter-ship flocking forces (pure kinematic followers)",
                "mean_pos_rmse": float(np.mean([r["pos_rmse"] for r in res_baseline])),
                "mean_centroid_rmse": float(np.mean([r["centroid_rmse"] for r in res_baseline])),
                "mean_internal_rmse": float(np.mean([r["internal_rmse"] for r in res_baseline])),
                "mean_collision_rate": float(np.mean([r["collision_rate"] for r in res_baseline])),
                "mean_min_dist": float(np.mean([r["mean_min_dist"] for r in res_baseline])),
            },
            "AngleSpaceBoids": {
                "description": "Angle-space steering vector fusion (previous remake model)",
                "mean_pos_rmse": float(np.mean([r["pos_rmse"] for r in res_boids])),
                "mean_centroid_rmse": float(np.mean([r["centroid_rmse"] for r in res_boids])),
                "mean_internal_rmse": float(np.mean([r["internal_rmse"] for r in res_boids])),
                "mean_collision_rate": float(np.mean([r["collision_rate"] for r in res_boids])),
                "mean_min_dist": float(np.mean([r["mean_min_dist"] for r in res_boids])),
            },
            "KinematicSolidDiscPBD": {
                "description": "Kinematic heading + Solid-Disc PBD non-penetration relaxation (proposed)",
                "mean_pos_rmse": float(np.mean([r["pos_rmse"] for r in res_solid_pbd])),
                "mean_centroid_rmse": float(np.mean([r["centroid_rmse"] for r in res_solid_pbd])),
                "mean_internal_rmse": float(np.mean([r["internal_rmse"] for r in res_solid_pbd])),
                "mean_collision_rate": float(np.mean([r["collision_rate"] for r in res_solid_pbd])),
                "mean_min_dist": float(np.mean([r["mean_min_dist"] for r in res_solid_pbd])),
            },
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(benchmark_summary, f, indent=2)

    print("\n==========================================================================")
    print("                    FLOCKING MODEL BENCHMARK RESULTS                      ")
    print("==========================================================================")
    for name, stats in benchmark_summary["models"].items():
        print(f"\n--- {name} ---")
        print(f"  Description:       {stats['description']}")
        print(f"  Position RMSE:     {stats['mean_pos_rmse']:.2f} px")
        print(f"  Internal Rel RMSE: {stats['mean_internal_rmse']:.2f} px")
        print(f"  Collision Rate:    {stats['mean_collision_rate']*100:.1f}%")
        print(f"  Mean Min Distance: {stats['mean_min_dist']:.1f} px")

    print(f"\n[+] Full benchmark results saved to {args.output}")


if __name__ == "__main__":
    main()
