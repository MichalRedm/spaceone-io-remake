import os
import sys
import math
import numpy as np
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update

def main():
    playback_files = get_playback_files(max_files=15)
    
    # Bucket by distance to mouse in 20px increments
    buckets = defaultdict(list)
    
    for fpath in playback_files:
        for _, ts_ms, payload in iterate_session_packets(fpath):
            try:
                reader = BinaryReader(payload)
                if parse_variable_header(reader) != 0x10: continue
                wu = parse_world_update(reader)
            except: continue
            
            for fleet in wu.get("fleets", []):
                cells = [c for c in fleet.get("cells", []) if not c.get("isBullet", False) and not c.get("isInDecay", False)]
                if len(cells) >= 10 and not fleet.get("isDashing", False):
                    bcx = fleet.get("bcx", 0)
                    bcy = fleet.get("bcy", 0)
                    bftx = fleet.get("bftx", 0)
                    bfty = fleet.get("bfty", 0)
                    
                    target_len = math.hypot(bftx, bfty)
                    
                    cx = bcx + bftx
                    cy = bcy + bfty
                    
                    for i in range(len(cells)):
                        for j in range(i+1, len(cells)):
                            dx = cells[i]["x"] - cells[j]["x"]
                            dy = cells[i]["y"] - cells[j]["y"]
                            d = math.hypot(dx, dy)
                            
                            # Only care about nearest neighbors (distance < 50px)
                            if d > 50: continue 
                            
                            mid_x = (cells[i]["x"] + cells[j]["x"]) / 2.0
                            mid_y = (cells[i]["y"] + cells[j]["y"]) / 2.0
                            
                            dist_to_mouse = math.hypot(mid_x - cx, mid_y - cy)
                            
                            bucket_idx = int(dist_to_mouse / 15.0) * 15
                            if bucket_idx <= 240:
                                buckets[bucket_idx].append(d)
                                    
    print("Dist to Mouse (px) | Mean Neighbor Dist (px) | Samples")
    print("-" * 65)
    baseline_dist = None
    for b in sorted(buckets.keys()):
        vals = buckets[b]
        mean_d = np.mean(vals)
        if b >= 150 and baseline_dist is None:
            baseline_dist = mean_d
        print(f"{b:18d} | {mean_d:23.2f} | {len(vals)}")
        
    if baseline_dist:
        print("\nDerived Compaction Curve:")
        for b in sorted(buckets.keys()):
            mean_d = np.mean(buckets[b])
            scale = mean_d / baseline_dist
            print(f"Dist {b:3d}px -> scale {scale:.3f}")

if __name__ == "__main__":
    main()
