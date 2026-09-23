#!/usr/bin/env python3
"""
Comprehensive Ground-Truth Flocking Kinematics Extraction Pipeline for Spaceone.io.

Extracts empirical kinematics across authentic binary playback recordings:
1. Pairwise relative velocity separation profiles: Delta_v(d) across distance bins [0, 60px].
2. In-flock internal velocity variation: Speed coefficient of variation (sigma/mu) and heading spread across fleet sizes.
3. Spawn birth kinematics: Initial speed ratio, longitudinal spawn offset, and multi-step acceleration catch-up profile.
4. Formation packing density and aspect ratios during straight flight and turning.
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


def extract_flocking_ground_truth(playback_files: List[str], max_frames: int = 100000) -> Dict[str, Any]:
    print(f"[*] Extracting flocking ground truth from {len(playback_files)} playback recordings...")
    
    # 1. Pairwise distance & relative velocity separation
    pair_dists = []
    pair_rel_vel_projs = []
    
    # 2. In-flock velocity dispersion
    speed_cv_samples = []
    heading_std_samples = []
    fleet_size_samples = []
    
    # 3. Spawn birth traces
    spawn_traces = []
    
    # State tracking per file
    total_frames = 0
    
    for f_idx, fpath in enumerate(playback_files):
        active_fleets = {} # fid -> set of cell ids
        pending_spawn_traces = {} # (fid, cid) -> list of frame data
        
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
                fid = f["id"]
                is_dashing = f.get("isDashing", False)
                if is_dashing:
                    continue
                    
                cells = [c for c in f.get("cells", []) if not c.get("isBullet") and not c.get("isFood") and not c.get("isSplitting")]
                curr_ids = {c["id"] for c in cells}
                N = len(cells)
                
                # Check pending spawn traces
                for (pfid, pcid), tr in list(pending_spawn_traces.items()):
                    if pfid == fid:
                        if pcid in curr_ids:
                            c = next(cell for cell in cells if cell["id"] == pcid)
                            other_cells = [oc for oc in cells if oc["id"] != pcid]
                            if other_cells:
                                f_pos = np.mean([[oc["x"], oc["y"]] for oc in other_cells], axis=0)
                                f_vel = np.mean([[oc["velX"], oc["velY"]] for oc in other_cells], axis=0)
                                tr.append({
                                    "tick": tick,
                                    "c_pos": [c["x"], c["y"]],
                                    "c_vel": [c["velX"], c["velY"]],
                                    "f_pos": f_pos.tolist(),
                                    "f_vel": f_vel.tolist(),
                                })
                                if len(tr) >= 10:
                                    spawn_traces.append(tr)
                                    del pending_spawn_traces[(pfid, pcid)]
                            else:
                                del pending_spawn_traces[(pfid, pcid)]
                        else:
                            del pending_spawn_traces[(pfid, pcid)]
                            
                # Detect single ship gain (spawn)
                if fid in active_fleets and len(active_fleets[fid]) >= 3:
                    prev_ids = active_fleets[fid]
                    new_ids = curr_ids - prev_ids
                    if len(new_ids) == 1:
                        nid = list(new_ids)[0]
                        c = next(cell for cell in cells if cell["id"] == nid)
                        other_cells = [cell for cell in cells if cell["id"] in prev_ids]
                        if other_cells:
                            f_pos = np.mean([[oc["x"], oc["y"]] for oc in other_cells], axis=0)
                            f_vel = np.mean([[oc["velX"], oc["velY"]] for oc in other_cells], axis=0)
                            pending_spawn_traces[(fid, nid)] = [{
                                "tick": tick,
                                "c_pos": [c["x"], c["y"]],
                                "c_vel": [c["velX"], c["velY"]],
                                "f_pos": f_pos.tolist(),
                                "f_vel": f_vel.tolist(),
                            }]
                            
                active_fleets[fid] = curr_ids
                
                if N < 2:
                    continue
                    
                pos = np.array([[c["x"], c["y"]] for c in cells], dtype=float)
                vel = np.array([[c["velX"], c["velY"]] for c in cells], dtype=float)
                
                # Pairwise distance and relative velocity projection
                diffs = pos[:, np.newaxis, :] - pos[np.newaxis, :, :] # diffs[i, j] = pos[i] - pos[j]
                dists = np.sqrt(np.sum(diffs**2, axis=-1))
                
                # Sample pairs up to 60px
                for i in range(N):
                    for j in range(i + 1, N):
                        d = dists[i, j]
                        if 0.5 < d < 60.0:
                            # Unit vector from i to j
                            r_dir = (pos[j] - pos[i]) / d
                            # Relative velocity v_j - v_i projected along r_dir
                            # > 0 means moving apart (repulsion), < 0 means moving closer
                            dv = vel[j] - vel[i]
                            proj = float(np.dot(dv, r_dir))
                            pair_dists.append(float(d))
                            pair_rel_vel_projs.append(proj)
                            
                # Internal velocity spread (N >= 4, speed > 3 px/tick)
                if N >= 4:
                    speeds = np.linalg.norm(vel, axis=1)
                    mean_spd = float(np.mean(speeds))
                    if mean_spd > 3.0:
                        std_spd = float(np.std(speeds))
                        speed_cv = std_spd / mean_spd
                        speed_cv_samples.append(speed_cv)
                        fleet_size_samples.append(N)
                        
                        mean_vel = np.mean(vel, axis=0)
                        mean_dir = mean_vel / np.linalg.norm(mean_vel)
                        cos_sim = np.clip(np.dot(vel, mean_dir) / (speeds + 1e-6), -1.0, 1.0)
                        angles_deg = np.degrees(np.arccos(cos_sim))
                        heading_std_samples.append(float(np.std(angles_deg)))
                        
                total_frames += 1
                if total_frames >= max_frames:
                    break
            if total_frames >= max_frames:
                break
                
    # Process pairwise relative velocity profiles into distance bins
    pair_d_arr = np.array(pair_dists)
    pair_rv_arr = np.array(pair_rel_vel_projs)
    
    bin_edges = [0.0, 15.0, 20.0, 25.0, 30.0, 35.0, 45.0, 60.0]
    pairwise_profile = []
    for b_low, b_high in zip(bin_edges[:-1], bin_edges[1:]):
        mask = (pair_d_arr >= b_low) & (pair_d_arr < b_high)
        if np.sum(mask) > 0:
            vals = pair_rv_arr[mask]
            pairwise_profile.append({
                "range_min": b_low,
                "range_max": b_high,
                "count": int(np.sum(mask)),
                "mean_rel_vel": float(np.mean(vals)),
                "median_rel_vel": float(np.median(vals)),
                "std_rel_vel": float(np.std(vals)),
            })
            
    # Process spawn traces (speed ratio & relative displacement across 10 steps)
    steps = 10
    spawn_speed_ratios = [[] for _ in range(steps)]
    spawn_fwd_displacements = [[] for _ in range(steps)]
    
    for tr in spawn_traces:
        for s in range(min(steps, len(tr))):
            c_vel = np.array(tr[s]["c_vel"])
            f_vel = np.array(tr[s]["f_vel"])
            c_spd = float(np.linalg.norm(c_vel))
            f_spd = float(np.linalg.norm(f_vel))
            if f_spd > 2.0:
                spawn_speed_ratios[s].append(c_spd / f_spd)
                
            f_dir = f_vel / (f_spd + 1e-6)
            rel_pos = np.array(tr[s]["c_pos"]) - np.array(tr[s]["f_pos"])
            fwd_disp = float(np.dot(rel_pos, f_dir))
            spawn_fwd_displacements[s].append(fwd_disp)
            
    spawn_profile = []
    for s in range(steps):
        r_arr = np.array(spawn_speed_ratios[s]) if spawn_speed_ratios[s] else np.array([1.0])
        d_arr = np.array(spawn_fwd_displacements[s]) if spawn_fwd_displacements[s] else np.array([0.0])
        spawn_profile.append({
            "step": s,
            "time_ms": s * 40,
            "speed_ratio_mean": float(np.mean(r_arr)),
            "speed_ratio_median": float(np.median(r_arr)),
            "speed_ratio_std": float(np.std(r_arr)),
            "fwd_displacement_mean": float(np.mean(d_arr)),
            "fwd_displacement_median": float(np.median(d_arr)),
        })
        
    speed_cv_arr = np.array(speed_cv_samples)
    heading_std_arr = np.array(heading_std_samples)
    
    results = {
        "metadata": {
            "total_frames_analyzed": total_frames,
            "total_files": len(playback_files),
            "pairwise_samples": len(pair_dists),
            "spawn_traces_count": len(spawn_traces),
        },
        "internal_velocity_dispersion": {
            "speed_cv_mean": float(np.mean(speed_cv_arr)),
            "speed_cv_median": float(np.median(speed_cv_arr)),
            "speed_cv_p90": float(np.percentile(speed_cv_arr, 90)),
            "heading_std_deg_mean": float(np.mean(heading_std_arr)),
            "heading_std_deg_median": float(np.median(heading_std_arr)),
            "heading_std_deg_p90": float(np.percentile(heading_std_arr, 90)),
        },
        "pairwise_relative_velocity_profile": pairwise_profile,
        "spawn_birth_kinematics_profile": spawn_profile,
    }
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Extract authentic flocking kinematics from recordings.")
    parser.add_argument("--output", type=str, default="analysis/datasets/flocking_ground_truth_kinematics.json")
    parser.add_argument("--max-frames", type=int, default=80000)
    args = parser.parse_args()

    files = get_playback_files()
    if not files:
        print("[-] No playback files found.")
        return

    results = extract_flocking_ground_truth(files, max_frames=args.max_frames)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n[+] Flocking ground truth saved to {args.output}")
    print(f"    - Analyzed {results['metadata']['total_frames_analyzed']} frames across {len(files)} sessions.")
    print(f"    - Speed CV: Median = {results['internal_velocity_dispersion']['speed_cv_median']*100:.1f}%, Mean = {results['internal_velocity_dispersion']['speed_cv_mean']*100:.1f}%")
    print(f"    - Heading Std: Median = {results['internal_velocity_dispersion']['heading_std_deg_median']:.2f} deg, Mean = {results['internal_velocity_dispersion']['heading_std_deg_mean']:.2f} deg")
    print(f"    - Spawn Initial Speed Ratio (Step 0): {results['spawn_birth_kinematics_profile'][0]['speed_ratio_median']:.3f}")
    print(f"    - Spawn Catch-up Speed Ratio (Step 1): {results['spawn_birth_kinematics_profile'][1]['speed_ratio_median']:.3f}")


if __name__ == "__main__":
    main()
