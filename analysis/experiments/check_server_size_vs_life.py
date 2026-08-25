import os
import sys
import glob
import struct
from collections import defaultdict, Counter

sys.path.append(os.path.abspath("analysis/experiments"))
from extract_telemetry import BinaryReader, parse_variable_header, parse_world_update

playback_dir = os.path.abspath("reference/space1-original/server-ansible/record/playback")
files = sorted(glob.glob(os.path.join(playback_dir, "*")), key=lambda x: -os.path.getsize(x))

server_size_map = defaultdict(Counter)

for filepath in files[:10]:
    with open(filepath, "rb") as f:
        data = f.read()
    pos = 0
    while pos + 12 <= len(data):
        high, low, length = struct.unpack_from("<III", data, pos)
        payload = data[pos+12 : pos+12+length]
        pos += 12 + length
        try:
            reader = BinaryReader(payload)
            msg_type = parse_variable_header(reader)
            if msg_type == 0x10:
                wu = parse_world_update(reader)
                for fleet in wu.get("fleets", []):
                    f_size_server = fleet.get("fleetSizeOnServer", 0)
                    for b in fleet.get("cells", []):
                        if b["isBullet"] and b.get("maxBulletLife") is not None:
                            server_size_map[f_size_server][b["maxBulletLife"]] += 1
        except Exception:
            pass

print(f"{'ServerSize':<10} | {'Dominant maxBLife':<18} | {'Distribution'}")
print("-" * 60)
for sz in sorted(server_size_map.keys())[:30]:
    cnt = server_size_map[sz]
    dom, dom_cnt = cnt.most_common(1)[0]
    total = sum(cnt.values())
    print(f"{sz:<10d} | {dom:2d} ({dom*40:4d} ms, {dom_cnt/total*100:4.1f}%) | {cnt.most_common(3)}")
