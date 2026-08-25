import json
import numpy as np

with open('analysis/datasets/bullet_lifetime_experiment_results.json') as f:
    data = json.load(f)

table = data['table_rows']
Ns = np.array([r['fleet_size'] for r in table if r['fleet_size'] <= 45])
modes = np.array([r['maxBLife_mode_ticks'] for r in table if r['fleet_size'] <= 45])
modes_ms = modes * 40.0

# 1. Current Remake: 1900 + 25 * N
curr_remake = 1900 + 25 * Ns
rmse_curr = np.sqrt(np.mean((curr_remake - modes_ms)**2))
mae_curr = np.mean(np.abs(curr_remake - modes_ms))

# 2. Optimal Linear Fit: B + M * N
p_lin = np.polyfit(Ns, modes_ms, 1)
fit_lin = p_lin[1] + p_lin[0] * Ns
rmse_lin = np.sqrt(np.mean((fit_lin - modes_ms)**2))
mae_lin = np.mean(np.abs(fit_lin - modes_ms))

# 3. Square root / Power fit: B + C * sqrt(N) or B + C * N^p
from scipy.optimize import curve_fit

def power_func(x, b, c, p):
    return b + c * (x ** p)

popt, _ = curve_fit(power_func, Ns, modes_ms, p0=[1400, 200, 0.5])
fit_pow = power_func(Ns, *popt)
rmse_pow = np.sqrt(np.mean((fit_pow - modes_ms)**2))
mae_pow = np.mean(np.abs(fit_pow - modes_ms))

# 4. Logarithmic fit: B + C * ln(N)
def log_func(x, b, c):
    return b + c * np.log(x)

popt_log, _ = curve_fit(log_func, Ns, modes_ms, p0=[1500, 400])
fit_log = log_func(Ns, *popt_log)
rmse_log = np.sqrt(np.mean((fit_log - modes_ms)**2))
mae_log = np.mean(np.abs(fit_log - modes_ms))

print("Model Comparison on Spaceone Ground Truth Lifetimes (ms):")
print(f"1. Current Remake (1900 + 25*N): RMSE = {rmse_curr:.2f} ms, MAE = {mae_curr:.2f} ms")
print(f"2. Optimal Linear (B={p_lin[1]:.1f}, M={p_lin[0]:.2f}): RMSE = {rmse_lin:.2f} ms, MAE = {mae_lin:.2f} ms")
print(f"3. Power Law ({popt[0]:.1f} + {popt[1]:.1f} * N^{popt[2]:.3f}): RMSE = {rmse_pow:.2f} ms, MAE = {mae_pow:.2f} ms")
print(f"4. Logarithmic ({popt_log[0]:.1f} + {popt_log[1]:.1f} * ln(N)): RMSE = {rmse_log:.2f} ms, MAE = {mae_log:.2f} ms")

print("\nDetailed breakdown for key fleet sizes (ms):")
print(f"{'N':<4} | {'Ground Truth':<12} | {'Current Remake':<15} | {'Opt Linear':<12} | {'Power Law':<12} | {'Logarithmic':<12}")
print("-" * 75)
for n, gt, cr, fl, fp, flg in zip(Ns, modes_ms, curr_remake, fit_lin, fit_pow, fit_log):
    if n in [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 45]:
        print(f"{n:<4d} | {gt:<12.1f} | {cr:<15.1f} | {fl:<12.1f} | {fp:<12.1f} | {flg:<12.1f}")
