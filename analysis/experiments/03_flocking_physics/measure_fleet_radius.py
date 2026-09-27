import os
import sys
import json
import math
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update

def analyze_fleet_radius():
    playback_files = get_playback_files(max_files=40)
    samples = []
    
    for f_idx, fpath in enumerate(playback_files):
        for _, ts_ms, payload in iterate_session_packets(fpath):
            try:
                reader = BinaryReader(payload)
                if parse_variable_header(reader) != 0x10: continue
                wu = parse_world_update(reader)
            except Exception:
                continue

            for fleet in wu.get("fleets", []):
                cells = [c for c in fleet.get("cells", []) if not c.get("isBullet", False) and not c.get("isInDecay", False)]
                if len(cells) < 10: 
                    continue
                
                if fleet.get("isDashing", False):
                    continue
                
                bcx = fleet.get("bcx", 0)
                bcy = fleet.get("bcy", 0)
                bftx = fleet.get("bftx", 0)
                bfty = fleet.get("bfty", 0)
                
                dist_center_to_mouse = math.hypot(bftx, bfty)
                
                # Compute fleet radius (max dist from center)
                fleet_radius = max(math.hypot(c["x"] - bcx, c["y"] - bcy) for c in cells)
                # Compute density (ships per area)
                area = math.pi * (fleet_radius ** 2)
                density = len(cells) / area if area > 0 else 0
                
                # Also compute average distance to fleet center
                mean_dist = sum(math.hypot(c["x"] - bcx, c["y"] - bcy) for c in cells) / len(cells)
                
                samples.append({
                    "dist_mouse": dist_center_to_mouse,
                    "radius": fleet_radius,
                    "mean_dist": mean_dist,
                    "N": len(cells)
                })

    # Group by Fleet Size (N) and Mouse Distance
    grid = defaultdict(list)
    for s in samples:
        cm_bin = int(s["dist_mouse"] / 20) * 20
        N_bin = s["N"]
        if cm_bin > 200: cm_bin = 200
        grid[(N_bin, cm_bin)].append(s["mean_dist"])
        
    print(f"\nAnalyzed {len(samples)} fleet frames.")
    print("\nMean Fleet Radius (avg dist to center) by (Fleet Size N, Center->Mouse):")
    
    col_bins = [0, 20, 40, 60, 80, 100, 120, 140, 160, 200]
    row_bins = sorted(list(set(s["N"] for s in samples)))
    
    header = "N\\\\Center | " + " | ".join(f"{c:3d}" for c in col_bins)
    print(header)
    print("-" * len(header))
    
    for r in row_bins:
        if r > 30: continue # truncate for display
        row_str = f"{r:10d} | "
        has_data = False
        for c in col_bins:
            vals = grid.get((r, c), [])
            if len(vals) > 10:
                mean_r = sum(vals) / len(vals)
                row_str += f"{mean_r:4.1f} | "
                has_data = True
            else:
                row_str += "---- | "
        if has_data:
            print(row_str)

if __name__ == "__main__":
    analyze_fleet_radius()
