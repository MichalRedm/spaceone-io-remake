import json
import numpy as np

with open('analysis/datasets/bullet_lifetime_experiment_results.json') as f:
    data = json.load(f)

table = data['table_rows']
mode_dict = {r['fleet_size']: r['maxBLife_mode_ticks'] * 40 for r in table}

# Fit Power Law:
# (-166.2 + 1716.1 * N^0.158)
def smooth_val(n):
    if n in mode_dict and mode_dict[n] > 0:
        return mode_dict[n]
    # Power law in ticks rounded to nearest tick * 40ms
    val_ms = -166.2 + 1716.1 * (n ** 0.158)
    ticks = int(round(val_ms / 40.0))
    return ticks * 40

# Generate table for 0..100
bullet_life_table = [0] # 0 size
for n in range(1, 101):
    bullet_life_table.append(smooth_val(n))

print("Empirical BulletLife array for Hook.cs:")
print("int[] BulletLife = new[] {")
for chunk_start in range(0, 101, 10):
    chunk = bullet_life_table[chunk_start:chunk_start+10]
    comment = f"// {chunk_start} - {min(chunk_start+9, 100)} size"
    line = ", ".join(f"{v}" for v in chunk) + ","
    print(f"    {line:<60} {comment}")
print("};")
