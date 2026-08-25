import os
import sys
import glob
import struct
from collections import defaultdict, Counter

sys.path.append(os.path.abspath("analysis/experiments"))
from extract_telemetry import BinaryReader, parse_variable_header, parse_world_update

playback_dir = os.path.abspath("reference/space1-original/server-ansible/record/playback")
files = sorted(glob.glob(os.path.join(playback_dir, "*")), key=lambda x: -os.path.getsize(x))

print(f"Total files: {len(files)}")

# Inspect the largest file
filepath = files[0]
print(f"Inspecting {os.path.basename(filepath)} ({os.path.getsize(filepath)} bytes)")

with open(filepath, "rb") as f:
    data = f.read()

pos = 0
frame_idx = 0

bullet_history = defaultdict(list)
bullet_fleet = {}
deleted_cells = {}

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
            
            # Record deleted cells
            for del_id, del_flags in wu.get("deleted", []):
                deleted_cells[del_id] = (frame_idx, del_flags)
            
            # Record fleets & bullets
            for fleet in wu.get("fleets", []):
                f_id = fleet["id"]
                f_name = fleet.get("name", "")
                f_size = fleet.get("fleetSizeOnServer", 0)
                ship_cells = [c for c in fleet.get("cells", []) if not c["isBullet"] and not c["isSplitting"]]
                bullet_cells = [c for c in fleet.get("cells", []) if c["isBullet"]]
                
                for b in bullet_cells:
                    b_id = b["id"]
                    if b_id not in bullet_fleet:
                        bullet_fleet[b_id] = {
                            "fleet_id": f_id,
                            "fleet_name": f_name,
                            "fleet_size_on_server": f_size,
                            "ship_count": len(ship_cells),
                            "first_frame": frame_idx,
                            "first_bulletLife": b.get("bulletLife"),
                            "first_maxBulletLife": b.get("maxBulletLife"),
                        }
                    bullet_history[b_id].append({
                        "frame": frame_idx,
                        "x": b["x"],
                        "y": b["y"],
                        "vx": b["velX"],
                        "vy": b["velY"],
                        "alpha": b["alpha"],
                        "bulletLife": b.get("bulletLife"),
                        "maxBulletLife": b.get("maxBulletLife"),
                        "flags": b["flags"],
                        "isInDecay": b["isInDecay"],
                        "decayTick": b.get("decayTick"),
                        "decayTotalTick": b.get("decayTotalTick"),
                        "shouldExplode": b["shouldExplode"],
                    })
            frame_idx += 1
    except Exception as e:
        pass

print(f"Total frames processed: {frame_idx}")
print(f"Total distinct bullets seen: {len(bullet_history)}")

# Sample first 10 bullets
sample_count = 0
for b_id, hist in list(bullet_history.items())[:10]:
    del_info = deleted_cells.get(b_id, ("Not in deleted list", None))
    meta = bullet_fleet[b_id]
    print(f"\n--- Bullet ID {b_id} ---")
    print(f"  Fleet: {meta['fleet_name']} (id={meta['fleet_id']}, serverSize={meta['fleet_size_on_server']}, shipCount={meta['ship_count']})")
    print(f"  Frames tracked: {len(hist)}, First frame: {hist[0]['frame']}, Last frame: {hist[-1]['frame']}")
    print(f"  Deleted info: {del_info}")
    print(f"  First sample: bLife={hist[0]['bulletLife']}, maxBLife={hist[0]['maxBulletLife']}, decay={hist[0]['isInDecay']}({hist[0].get('decayTick')}/{hist[0].get('decayTotalTick')}), explode={hist[0]['shouldExplode']}, alpha={hist[0]['alpha']}")
    if len(hist) > 1:
        print(f"  Mid sample:   bLife={hist[len(hist)//2]['bulletLife']}, maxBLife={hist[len(hist)//2]['maxBulletLife']}, decay={hist[len(hist)//2]['isInDecay']}, explode={hist[len(hist)//2]['shouldExplode']}, alpha={hist[len(hist)//2]['alpha']}")
    print(f"  Last sample:  bLife={hist[-1]['bulletLife']}, maxBLife={hist[-1]['maxBulletLife']}, decay={hist[-1]['isInDecay']}({hist[-1].get('decayTick')}/{hist[-1].get('decayTotalTick')}), explode={hist[-1]['shouldExplode']}, alpha={hist[-1]['alpha']}")
    print(f"  All bLife values: {[h['bulletLife'] for h in hist]}")
    print(f"  All maxBLife values: {[h['maxBulletLife'] for h in hist]}")
