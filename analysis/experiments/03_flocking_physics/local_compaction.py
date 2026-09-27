import os
import sys
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update
from collections import defaultdict
import math

def main():
    playback_files = get_playback_files(max_files=10)
    
    near_mouse_dists = []
    far_mouse_dists = []
    
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
                    if target_len < 100: # cursor is inside or very close to fleet
                        cx = bcx + bftx
                        cy = bcy + bfty
                        
                        for i in range(len(cells)):
                            for j in range(i+1, len(cells)):
                                d = math.hypot(cells[i]["x"] - cells[j]["x"], cells[i]["y"] - cells[j]["y"])
                                if d > 60: continue # only care about neighbors
                                
                                mid_x = (cells[i]["x"] + cells[j]["x"]) / 2.0
                                mid_y = (cells[i]["y"] + cells[j]["y"]) / 2.0
                                
                                dist_to_mouse = math.hypot(mid_x - cx, mid_y - cy)
                                
                                if dist_to_mouse < 30:
                                    near_mouse_dists.append(d)
                                elif dist_to_mouse > 80:
                                    far_mouse_dists.append(d)
                                    
    print(f"Mean neighbor distance NEAR mouse (<30px): {np.mean(near_mouse_dists):.2f} px")
    print(f"Mean neighbor distance FAR from mouse (>80px): {np.mean(far_mouse_dists):.2f} px")

if __name__ == "__main__":
    main()
