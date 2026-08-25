#!/usr/bin/env python3
"""
Comprehensive Bullet Lifetime Measurement & Verification Experiment.

Analyzes all binary playback sessions from Spaceone.io:
1. Tracks every bullet from birth to death.
2. Distinguishes between premature destruction (collision, shooter death, OOB, viewport exit)
   and confident full natural expiration.
3. Quantifies empirical full lifetime vs. fleet size N.
4. Validates packet fields (bulletLife, maxBulletLife, decay flags, delete flags).
5. Compares original game mechanics with the current remake implementation.
"""

import os
import sys
import glob
import math
import struct
import json
from collections import defaultdict, Counter
import numpy as np

sys.path.append(os.path.abspath("analysis/experiments"))
from extract_telemetry import BinaryReader, parse_variable_header, parse_world_update

playback_dir = os.path.abspath("reference/space1-original/server-ansible/record/playback")
files = sorted(glob.glob(os.path.join(playback_dir, "*")), key=lambda x: -os.path.getsize(x))

print(f"[*] Found {len(files)} playback files. Processing all recordings...")

# We will collect bullet events
# For each bullet, we track:
# - fleet_size N (at moment of firing)
# - initial_bulletLife
# - initial_maxBulletLife
# - spawn_tick
# - delete_tick (from wu['deleted'] or last seen)
# - observed_ticks
# - death_reason: 'expired_natural', 'hit_collision', 'shooter_died', 'viewport_lost', 'unknown'
# - is_confident_full_life: bool

bullet_records = []
fleet_size_to_full_lifetimes = defaultdict(list)
fleet_size_to_max_bullet_life = defaultdict(list)
death_reasons = Counter()

# Also track per-tick countdown verification
countdown_steps = []

