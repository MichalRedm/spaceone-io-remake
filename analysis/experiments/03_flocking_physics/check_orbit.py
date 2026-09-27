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
    playback_files = get_playback_files(max_files=5)
    
    for fpath in playback_files:
        for _, ts_ms, payload in iterate_session_packets(fpath):
            try:
                reader = BinaryReader(payload)
                if parse_variable_header(reader) != 0x10: continue
                wu = parse_world_update(reader)
            except: continue
            
            for fleet in wu.get("fleets", []):
                cells = [c for c in fleet.get("cells", []) if not c.get("isBullet", False)]
                if len(cells) < 10: continue
                
                bftx = fleet.get("bftx", 0)
                bfty = fleet.get("bfty", 0)
                target_len = math.hypot(bftx, bfty)
                
                if target_len < 30: # Mouse is inside the fleet
                    # Let's compute the standard deviation of ship headings
                    # If they are orbiting (tornado), headings will be all over the place.
                    # If they are flying parallel, heading stddev will be near 0.
                    angles = []
                    for c in cells:
                        if c.get("velX", 0) != 0 or c.get("velY", 0) != 0:
                            angles.append(math.atan2(c.get("velY", 0), c.get("velX", 0)))
                    
                    if not angles: continue
                    
                    # Compute mean angle via circular mean
                    sin_sum = sum(math.sin(a) for a in angles)
                    cos_sum = sum(math.cos(a) for a in angles)
                    mean_ang = math.atan2(sin_sum, cos_sum)
                    
                    diffs = [abs((a - mean_ang + math.pi) % (2*math.pi) - math.pi) for a in angles]
                    stddev = np.std(diffs)
                    
                    print(f"TargetLen: {target_len:.1f}, FleetSize: {len(cells)}, Heading StdDev: {stddev:.3f} rad ({(stddev*180/math.pi):.1f} deg)")
                    
if __name__ == "__main__":
    main()
