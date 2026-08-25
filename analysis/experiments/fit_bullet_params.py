import json
import numpy as np

with open('analysis/datasets/bullet_lifetime_experiment_results.json') as f:
    data = json.load(f)

table = data['table_rows']
Ns = [r['fleet_size'] for r in table if r['fleet_size'] <= 45]
modes = [r['maxBLife_mode_ticks'] for r in table if r['fleet_size'] <= 45]
modes_ms = [m * 40.0 for m in modes]

p = np.polyfit(Ns, modes_ms, 1)
print(f"Linear fit on dominant modes (ms): BulletLifeB={p[1]:.2f}, BulletLifeM={p[0]:.2f}")

p_ticks = np.polyfit(Ns, modes, 1)
print(f"Linear fit on dominant modes (ticks): Base={p_ticks[1]:.2f} ticks, Slope={p_ticks[0]:.2f} ticks/ship")

print("\nComparison table:")
print(f"{'N':<4} | {'Orig (ms)':<10} | {'Fit (ms)':<10} | {'Current Remake (ms)':<20} | {'Fit Diff':<10} | {'Remake Diff'}")
print("-" * 75)
for n, m in zip(Ns[:20], modes_ms[:20]):
    fit = p[1] + p[0] * n
    curr_remake = 1900 + 25 * n
    print(f"{n:<4d} | {m:<10.1f} | {fit:<10.1f} | {curr_remake:<20.1f} | {fit-m:<10.1f} | {curr_remake-m:5.1f}")