for file_idx, filepath in enumerate(files):
    fname = os.path.basename(filepath)
    with open(filepath, "rb") as f:
        data = f.read()

    pos = 0
    tick = 0

    # Active bullets in this session: id -> dict
    active_bullets = {}
    
    # Active fleets in this session: id -> dict of status
    active_fleets = {}

    while pos + 12 <= len(data):
        high, low, length = struct.unpack_from("<III", data, pos)
        payload = data[pos+12 : pos+12+length]
        pos += 12 + length

        try:
            reader = BinaryReader(payload)
            msg_type = parse_variable_header(reader)
            if msg_type == 0x10:
                wu = parse_world_update(reader)
                
                # 1. Parse deleted cells in this tick
                deleted_ids = {}
                for del_id, del_flags in wu.get("deleted", []):
                    deleted_ids[del_id] = del_flags

                # 2. Parse current fleets and ships
                current_fleets = {}
                current_ships_pos = [] # [(x, y, fleet_id, radius)]
                seen_bullets_this_tick = set()

                for fleet in wu.get("fleets", []):
                    f_id = fleet["id"]
                    f_size = fleet.get("fleetSizeOnServer", 0)
                    ship_cells = [c for c in fleet.get("cells", []) if not c["isBullet"] and not c["isSplitting"]]
                    bullet_cells = [c for c in fleet.get("cells", []) if c["isBullet"]]
                    
                    actual_ship_count = len(ship_cells) if len(ship_cells) > 0 else f_size
                    current_fleets[f_id] = {
                        "name": fleet.get("name", ""),
                        "ship_count": actual_ship_count,
                        "server_size": f_size,
                        "bcx": fleet.get("bcx", 0),
                        "bcy": fleet.get("bcy", 0)
                    }

                    for s in ship_cells:
                        current_ships_pos.append((s["x"], s["y"], f_id, s.get("radius", 20)))

                    for b in bullet_cells:
                        b_id = b["id"]
                        seen_bullets_this_tick.add(b_id)

                        if b_id not in active_bullets:
                            # New bullet spawned!
                            active_bullets[b_id] = {
                                "id": b_id,
                                "file_idx": file_idx,
                                "fleet_id": f_id,
                                "fleet_name": fleet.get("name", ""),
                                "fleet_size_at_spawn": actual_ship_count,
                                "spawn_tick": tick,
                                "last_seen_tick": tick,
                                "init_bLife": b.get("bulletLife"),
                                "init_maxBLife": b.get("maxBulletLife"),
                                "last_bLife": b.get("bulletLife"),
                                "last_maxBLife": b.get("maxBulletLife"),
                                "last_x": b["x"],
                                "last_y": b["y"],
                                "velX": b["velX"],
                                "velY": b["velY"],
                                "flags": b["flags"],
                                "isInDecay": b["isInDecay"],
                                "decayTick": b.get("decayTick"),
                                "decayTotalTick": b.get("decayTotalTick"),
                                "shouldExplode": b["shouldExplode"],
                                "alpha": b["alpha"],
                                "positions": [(tick, b["x"], b["y"], b.get("bulletLife"))],
                                "fleet_alive_throughout": True,
                            }
                        else:
                            # Bullet continuation update
                            ab = active_bullets[b_id]
                            prev_tick = ab["last_seen_tick"]
                            prev_life = ab["last_bLife"]
                            curr_life = b.get("bulletLife")
                            
                            if curr_life is not None and prev_life is not None and tick > prev_tick:
                                countdown_steps.append((tick - prev_tick, prev_life - curr_life))

                            ab["last_seen_tick"] = tick
                            ab["last_bLife"] = curr_life
                            ab["last_maxBLife"] = b.get("maxBulletLife")
                            ab["last_x"] = b["x"]
                            ab["last_y"] = b["y"]
                            ab["positions"].append((tick, b["x"], b["y"], curr_life))

                # Check if shooter fleets of active bullets are still alive
                for b_id, ab in active_bullets.items():
                    if ab["fleet_id"] not in current_fleets:
                        ab["fleet_alive_throughout"] = False

                # 3. Check for deleted bullets or lost bullets
                dead_bullet_ids = []
                for b_id, ab in active_bullets.items():
                    is_deleted_in_wu = b_id in deleted_ids
                    
                    # If it's explicitly deleted in wu OR it disappeared from ticks
                    if is_deleted_in_wu:
                        ab["deleted_tick"] = tick
                        ab["del_flags"] = deleted_ids[b_id]
                        dead_bullet_ids.append(b_id)
                    elif (tick - ab["last_seen_tick"]) > 2: # No update for > 2 ticks
                        # Bullet vanished without explicit delete in this window or out of view
                        ab["deleted_tick"] = ab["last_seen_tick"]
                        ab["del_flags"] = None
                        dead_bullet_ids.append(b_id)

                for b_id in dead_bullet_ids:
                    ab = active_bullets.pop(b_id)
                    
                    # Analyze lifetime & destruction cause
                    spawn_tick = ab["spawn_tick"]
                    death_tick = ab.get("deleted_tick", ab["last_seen_tick"])
                    observed_life_ticks = death_tick - spawn_tick
                    
                    init_max = ab["init_maxBLife"]
                    init_life = ab["init_bLife"]
                    last_life = ab["last_bLife"]
                    
                    # Check conditions for CONFIDENT FULL LIFETIME:
                    # 1. We saw it on its spawn tick (init_life == init_max or init_life == init_max - 1)
                    saw_at_spawn = (init_max is not None and init_life is not None and (init_max - init_life) <= 1)
                    
                    # 2. Shooter fleet remained alive throughout the flight
                    shooter_survived = ab["fleet_alive_throughout"]
                    
                    # 3. Was it deleted at expected expiration?
                    # In Spaceone, does maxBulletLife ticks match death_tick - spawn_tick?
                    # Or did it have remaining bulletLife > 2 when deleted?
                    
                    # Let's check proximity to any enemy ship at moment of destruction
                    bx, by = ab["last_x"], ab["last_y"]
                    hit_enemy = False
                    for sx, sy, sf_id, srad in current_ships_pos:
                        if sf_id != ab["fleet_id"]: # enemy
                            dist = math.hypot(bx - sx, by - sy)
                            if dist < (srad + 30): # Hit radius
                                hit_enemy = True
                                break
                    
                    # Classification of death reason:
                    if not saw_at_spawn:
                        reason = "mid_flight_entry"
                    elif not shooter_survived and (observed_life_ticks < (init_max - 2 if init_max else 30)):
                        reason = "shooter_died"
                    elif hit_enemy and (observed_life_ticks < (init_max - 2 if init_max else 30)):
                        reason = "hit_collision"
                    elif (observed_life_ticks >= (init_max - 2 if init_max else 30)) and (observed_life_ticks <= (init_max + 3 if init_max else 75)):
                        reason = "expired_natural"
                    elif observed_life_ticks < (init_max - 3 if init_max else 30):
                        reason = "premature_unknown_or_hit"
                    else:
                        reason = "outlier_or_desync"

                    death_reasons[reason] += 1
                    ab["death_reason"] = reason
                    
                    # Confident full life criteria:
                    # - saw_at_spawn is True
                    # - shooter survived
                    # - explicitly deleted in deleted_ids OR expired naturally
                    # - death_reason == 'expired_natural'
                    if saw_at_spawn and shooter_survived and reason == "expired_natural":
                        ab["is_confident_full_life"] = True
                        N = ab["fleet_size_at_spawn"]
                        fleet_size_to_full_lifetimes[N].append(observed_life_ticks)
                        fleet_size_to_max_bullet_life[N].append(init_max)
                    else:
                        ab["is_confident_full_life"] = False

                    bullet_records.append(ab)

                active_fleets = current_fleets
                tick += 1
        except Exception:
            pass

