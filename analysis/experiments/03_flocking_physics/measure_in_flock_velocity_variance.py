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
    playback_files = get_playback_files(max_files=20)
    
    stddevs = []
    
    for fpath in playback_files:
        for _, ts_ms, payload in iterate_session_packets(fpath):
            try:
                reader = BinaryReader(payload)
                if parse_variable_header(reader) != 0x10: continue
                wu = parse_world_update(reader)
            except: continue
            
            for fleet in wu.get("fleets", []):
                cells = [c for c in fleet.get("cells", []) if not c.get("isBullet", False) and not c.get("isInDecay", False)]
                # Look at fleets that are cruising normally (mouse > 150px away)
                if len(cells) >= 10 and not fleet.get("isDashing", False):
                    bftx = fleet.get("bftx", 0)
                    bfty = fleet.get("bfty", 0)
                    if math.hypot(bftx, bfty) > 150:
                        angles = []
                        for c in cells:
                            if c.get("velX", 0) != 0 or c.get("velY", 0) != 0:
                                angles.append(math.atan2(c.get("velY", 0), c.get("velX", 0)))
                        
                        if len(angles) < 5: continue
                        
                        sin_sum = sum(math.sin(a) for a in angles)
                        cos_sum = sum(math.cos(a) for a in angles)
                        mean_ang = math.atan2(sin_sum, cos_sum)
                        
                        diffs = [abs((a - mean_ang + math.pi) % (2*math.pi) - math.pi) for a in angles]
                        stddev_deg = np.std(diffs) * 180 / math.pi
                        stddevs.append(stddev_deg)

    print(f"Total samples (cruising fleets): {len(stddevs)}")
    print(f"Mean Heading StdDev within a fleet: {np.mean(stddevs):.2f} degrees")
    print(f"95th percentile: {np.percentile(stddevs, 95):.2f} degrees")
    
if __name__ == "__main__":
    main()
