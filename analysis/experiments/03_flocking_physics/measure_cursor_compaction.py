import os
import sys
import json
import math
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update

def analyze_cursor_density():
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
                cx = bcx + bftx
                cy = bcy + bfty
                
                dist_center_to_mouse = math.hypot(bftx, bfty)
                
                for i, c1 in enumerate(cells):
                    d_mouse = math.hypot(c1["x"] - cx, c1["y"] - cy)
                    
                    distances = []
                    for j, c2 in enumerate(cells):
                        if i != j:
                            distances.append(math.hypot(c1["x"] - c2["x"], c1["y"] - c2["y"]))
                    
                    distances.sort()
                    # Average distance to 3 nearest neighbors
                    mean_nn_dist = sum(distances[:3]) / 3.0 if len(distances) >= 3 else sum(distances)/len(distances)
                    
                    samples.append({
                        "d_mouse": d_mouse,
                        "d_center_mouse": dist_center_to_mouse,
                        "nn_dist": mean_nn_dist
                    })
                    if len(samples) > 300000: break
                if len(samples) > 300000: break
            if len(samples) > 300000: break
        if len(samples) > 300000: break

    grid = defaultdict(list)
    for s in samples:
        pm_bin = int(s["d_mouse"] / 20) * 20
        cm_bin = int(s["d_center_mouse"] / 20) * 20
        
        if pm_bin > 200: pm_bin = 200
        if cm_bin > 200: cm_bin = 200
        
        grid[(pm_bin, cm_bin)].append(s["nn_dist"])
        
    print(f"\nAnalyzed {len(samples)} ship samples.")
    print("\nMean Distance to 3 Nearest Neighbors (d_NN3) by (Ship->Mouse, Center->Mouse):")
    print("Rows: Ship distance to mouse (local)")
    print("Cols: Center distance to mouse (global)")
    
    col_bins = [0, 20, 40, 60, 80, 100, 120, 140, 160, 200]
    row_bins = [0, 20, 40, 60, 80, 100, 120, 140, 160, 200]
    
    header = "Ship\\\\Center | " + " | ".join(f"{c:3d}" for c in col_bins)
    print(header)
    print("-" * len(header))
    
    for r in row_bins:
        row_str = f"{r:11d} | "
        for c in col_bins:
            vals = grid.get((r, c), [])
            if len(vals) > 50:
                mean_n = sum(vals) / len(vals)
                row_str += f"{mean_n:4.1f} | "
            else:
                row_str += "---- | "
        print(row_str)

if __name__ == "__main__":
    analyze_cursor_density()