print(f"\n=======================================================")
print(f"   BULLET LIFETIME EXPERIMENT RESULTS (All Recordings) ")
print(f"=======================================================")
print(f"Total Bullet Records Analyzed: {len(bullet_records)}")
print("\nDeath Reason Breakdown:")
for r, cnt in death_reasons.most_common():
    print(f"  {r:30s}: {cnt:6d} ({cnt/len(bullet_records)*100:.1f}%)")

print(f"\nTotal Confident Full-Lifetime Bullets: {sum(len(v) for v in fleet_size_to_full_lifetimes.values())}")

# Statistics by Fleet Size N
print("\n--- Empirical Bullet Lifetime vs Fleet Size N ---")
print(f"{'Fleet N':<8} | {'Count':<7} | {'Packet maxLife (ticks)':<22} | {'Observed Ticks (med/mean)':<25} | {'Measured ms':<15} | {'Packet ms':<12}")
print("-" * 105)

results_summary = {}

for N in sorted(fleet_size_to_full_lifetimes.keys()):
    obs = fleet_size_to_full_lifetimes[N]
    pkts = fleet_size_to_max_bullet_life[N]
    if len(obs) >= 10:
        med_obs = float(np.median(obs))
        mean_obs = float(np.mean(obs))
        std_obs = float(np.std(obs))
        med_pkt = float(np.median(pkts))
        mean_pkt = float(np.mean(pkts))
        
        # 1 tick = 40 ms
        meas_ms = mean_obs * 40.0
        pkt_ms = mean_pkt * 40.0
        
        results_summary[N] = {
            "count": len(obs),
            "median_ticks": med_obs,
            "mean_ticks": mean_obs,
            "std_ticks": std_obs,
            "median_packet_max_life": med_pkt,
            "mean_packet_max_life": mean_pkt,
            "measured_ms": meas_ms,
            "packet_ms": pkt_ms
        }
        
        print(f"{N:<8d} | {len(obs):<7d} | {med_pkt:5.1f} (mean {mean_pkt:5.2f})    | {med_obs:5.1f} / {mean_obs:5.2f} (±{std_obs:3.1f})   | {meas_ms:7.1f} ms     | {pkt_ms:7.1f} ms")

# Linear regression for packet maxBulletLife vs Fleet Size N
Ns = []
max_lifes = []
obs_lifes = []
for N, d in results_summary.items():
    if 1 <= N <= 35:
        Ns.append(N)
        max_lifes.append(d["mean_packet_max_life"])
        obs_lifes.append(d["mean_ticks"])

Ns = np.array(Ns)
max_lifes = np.array(max_lifes)
obs_lifes = np.array(obs_lifes)

if len(Ns) > 2:
    # Linear fit: max_life = slope * N + intercept
    p_pkt = np.polyfit(Ns, max_lifes, 1)
    p_obs = np.polyfit(Ns, obs_lifes, 1)
    
    print("\n--- Linear Regression Models ---")
    print(f"Packet maxBulletLife (ticks) = {p_pkt[0]:.4f} * N + {p_pkt[1]:.4f}")
    print(f"Packet maxBulletLife (ms)    = {p_pkt[0]*40.0:.2f} * N + {p_pkt[1]*40.0:.2f} ms")
    print(f"Observed Full Life (ticks)   = {p_obs[0]:.4f} * N + {p_obs[1]:.4f}")
    print(f"Observed Full Life (ms)      = {p_obs[0]*40.0:.2f} * N + {p_obs[1]*40.0:.2f} ms")

# Save detailed results to JSON
out_path = os.path.abspath("analysis/datasets/bullet_lifetime_experiment_results.json")
with open(out_path, "w") as f:
    json.dump({
        "death_reasons": dict(death_reasons),
        "fleet_size_results": results_summary,
        "regression_packet": {"slope_ticks": float(p_pkt[0]), "intercept_ticks": float(p_pkt[1]), "slope_ms": float(p_pkt[0]*40.0), "intercept_ms": float(p_pkt[1]*40.0)},
        "regression_observed": {"slope_ticks": float(p_obs[0]), "intercept_ticks": float(p_obs[1]), "slope_ms": float(p_obs[0]*40.0), "intercept_ms": float(p_obs[1]*40.0)}
    }, f, indent=2)

print(f"\n[+] Results saved to {out_path}")
