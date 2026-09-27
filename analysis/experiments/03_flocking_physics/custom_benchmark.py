import os
import sys
import math
import json
import argparse
from typing import List, Dict, Any, Tuple
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update

def wrap_angle(a: float) -> float:
    return (a + math.pi) % (2.0 * math.pi) - math.pi

def sim_origin_main(pos: np.ndarray, vel: np.ndarray, dbf: np.ndarray, N: int, speed: float) -> Tuple[np.ndarray, np.ndarray]:
    # Corresponds exactly to origin/main:
    # Steering: maxConvergenceAngle fade out when close
    # Flocking: PBD with distScale
    
    target_len = np.linalg.norm(dbf)
    fleet_center = np.mean(pos, axis=0)
    angle = math.atan2(dbf[1], dbf[0])
    
    maxConvergenceAngle = 0.06 * np.clip((target_len - 30.0) / 70.0, 0.0, 1.0)
    mousePos = fleet_center + dbf
    
    turn_rate = 0.1393
    new_pos = np.zeros_like(pos)
    new_vel = np.zeros_like(vel)
    
    for i in range(N):
        curr_ang = math.atan2(vel[i, 1], vel[i, 0]) if np.linalg.norm(vel[i]) > 0.1 else angle
        
        if target_len > 0.001:
            if maxConvergenceAngle > 0.001:
                toMouse = mousePos - pos[i]
                rawAngle = math.atan2(toMouse[1], toMouse[0])
                angleDiff = wrap_angle(rawAngle - angle)
                clampedDiff = np.clip(angleDiff, -maxConvergenceAngle, maxConvergenceAngle)
                target_ang = angle + clampedDiff
            else:
                target_ang = angle
        else:
            target_ang = curr_ang
            
        diff = wrap_angle(target_ang - curr_ang)
        new_ang = curr_ang + np.clip(diff, -turn_rate, turn_rate)
        v = speed * np.array([math.cos(new_ang), math.sin(new_ang)])
        new_vel[i] = v
        new_pos[i] = pos[i] + v

    # PBD with distScale
    distScale = 0.75 + 0.25 * min(1.0, target_len / 200.0)
    solidDiameter = 18.0 * distScale
    pushStiffness = 0.60
    
    for _ in range(2):
        displacements = np.zeros_like(pos)
        weights = np.zeros(N)
        for i in range(N):
            for j in range(i + 1, N):
                rVec = new_pos[j] - new_pos[i]
                distSq = rVec[0]*rVec[0] + rVec[1]*rVec[1]
                if 0.001 < distSq < solidDiameter * solidDiameter:
                    dist = math.sqrt(distSq)
                    overlap = solidDiameter - dist
                    smooth = 1.0 - (dist / solidDiameter)
                    push = (rVec / dist) * (overlap * 0.5 * pushStiffness * (0.5 + 0.5 * smooth))
                    displacements[i] -= push
                    displacements[j] += push
                    weights[i] += 1
                    weights[j] += 1
        for i in range(N):
            if weights[i] > 0.001:
                new_pos[i] += displacements[i] / max(1.0, math.sqrt(weights[i]))
                
    return new_pos, new_vel

def sim_proposed(pos: np.ndarray, vel: np.ndarray, dbf: np.ndarray, N: int, speed: float) -> Tuple[np.ndarray, np.ndarray]:
    # Proposed: Geometric steering (steer exactly at mouse) + PBD + constant solid diameter (no distScale)
    target_len = np.linalg.norm(dbf)
    fleet_center = np.mean(pos, axis=0)
    angle = math.atan2(dbf[1], dbf[0])
    
    mousePos = fleet_center + dbf
    
    turn_rate = 0.1393
    new_pos = np.zeros_like(pos)
    new_vel = np.zeros_like(vel)
    
    for i in range(N):
        curr_ang = math.atan2(vel[i, 1], vel[i, 0]) if np.linalg.norm(vel[i]) > 0.1 else angle
        
        if target_len > 0.001:
            toMouse = mousePos - pos[i]
            target_ang = math.atan2(toMouse[1], toMouse[0])
        else:
            target_ang = curr_ang
            
        diff = wrap_angle(target_ang - curr_ang)
        new_ang = curr_ang + np.clip(diff, -turn_rate, turn_rate)
        v = speed * np.array([math.cos(new_ang), math.sin(new_ang)])
        new_vel[i] = v
        new_pos[i] = pos[i] + v

    # PBD with LOCAL distScale
    solidDiameter = 18.0
    pushStiffness = 0.60
    
    for _ in range(2):
        displacements = np.zeros_like(pos)
        weights = np.zeros(N)
        for i in range(N):
            for j in range(i + 1, N):
                # Calculate local distance to mouse for this pair
                mid_x = (new_pos[i][0] + new_pos[j][0]) / 2.0
                mid_y = (new_pos[i][1] + new_pos[j][1]) / 2.0
                dist_to_mouse = math.hypot(mid_x - mousePos[0], mid_y - mousePos[1])
                
                local_scale = 0.75 + 0.25 * min(1.0, dist_to_mouse / 100.0)
                pairSolidDiameter = solidDiameter * local_scale
                
                rVec = new_pos[j] - new_pos[i]
                distSq = rVec[0]*rVec[0] + rVec[1]*rVec[1]
                if 0.001 < distSq < pairSolidDiameter * pairSolidDiameter:
                    dist = math.sqrt(distSq)
                    overlap = pairSolidDiameter - dist
                    smooth = 1.0 - (dist / pairSolidDiameter)
                    push = (rVec / dist) * (overlap * 0.5 * pushStiffness * (0.5 + 0.5 * smooth))
                    displacements[i] -= push
                    displacements[j] += push
                    weights[i] += 1
                    weights[j] += 1
        for i in range(N):
            if weights[i] > 0.001:
                new_pos[i] += displacements[i] / max(1.0, math.sqrt(weights[i]))
                
    return new_pos, new_vel


