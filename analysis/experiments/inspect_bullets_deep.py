#!/usr/bin/env python3
"""
Deep inspection of bullet lifecycle and packet fields across playback sessions.
"""

import os
import sys
import glob
import math
import struct
from collections import defaultdict, Counter

sys.path.append(os.path.abspath("analysis/experiments"))
from extract_telemetry import BinaryReader, parse_variable_header, parse_world_update

playback_dir = os.path.abspath("reference/space1-original/server-ansible/record/playback")
files = sorted(glob.glob(os.path.join(playback_dir, "*")), key=lambda x: -os.path.getsize(x))

print(f"Found {len(files)} playback files.")

# Let's inspect all files or top 10 files to get comprehensive statistics
file_limit = 10

total_bullets_seen = 0
spawn_max_life_counter = Counter()
spawn_life_counter = Counter()
life_diff_counter = Counter()
deleted_flags_counter = Counter()
decay_flags_counter = Counter()

bullets_data = {}

for f_idx, filepath in enumerate(files[:file_limit]):
    print(f"Processing file {f_idx+1}/{file_limit}: {os.path.basename(filepath)}...")
    with open(filepath, "rb") as f:
        data = f.read()

    pos = 0
    frame_idx = 0

    # Local file tracking
    live_fleets = set()
    fleet_sizes = {} # fleet_id -> size
    bullet_records = {} # b_id -> record
    deleted_in_file = {} # b_id -> (frame, flags)

    while pos + 12 <= len(data):
        high, low, length = struct.unpack_from("<III", data, pos)
        ticks = (high << 32) | low
        payload = data[pos+12 : pos+12+length]
        pos += 12 + length

        try:
            reader = BinaryReader(payload)
            msg_type = parse_variable_header(reader)
            if msg_type == 0x10:
                wu = parse_world_update(reader)
                
                # Update deleted
                for del_id, del_flags in wu.get("deleted", []):
                    deleted_in_file[del_id] = (frame_idx, del_flags)
                    deleted_flags_counter[del_flags] += 1

                current_frame_fleets = set()
                current_frame_bullets = set()

                for fleet in wu.get("fleets", []):
                    f_id = fleet["id"]
                    current_frame_fleets.add(f_id)
                    f_size = fleet.get("fleetSizeOnServer", 0)
                    ship_cells = [c for c in fleet.get("cells", []) if not c["isBullet"] and not c["isSplitting"]]
                    bullet_cells = [c for c in fleet.get("cells", []) if c["isBullet"]]
                    
                    fleet_sizes[f_id] = len(ship_cells) if len(ship_cells) > 0 else f_size

                    for b in bullet_cells:
                        b_id = b["id"]
                        current_frame_bullets.add(b_id)
                        
                        if b_id not in bullet_records:
                            bullet_records[b_id] = {
                                "file_idx": f_idx,
                                "id": b_id,
                                "fleet_id": f_id,
                                "fleet_name": fleet.get("name", ""),
                                "fleet_size": fleet_sizes[f_id],
                                "spawn_frame": frame_idx,
                                "last_frame": frame_idx,
                                "spawn_bLife": b.get("bulletLife"),
                                "spawn_maxBLife": b.get("maxBulletLife"),
                                "spawn_decay": b["isInDecay"],
                                "spawn_decayTick": b.get("decayTick"),
                                "spawn_decayTotalTick": b.get("decayTotalTick"),
                                "spawn_shouldExplode": b["shouldExplode"],
                                "spawn_alpha": b["alpha"],
                                "velX": b["velX"],
                                "velY": b["velY"],
                                "speed": math.hypot(b["velX"], b["velY"]),
                                "history": []
                            }
                            spawn_max_life_counter[b.get("maxBulletLife")] += 1
                            spawn_life_counter[b.get("bulletLife")] += 1
                            if b.get("bulletLife") is not None and b.get("maxBulletLife") is not None:
                                life_diff_counter[b.get("maxBulletLife") - b.get("bulletLife")] += 1

                        rec = bullet_records[b_id]
                        rec["last_frame"] = frame_idx
                        rec["last_bLife"] = b.get("bulletLife")
                        rec["last_maxBLife"] = b.get("maxBulletLife")
                        rec["last_decay"] = b["isInDecay"]
                        rec["last_decayTick"] = b.get("decayTick")
                        rec["last_decayTotalTick"] = b.get("decayTotalTick")
                        rec["last_shouldExplode"] = b["shouldExplode"]
                        rec["last_alpha"] = b["alpha"]
                        rec["history"].append({
                            "frame": frame_idx,
                            "bLife": b.get("bulletLife"),
                            "decay": b["isInDecay"],
                            "alpha": b["alpha"]
                        })
                
                live_fleets = current_frame_fleets
                frame_idx += 1
        except Exception as e:
            pass

    # Process records for this file
    for b_id, rec in bullet_records.items():
        rec["total_frames_seen"] = rec["last_frame"] - rec["spawn_frame"] + 1
        if b_id in deleted_in_file:
            del_frame, del_flags = deleted_in_file[b_id]
            rec["deleted_frame"] = del_frame
            rec["del_flags"] = del_flags
            rec["ticks_to_deletion"] = del_frame - rec["spawn_frame"]
        else:
            rec["deleted_frame"] = None
            rec["del_flags"] = None
            rec["ticks_to_deletion"] = None
        
        global_id = (f_idx, b_id)
        bullets_data[global_id] = rec

print(f"\nTotal bullet records collected: {len(bullets_data)}")
print(f"Spawn maxBulletLife distribution (top 15): {spawn_max_life_counter.most_common(15)}")
print(f"Spawn bulletLife distribution (top 15): {spawn_life_counter.most_common(15)}")
print(f"Difference (maxBulletLife - bulletLife) at first sight (top 10): {life_diff_counter.most_common(10)}")
print(f"Deleted cell flags distribution: {deleted_flags_counter.most_common(10)}")
