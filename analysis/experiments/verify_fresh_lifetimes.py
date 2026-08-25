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

file_limit = 5

fresh_bullets = [] # bullets where (maxBLife - bLife) <= 1 at spawn

for f_idx, filepath in enumerate(files[:file_limit]):
    with open(filepath, "rb") as f:
        data = f.read()

    pos = 0
    tick = 0

    spawned = {}
    deleted = {}

    while pos + 12 <= len(data):
        high, low, length = struct.unpack_from("<III", data, pos)
        payload = data[pos+12 : pos+12+length]
        pos += 12 + length

        try:
            reader = BinaryReader(payload)
            msg_type = parse_variable_header(reader)
            if msg_type == 0x10:
                wu = parse_world_update(reader)
                
                for del_id, del_flags in wu.get("deleted", []):
                    deleted[del_id] = (tick, del_flags)
                    if del_id in spawned:
                        b = spawned[del_id]
                        b["del_tick"] = tick
                        b["del_flags"] = del_flags
                        b["lifespan"] = tick - b["spawn_tick"]

                for fleet in wu.get("fleets", []):
                    f_id = fleet["id"]
                    ship_cells = [c for c in fleet.get("cells", []) if not c["isBullet"] and not c["isSplitting"]]
                    bullet_cells = [c for c in fleet.get("cells", []) if c["isBullet"]]
                    f_size = len(ship_cells) if len(ship_cells) > 0 else fleet.get("fleetSizeOnServer", 1)

                    for b in bullet_cells:
                        b_id = b["id"]
                        if b_id not in spawned:
                            rec = {
                                "id": b_id,
                                "fleet_id": f_id,
                                "fleet_size": f_size,
                                "spawn_tick": tick,
                                "bLife": b.get("bulletLife"),
                                "maxBLife": b.get("maxBulletLife"),
                                "del_tick": None,
                                "lifespan": None
                            }
                            spawned[b_id] = rec
                            if rec["bLife"] is not None and rec["maxBLife"] is not None:
                                if rec["maxBLife"] - rec["bLife"] <= 1:
                                    fresh_bullets.append(rec)
                tick += 1
        except Exception:
            pass

print(f"Total fresh bullets identified (spawned right in front of us): {len(fresh_bullets)}")
fresh_with_del = [b for b in fresh_bullets if b["lifespan"] is not None]
print(f"Fresh bullets with deletion: {len(fresh_with_del)}")

# Let's inspect lifespan vs maxBLife
diffs = [b["maxBLife"] - b["lifespan"] for b in fresh_with_del]
diff_cnt = Counter(diffs)

print("\nLifespan vs maxBLife difference distribution for FRESH bullets:")
for d, c in sorted(diff_cnt.items()):
    if c > 10 or abs(d) <= 5:
        print(f"  maxBLife - lifespan = {d:3d}: {c:5d} ({c/len(fresh_with_del)*100:5.2f}%)")

# Let's group by maxBLife - lifespan == 0 (or 1) -> EXACT FULL LIFETIME!
full_life_bullets = [b for b in fresh_with_del if b["maxBLife"] - b["lifespan"] in (0, 1)]
premature_bullets = [b for b in fresh_with_del if b["maxBLife"] - b["lifespan"] > 1]
extended_bullets = [b for b in fresh_with_del if b["maxBLife"] - b["lifespan"] < 0]

print(f"\nSummary of Fresh Bullets:")
print(f"  Exact Full Lifetime (diff 0 or 1): {len(full_life_bullets)} ({len(full_life_bullets)/len(fresh_with_del)*100:.1f}%)")
print(f"  Premature Deletion (diff > 1)     : {len(premature_bullets)} ({len(premature_bullets)/len(fresh_with_del)*100:.1f}%)")
print(f"  Extended / Desync (diff < 0)      : {len(extended_bullets)} ({len(extended_bullets)/len(fresh_with_del)*100:.1f}%)")