def evaluate_rollout(sim_func, track: Dict[str, Any], steps: int = 30) -> Dict[str, float]:
    start_frame = track["samples"][0]
    pos = np.array([ [c["x"], c["y"]] for c in start_frame["cells"] ], dtype=float)
    vel = np.array([ [c.get("velX", 0), c.get("velY", 0)] for c in start_frame["cells"] ], dtype=float)
    N = len(pos)
    
    speed = np.mean([np.linalg.norm(v) for v in vel])
    if speed < 0.1: speed = 7.36
    
    pos_err_sum = 0.0
    internal_err_sum = 0.0
    radius_err_sum = 0.0
    col_count = 0
    total_pairs = 0
    min_dist_sum = 0.0
    
    actual_steps = min(steps, len(track["samples"]))
    
    for k in range(1, actual_steps):
        target = np.array(track["samples"][k]["target_pos"])
        
        pos, vel = sim_func(pos, vel, target, N, speed)
        
        true_pos = np.array([ [c["x"], c["y"]] for c in track["samples"][k]["cells"] ])
        if len(true_pos) != N: break
        
        pos_err_sum += np.mean(np.linalg.norm(pos - true_pos, axis=1))
        
        sim_center = np.mean(pos, axis=0)
        true_center = np.mean(true_pos, axis=0)
        sim_rel = pos - sim_center
        true_rel = true_pos - true_center
        internal_err_sum += np.mean(np.linalg.norm(sim_rel - true_rel, axis=1))
        
        sim_radius = np.mean(np.linalg.norm(sim_rel, axis=1))
        true_radius = np.mean(np.linalg.norm(true_rel, axis=1))
        radius_err_sum += abs(sim_radius - true_radius)
        
        step_min_dist = 9999.0
        for i in range(N):
            for j in range(i+1, N):
                d = np.linalg.norm(pos[i] - pos[j])
                if d < step_min_dist: step_min_dist = d
                if d < 12.0: col_count += 1
                total_pairs += 1
        min_dist_sum += step_min_dist
        
    return {
        "pos_rmse": pos_err_sum / actual_steps,
        "internal_rmse": internal_err_sum / actual_steps,
        "radius_mae": radius_err_sum / actual_steps,
        "collision_rate": col_count / max(1, total_pairs),
        "mean_min_dist": min_dist_sum / actual_steps
    }

def main():
    playback_files = get_playback_files(max_files=10)
    tracks = []
    
    for fpath in playback_files:
        fleet_history = defaultdict(list)
        wu_index = 0
        for _, ts_ms, payload in iterate_session_packets(fpath):
            try:
                reader = BinaryReader(payload)
                if parse_variable_header(reader) != 0x10: continue
                wu = parse_world_update(reader)
            except: continue
            
            wu_index += 1
            for fleet in wu.get("fleets", []):
                cells = [c for c in fleet.get("cells", []) if not c.get("isBullet", False) and not c.get("isInDecay", False)]
                if len(cells) >= 4 and not fleet.get("isDashing", False):
                    fleet_history[fleet["id"]].append({
                        "wu": wu_index,
                        "cells": cells,
                        "target_pos": [fleet.get("bftx", 0), fleet.get("bfty", 0)]
                    })
                    
    for fid, frames in fleet_history.items():
        segment = []
        for i, fr in enumerate(frames):
            if i > 0 and fr["wu"] == frames[i-1]["wu"] + 1 and len(fr["cells"]) == len(frames[i-1]["cells"]):
                segment.append(fr)
            else:
                if len(segment) >= 20:
                    tracks.append({"samples": segment})
                segment = [fr]
        if len(segment) >= 20:
            tracks.append({"samples": segment})
            
    print(f"Extracted {len(tracks)} continuous tracks.")
    
    # Filter for tracks where the cursor is close (< 100px) so compaction is active
    close_tracks = [t for t in tracks if np.linalg.norm(t["samples"][0]["target_pos"]) < 100]
    print(f"Benchmarking on {len(close_tracks)} close-cursor tracks...")
    
    res_sota = [evaluate_rollout(sim_origin_main, t, 20) for t in close_tracks[:100]]
    res_prop = [evaluate_rollout(sim_proposed, t, 20) for t in close_tracks[:100]]
    
    print("\n--- SOTA (origin/main: maxConvergenceAngle + distScale) ---")
    print(f"Fleet Radius MAE:  {np.mean([r['radius_mae'] for r in res_sota]):.2f} px")
    print(f"Internal Rel RMSE: {np.mean([r['internal_rmse'] for r in res_sota]):.2f} px")
    print(f"Collision Rate:    {np.mean([r['collision_rate'] for r in res_sota])*100:.1f}%")
    print(f"Mean Min Distance: {np.mean([r['mean_min_dist'] for r in res_sota]):.1f} px")
    
    print("\n--- Proposed (Geometric Steering + PBD, no distScale) ---")
    print(f"Fleet Radius MAE:  {np.mean([r['radius_mae'] for r in res_prop]):.2f} px")
    print(f"Internal Rel RMSE: {np.mean([r['internal_rmse'] for r in res_prop]):.2f} px")
    print(f"Collision Rate:    {np.mean([r['collision_rate'] for r in res_prop])*100:.1f}%")
    print(f"Mean Min Distance: {np.mean([r['mean_min_dist'] for r in res_prop]):.1f} px")

if __name__ == "__main__":
    from collections import defaultdict
    main()
