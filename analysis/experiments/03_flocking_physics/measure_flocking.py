#!/usr/bin/env python3
"""
Flocking & Swarm Formation Measurement Pipeline for Spaceone.io.

Extracts multi-ship fleet trajectories (N >= 2) from binary server playback recordings:
- Pairwise inter-ship distance distributions and hard-contact boundary ($D_{solid} \approx 25 px$).
- Fleet aspect ratio evolution (longitudinal elongation vs lateral width).
- Heading alignment and velocity dispersion across fleet members.
- Spawn burst relaxation dynamics.
"""

import os
import sys
import math
import json
import argparse
from collections import defaultdict
from typing import List, Dict, Any, Tuple
import numpy as np

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update


def wrap_angle(a: float) -> float:
    return (a + math.pi) % (2.0 * math.pi) - math.pi


def extract_flocking_metrics(playback_files: List[str], max_frames: int = 100000) -> Dict[str, Any]:
    print(f"[*] Processing {len(playback_files)} playback recordings for flocking physics extraction...")
    
    pairwise_min_dists = []
    pairwise_dist_samples = []
    elongation_samples = []
    heading_deviations_deg = []
    speed_samples = []
    straight_tracks = []
    
    fleet_histories = defaultdict(lambda: defaultdict(list)) # file_idx -> fleet_id -> frames
    
    total_fleet_frames = 0
    
    for f_idx, fpath in enumerate(playback_files):
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
                    continue

                cells = [c for c in f.get("cells", []) if not c.get("isBullet") and not c.get("isInDecay")]
                N = len(cells)
                if N < 2:
                    continue

                positions = np.array([[c["x"], c["y"]] for c in cells], dtype=np.float64)
                velocities = np.array([[c["velX"], c["velY"]] for c in cells], dtype=np.float64)
                
                # Compute pairwise distances
                diffs = positions[:, np.newaxis, :] - positions[np.newaxis, :, :]
                dists = np.sqrt(np.sum(diffs**2, axis=-1))
                np.fill_diagonal(dists, np.inf)
                min_d = float(np.min(dists))
                pairwise_min_dists.append(min_d)
                
                triu_idx = np.triu_indices(N, k=1)
                for pd in dists[triu_idx][:10]:
                    pairwise_dist_samples.append(float(pd))
                    
                # Aspect ratio & elongation
                centroid = np.mean(positions, axis=0)
                centered = positions - centroid
                mean_vel = np.mean(velocities, axis=0)
                speed = float(np.linalg.norm(mean_vel))
                
                if speed > 2.0 and N >= 4:
                    vel_dir = mean_vel / speed
                    perp_dir = np.array([-vel_dir[1], vel_dir[0]])
                    
                    proj_par = np.dot(centered, vel_dir)
                    proj_perp = np.dot(centered, perp_dir)
                    
                    std_par = float(np.std(proj_par))
                    std_perp = float(np.std(proj_perp))
                    if std_perp > 1e-2:
                        elongation_samples.append({
                            "N": N,
                            "speed": speed,
                            "ratio": std_par / std_perp,
                            "std_par": std_par,
                            "std_perp": std_perp,
                        })
                        
                # Heading deviation from fleet mean
                for v in velocities:
                    v_spd = float(np.linalg.norm(v))
                    speed_samples.append(v_spd)
                    if v_spd > 1e-2 and speed > 1e-2:
                        cos_sim = np.clip(np.dot(v, mean_vel) / (v_spd * speed), -1.0, 1.0)
                        ang_diff = math.degrees(math.acos(cos_sim))
                        heading_deviations_deg.append(ang_diff)

                current_fleets[f_id].append({
                    "tick": tick,
                    "N": N,
                    "bc": [float(f.get("bcx", 0)), float(f.get("bcy", 0))],
                    "dbf": [float(f.get("dbfx", 1.0)), float(f.get("dbfy", 0.0))],
                    "positions": positions.tolist(),
                    "velocities": velocities.tolist(),
                })
                
                total_fleet_frames += 1
                if total_fleet_frames >= max_frames:
                    break
            if total_fleet_frames >= max_frames:
                break
                
        # Extract straight segments for elongation tracking
        for f_id, tr in current_fleets.items():
            if len(tr) >= 30:
                headings = [math.atan2(fr["dbf"][1], fr["dbf"][0]) for fr in tr]
                diffs = [abs(wrap_angle(headings[i+1] - headings[i])) for i in range(len(headings)-1)]
                if np.max(diffs) < 0.08:
                    straight_tracks.append({
                        "file_idx": f_idx,
                        "fleet_id": f_id,
                        "N": tr[0]["N"],
                        "duration": len(tr),
                        "frames": tr,
                    })

    min_d_arr = np.array(pairwise_min_dists)
    elong_arr = np.array([e["ratio"] for e in elongation_samples])
    hd_arr = np.array(heading_deviations_deg)
    
    results = {
        "metadata": {
            "total_frames_analyzed": total_fleet_frames,
            "total_files": len(playback_files),
            "straight_tracks_count": len(straight_tracks),
        },
        "inter_ship_distance": {
            "min_distance_percentiles": {
                "p5": float(np.percentile(min_d_arr, 5)),
                "p10": float(np.percentile(min_d_arr, 10)),
                "p25": float(np.percentile(min_d_arr, 25)),
                "median": float(np.median(min_d_arr)),
                "p75": float(np.percentile(min_d_arr, 75)),
                "p90": float(np.percentile(min_d_arr, 90)),
                "mean": float(np.mean(min_d_arr)),
            },
            "fraction_below_20px": float(np.mean(min_d_arr < 20.0)),
            "fraction_below_25px": float(np.mean(min_d_arr < 25.0)),
            "fraction_below_30px": float(np.mean(min_d_arr < 30.0)),
            "fraction_below_40px": float(np.mean(min_d_arr < 40.0)),
            "optimal_solid_diameter": float(np.median(min_d_arr)),
        },
        "fleet_elongation": {
            "median_aspect_ratio": float(np.median(elong_arr)),
            "mean_aspect_ratio": float(np.mean(elong_arr)),
            "p25_aspect_ratio": float(np.percentile(elong_arr, 25)),
            "p75_aspect_ratio": float(np.percentile(elong_arr, 75)),
        },
        "heading_alignment": {
            "median_deviation_deg": float(np.median(hd_arr)),
            "mean_deviation_deg": float(np.mean(hd_arr)),
            "p95_deviation_deg": float(np.percentile(hd_arr, 95)),
        },
        "straight_tracks": straight_tracks[:20],
    }
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Extract flocking metrics from authentic recordings.")
    parser.add_argument("--output", type=str, default="analysis/datasets/flocking_experiment_results.json")
    parser.add_argument("--max-frames", type=int, default=80000)
    args = parser.parse_args()

    files = get_playback_files()
    if not files:
        print("[-] No playback files found.")
        return

    results = extract_flocking_metrics(files, max_frames=args.max_frames)
    
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"\n[+] Flocking metrics saved to {args.output}")
    print(f"    - Analyzed {results['metadata']['total_frames_analyzed']} frames across {len(files)} files.")
    print(f"    - Inter-ship Contact Boundary: Median MinDist = {results['inter_ship_distance']['min_distance_percentiles']['median']:.2f} px")
    print(f"    - Fleet Elongation Aspect Ratio: Median = {results['fleet_elongation']['median_aspect_ratio']:.2f}x")
    print(f"    - Heading Deviation from Leader: Median = {results['heading_alignment']['median_deviation_deg']:.2f} deg")


if __name__ == "__main__":
    main()
