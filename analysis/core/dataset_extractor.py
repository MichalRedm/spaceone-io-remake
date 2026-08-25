#!/usr/bin/env python3
"""
Telemetry Dataset Extractor for Spaceone.io Kinematic Analysis.

Extracts clean, non-dashing, continuous trajectory segments from binary playback recordings:
- Single-ship fleets (N=1) for pure vehicle physics (zero flocking forces).
- Constant-size multi-ship centroids (N=2, 3, 5, 10, 20) for fleet scaling physics.
Strictly filters out dashing/boost periods with safety margins.
"""

import os
import sys
import math
import json
import random
import argparse
from collections import defaultdict
from typing import List, Dict, Any, Tuple

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))
from analysis.core.session_loader import get_playback_files, iterate_session_packets
from analysis.core.binary_reader import BinaryReader
from analysis.core.packet_parser import parse_variable_header, parse_world_update


def extract_tracks_from_playbacks(
    playback_files: List[str],
    min_track_length: int = 30,
    dash_buffer_ticks: int = 5,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extracts continuous single-ship (N=1) and multi-ship stable-size tracks.
    Returns (single_ship_tracks, multi_ship_tracks).
    """
    single_ship_tracks: List[Dict[str, Any]] = []
    multi_ship_tracks: List[Dict[str, Any]] = []

    print(f"[*] Processing {len(playback_files)} playback recordings...")

    for f_idx, fpath in enumerate(playback_files):
        fleet_history = defaultdict(list)
        last_dash_tick = defaultdict(lambda: -999)
        wu_index = 0

        for _, ts_ms, payload in iterate_session_packets(fpath):
            try:
                reader = BinaryReader(payload)
                msg_type = parse_variable_header(reader)
                if msg_type != 0x10:
                    continue
                wu = parse_world_update(reader)
            except Exception:
                continue

            wu_index += 1
            for fleet in wu.get("fleets", []):
                f_id = fleet["id"]
                is_dashing = bool(fleet.get("isDashing", False))
                if is_dashing:
                    last_dash_tick[f_id] = wu_index

                # Only non-bullet active cells
                cells = [
                    c for c in fleet.get("cells", [])
                    if not c.get("isBullet", False) and not c.get("isInDecay", False)
                ]
                if not cells:
                    continue

                fleet_history[f_id].append({
                    "wu_index": wu_index,
                    "ts_ms": ts_ms,
                    "fleet_size": fleet.get("fleetSizeOnServer", len(cells)),
                    "is_dashing": is_dashing,
                    "bcx": fleet.get("bcx", 0),
                    "bcy": fleet.get("bcy", 0),
                    "dbfx": fleet.get("dbfx", 1.0),
                    "dbfy": fleet.get("dbfy", 0.0),
                    "bftx": fleet.get("bftx", 0),
                    "bfty": fleet.get("bfty", 0),
                    "cells": [
                        {
                            "id": c["id"],
                            "x": c["x"],
                            "y": c["y"],
                            "vx": c["velX"],
                            "vy": c["velY"],
                        }
                        for c in cells
                    ],
                })

        # Process segments for each fleet in this recording
        for f_id, frames in fleet_history.items():
            current_single_segment: List[Dict[str, Any]] = []
            current_multi_segment: List[Dict[str, Any]] = []
            last_multi_size = None

            for i, fr in enumerate(frames):
                # Check continuity with previous frame in this segment
                is_cont = False
                if i > 0 and fr["wu_index"] == frames[i - 1]["wu_index"] + 1:
                    is_cont = True

                # Check dashing exclusion buffer
                dash_safe = (fr["wu_index"] - last_dash_tick[f_id]) > dash_buffer_ticks and not fr["is_dashing"]

                # 1. Single Ship Track (fleet_size == 1 and exactly 1 cell)
                if fr["fleet_size"] == 1 and len(fr["cells"]) == 1 and dash_safe:
                    c = fr["cells"][0]
                    sample = {
                        "frame": fr["wu_index"],
                        "ts_ms": fr["ts_ms"],
                        "pos": [float(c["x"]), float(c["y"])],
                        "vel": [float(c["vx"]), float(c["vy"])],
                        "heading": [float(fr["dbfx"]), float(fr["dbfy"])],
                        "target_pos": [float(fr["bftx"]), float(fr["bfty"])],
                    }
                    if is_cont and current_single_segment:
                        current_single_segment.append(sample)
                    else:
                        if len(current_single_segment) >= min_track_length:
                            single_ship_tracks.append({
                                "file_idx": f_idx,
                                "fleet_id": f_id,
                                "fleet_size": 1,
                                "length": len(current_single_segment),
                                "samples": current_single_segment,
                            })
                        current_single_segment = [sample]
                else:
                    if len(current_single_segment) >= min_track_length:
                        single_ship_tracks.append({
                            "file_idx": f_idx,
                            "fleet_id": f_id,
                            "fleet_size": 1,
                            "length": len(current_single_segment),
                            "samples": current_single_segment,
                        })
                    current_single_segment = []

                # 2. Multi-ship Constant-size Centroid Track (fleet_size >= 2)
                f_size = fr["fleet_size"]
                if f_size >= 2 and dash_safe:
                    # Compute mean velocity across cells
                    avg_vx = sum(c["vx"] for c in fr["cells"]) / len(fr["cells"])
                    avg_vy = sum(c["vy"] for c in fr["cells"]) / len(fr["cells"])
                    sample = {
                        "frame": fr["wu_index"],
                        "ts_ms": fr["ts_ms"],
                        "pos": [float(fr["bcx"]), float(fr["bcy"])],
                        "vel": [float(avg_vx), float(avg_vy)],
                        "heading": [float(fr["dbfx"]), float(fr["dbfy"])],
                        "target_pos": [float(fr["bftx"]), float(fr["bfty"])],
                    }
                    if is_cont and current_multi_segment and last_multi_size == f_size:
                        current_multi_segment.append(sample)
                    else:
                        if len(current_multi_segment) >= min_track_length:
                            multi_ship_tracks.append({
                                "file_idx": f_idx,
                                "fleet_id": f_id,
                                "fleet_size": last_multi_size,
                                "length": len(current_multi_segment),
                                "samples": current_multi_segment,
                            })
                        current_multi_segment = [sample]
                        last_multi_size = f_size
                else:
                    if len(current_multi_segment) >= min_track_length:
                        multi_ship_tracks.append({
                            "file_idx": f_idx,
                            "fleet_id": f_id,
                            "fleet_size": last_multi_size,
                            "length": len(current_multi_segment),
                            "samples": current_multi_segment,
                        })
                    current_multi_segment = []
                    last_multi_size = None

            # Flush remaining
            if len(current_single_segment) >= min_track_length:
                single_ship_tracks.append({
                    "file_idx": f_idx,
                    "fleet_id": f_id,
                    "fleet_size": 1,
                    "length": len(current_single_segment),
                    "samples": current_single_segment,
                })
            if len(current_multi_segment) >= min_track_length:
                multi_ship_tracks.append({
                    "file_idx": f_idx,
                    "fleet_id": f_id,
                    "fleet_size": last_multi_size,
                    "length": len(current_multi_segment),
                    "samples": current_multi_segment,
                })

    print(
        f"[+] Extraction complete: {len(single_ship_tracks)} single-ship tracks (N=1) "
        f"and {len(multi_ship_tracks)} multi-ship stable centroid tracks (N>=2)."
    )
    return single_ship_tracks, multi_ship_tracks


def split_and_save_dataset(
    single_tracks: List[Dict[str, Any]],
    multi_tracks: List[Dict[str, Any]],
    output_json: str,
    train_ratio: float = 0.60,
    seed: int = 42,
):
    random.seed(seed)
    # Shuffle tracks
    s_tracks = list(single_tracks)
    m_tracks = list(multi_tracks)
    random.shuffle(s_tracks)
    random.shuffle(m_tracks)

    s_split = int(len(s_tracks) * train_ratio)
    m_split = int(len(m_tracks) * train_ratio)

    dataset = {
        "metadata": {
            "train_ratio": train_ratio,
            "seed": seed,
            "total_single_ship_tracks": len(s_tracks),
            "total_multi_ship_tracks": len(m_tracks),
            "total_single_ship_frames": sum(t["length"] for t in s_tracks),
            "total_multi_ship_frames": sum(t["length"] for t in m_tracks),
        },
        "single_ship": {
            "train": s_tracks[:s_split],
            "test": s_tracks[s_split:],
        },
        "multi_ship": {
            "train": m_tracks[:m_split],
            "test": m_tracks[m_split:],
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(output_json)), exist_ok=True)
    with open(output_json, "w") as f:
        json.dump(dataset, f, indent=2)

    print(f"[+] Dataset saved to {output_json}")
    print(f"    - Single Ship (N=1): {len(dataset['single_ship']['train'])} train, {len(dataset['single_ship']['test'])} test")
    print(f"    - Multi Ship (N>=2): {len(dataset['multi_ship']['train'])} train, {len(dataset['multi_ship']['test'])} test")


def main():
    parser = argparse.ArgumentParser(description="Extract clean kinematic datasets from playback files.")
    parser.add_argument("--max-files", type=int, default=30, help="Max playback files to process")
    parser.add_argument("--min-length", type=int, default=30, help="Min track length in frames")
    parser.add_argument("--output", type=str, default=None, help="Output JSON path")
    args = parser.parse_args()

    playback_files = get_playback_files(max_files=args.max_files)
    if not playback_files:
        print("[!] No playback files found.")
        sys.exit(1)

    s_tracks, m_tracks = extract_tracks_from_playbacks(
        playback_files, min_track_length=args.min_length
    )

    if args.output is None:
        args.output = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../datasets/movement_physics_tracks.json")
        )

    split_and_save_dataset(s_tracks, m_tracks, args.output)


if __name__ == "__main__":
    main()
