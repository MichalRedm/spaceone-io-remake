#!/usr/bin/env python3
"""
Investigation: Viewport culling, AOI boundaries, and DeletedCell behavior for bullets.

Questions to answer:
1. Does the server send DeletedCell when a bullet exits the client AOI/viewport, or only upon actual death?
2. What was the spatial position of bullets at the moment of deletion? Did they stay within viewport/camera range?
3. How does distance from camera affect the measured lifespans?
"""

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

file_to_check = files[0]
print(f"Analyzing viewport / AOI dynamics in {os.path.basename(file_to_check)}...")

with open(file_to_check, "rb") as f:
    data = f.read()

pos = 0
tick = 0

spawned_bullets = {}
my_fleet_positions = {} # tick -> (x, y)
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
            
            # Check player fleet position for camera center
            for fleet in wu.get("fleets", []):
                if fleet.get("isMyFleet"):
                    my_fleet_positions[tick] = (fleet.get("bcx", 0), fleet.get("bcy", 0))

            # Deleted cells in this tick
            for del_id, del_flags in wu.get("deleted", []):
                if del_id in spawned_bullets:
                    b = spawned_bullets[del_id]
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
                    if b_id not in spawned_bullets:
                        rec = {
                            "id": b_id,
                            "fleet_id": f_id,
                            "fleet_size": f_size,
                            "spawn_tick": tick,
                            "spawn_x": b["x"],
                            "spawn_y": b["y"],
                            "last_x": b["x"],
                            "last_y": b["y"],
                            "velX": b["velX"],
                            "velY": b["velY"],
                            "speed": math.hypot(b["velX"], b["velY"]),
                            "bLife": b.get("bulletLife"),
                            "maxBLife": b.get("maxBulletLife"),
                            "del_tick": None,
                            "del_flags": None,
                            "lifespan": None,
                            "is_my_fleet": fleet.get("isMyFleet", False)
                        }
                        spawned_bullets[b_id] = rec
                        all_bullets.append(rec)
            tick += 1
    except Exception:
        pass

print(f"Total ticks: {tick}, Total bullets: {len(all_bullets)}")

# Calculate projected distance traveled at natural expiration
# In Spaceone: displacement per tick ~ 18-20 units/tick.
# 50 ticks * 20 units/tick = 1000 units!
# What is the viewport size in Spaceone?
# Total arena span: ~12,649 units.
# Camera view / AOI grid: typically ~3000-4000 units wide.

# Let's inspect bullets where maxBLife - lifespan == 0 (natural full life)
full_life = [b for b in all_bullets if b["lifespan"] is not None and b["maxBLife"] is not None and (b["maxBLife"] - b["lifespan"]) in (0, 1) and (b["maxBLife"] - b["bLife"]) <= 1]

# Bullets where maxBLife - lifespan > 1 (early death)
early_del = [b for b in all_bullets if b["lifespan"] is not None and b["maxBLife"] is not None and (b["maxBLife"] - b["lifespan"]) > 1 and (b["maxBLife"] - b["bLife"]) <= 1]

print(f"\nFresh Bullets with Natural Full Expiration (diff 0-1): {len(full_life)}")
print(f"Fresh Bullets with Early Deletion (diff > 1): {len(early_del)}")

# Check distance from camera at spawn vs at death for own bullets
my_full_life = [b for b in full_life if b["is_my_fleet"]]
print(f"\nOwn player bullets with full life: {len(my_full_life)}")
if my_full_life:
    sample = my_full_life[:5]
    for s in sample:
        cam_spawn = my_fleet_positions.get(s["spawn_tick"], (0, 0))
        dist_spawn = math.hypot(s["spawn_x"] - cam_spawn[0], s["spawn_y"] - cam_spawn[1])
        proj_x = s["spawn_x"] + s["velX"] * s["lifespan"]
        proj_y = s["spawn_y"] + s["velY"] * s["lifespan"]
        cam_del = my_fleet_positions.get(s["del_tick"], (0, 0))
        dist_del = math.hypot(proj_x - cam_del[0], proj_y - cam_del[1])
        print(f"  Bullet ID {s['id']}: N={s['fleet_size']}, maxBLife={s['maxBLife']}, lifespan={s['lifespan']} ticks ({s['lifespan']*40}ms), distFromCamAtSpawn={dist_spawn:.1f}px, distFromCamAtDeath={dist_del:.1f}px")

# Check if bullets that vanished without deletion occurred:
no_deletion = [b for b in all_bullets if b["del_tick"] is None]
print(f"\nBullets that never received a DeletedCell message: {len(no_deletion)} out of {len(all_bullets)} ({len(no_deletion)/len(all_bullets)*100:.3f}%)")
