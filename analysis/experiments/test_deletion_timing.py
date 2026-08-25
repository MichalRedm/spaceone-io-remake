import os
import sys
import glob
import math
import struct
from collections import defaultdict, Counter
import numpy as np

sys.path.append(os.path.abspath("analysis/experiments"))
from extract_telemetry import BinaryReader, parse_variable_header, parse_world_update

playback_dir = os.path.abspath("reference/space1-original/server-ansible/record/playback")
files = sorted(glob.glob(os.path.join(playback_dir, "*")), key=lambda x: -os.path.getsize(x))

print(f"Inspecting file: {files[0]}")

with open(files[0], "rb") as f:
    data = f.read()

pos = 0
tick = 0

spawned_bullets = {} # id -> dict
deleted_bullets = {} # id -> (tick, flags)
all_bullets = []

while pos + 12 <= len(data):
    high, low, length = struct.unpack_from("<III", data, pos)
    payload = data[pos+12 : pos+12+length]
    pos += 12 + length

    try:
        reader = BinaryReader(payload)
        msg_type = parse_variable_header(reader)
        if msg_type == 0x10:
            wu = parse_world_update(reader)
            
            # Record deletions
            for del_id, del_flags in wu.get("deleted", []):
                deleted_bullets[del_id] = (tick, del_flags)
                if del_id in spawned_bullets:
                    b = spawned_bullets[del_id]
                    b["del_tick"] = tick
                    b["del_flags"] = del_flags
                    b["actual_lifespan_ticks"] = tick - b["spawn_tick"]

            for fleet in wu.get("fleets", []):
                f_id = fleet["id"]
                ship_cells = [c for c in fleet.get("cells", []) if not c["isBullet"] and not c["isSplitting"]]
                bullet_cells = [c for c in fleet.get("cells", []) if c["isBullet"]]
                
                f_size = len(ship_cells) if len(ship_cells) > 0 else fleet.get("fleetSizeOnServer", 1)

                for b in bullet_cells:
                    b_id = b["id"]
                    if b_id not in spawned_bullets:
                        b_rec = {
                            "id": b_id,
                            "fleet_id": f_id,
                            "fleet_size": f_size,
                            "spawn_tick": tick,
                            "last_seen_tick": tick,
                            "see_count": 1,
                            "bLife": b.get("bulletLife"),
                            "maxBLife": b.get("maxBulletLife"),
                            "del_tick": None,
                            "del_flags": None,
                            "actual_lifespan_ticks": None
                        }
                        spawned_bullets[b_id] = b_rec
                        all_bullets.append(b_rec)
                    else:
                        spawned_bullets[b_id]["see_count"] += 1
                        spawned_bullets[b_id]["last_seen_tick"] = tick
            tick += 1
    except Exception as e:
        pass

print(f"Total ticks in file: {tick}")
print(f"Total spawned bullets: {len(all_bullets)}")

with_deletion = [b for b in all_bullets if b["del_tick"] is not None]
print(f"Bullets with explicit deletion event: {len(with_deletion)} ({len(with_deletion)/len(all_bullets)*100:.1f}%)")

# Compare actual_lifespan_ticks with maxBLife and bLife
print("\nSample bullets with deletion:")
for b in with_deletion[:20]:
    print(f"  ID: {b['id']} | FleetSize: {b['fleet_size']:2d} | maxBLife: {b['maxBLife']:2d} | bLife: {b['bLife']:2d} | seeCount: {b['see_count']} | Spawn: {b['spawn_tick']} -> Del: {b['del_tick']} | ActualLifeTicks: {b['actual_lifespan_ticks']} | Diff(max-act): {b['maxBLife'] - b['actual_lifespan_ticks']} | DelFlags: {b['del_flags']}")

# Check distribution of actual_lifespan_ticks vs maxBLife
diffs = [b["maxBLife"] - b["actual_lifespan_ticks"] for b in with_deletion if b["maxBLife"] is not None and b["actual_lifespan_ticks"] is not None]
diff_counter = Counter(diffs)
print(f"\nTop 15 differences between maxBLife and actual_lifespan_ticks:")
for d, c in diff_counter.most_common(15):
    print(f"  diff = {d:3d}: {c:5d} ({c/len(diffs)*100:.1f}%)")
