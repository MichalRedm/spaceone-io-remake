import os
import sys
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update
from collections import defaultdict

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
            
    close_tracks = [t for t in tracks if np.linalg.norm(t["samples"][0]["target_pos"]) < 100]
    
    true_radii = []
    min_dists = []
    
    for t in close_tracks[:100]:
        for fr in t["samples"][:20]:
            pos = np.array([ [c["x"], c["y"]] for c in fr["cells"] ])
            center = np.mean(pos, axis=0)
            rel = pos - center
            true_radii.append(np.mean(np.linalg.norm(rel, axis=1)))
            
            step_min_dist = 9999.0
            for i in range(len(pos)):
                for j in range(i+1, len(pos)):
                    d = np.linalg.norm(pos[i] - pos[j])
                    if d < step_min_dist: step_min_dist = d
            min_dists.append(step_min_dist)
            
    print(f"True Mean Fleet Radius: {np.mean(true_radii):.2f} px")
    print(f"True Mean Min Dist: {np.mean(min_dists):.2f} px")

if __name__ == "__main__":
    main()
