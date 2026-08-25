#!/usr/bin/env python3
"""
Phase 1: Fit Mathematical Models to Empirical Bullet Lifetimes.

Evaluates Linear, Power Law, and Logarithmic regressions against empirical ground truth,
and generates the C# Hook.BulletLifeTable array code.
"""

import os
import sys
import json
import numpy as np
from scipy.optimize import curve_fit


def evaluate_and_generate(dataset_json: str = None):
    if dataset_json is None:
        dataset_json = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "../../../datasets/bullet_lifetime_experiment_results.json",
            )
        )

    with open(dataset_json, "r") as f:
        data = json.load(f)

    table = data["table_rows"]
    Ns = np.array([r["fleet_size"] for r in table if r["fleet_size"] <= 45])
    modes = np.array([r["maxBLife_mode_ticks"] for r in table if r["fleet_size"] <= 45])
    modes_ms = modes * 40.0

    # 1. Linear model
    p_lin = np.polyfit(Ns, modes_ms, 1)
    fit_lin = p_lin[1] + p_lin[0] * Ns
    rmse_lin = np.sqrt(np.mean((fit_lin - modes_ms) ** 2))

    # 2. Power law model: b + c * N^p
    def power_func(x, b, c, p):
        return b + c * (x**p)

    popt_pow, _ = curve_fit(power_func, Ns, modes_ms, p0=[-160, 1700, 0.16])
    fit_pow = power_func(Ns, *popt_pow)
    rmse_pow = np.sqrt(np.mean((fit_pow - modes_ms) ** 2))

    # 3. Logarithmic model: b + c * ln(N)
    def log_func(x, b, c):
        return b + c * np.log(x)

    popt_log, _ = curve_fit(log_func, Ns, modes_ms, p0=[1500, 400])
    fit_log = log_func(Ns, *popt_log)
    rmse_log = np.sqrt(np.mean((fit_log - modes_ms) ** 2))

    print("=================================================================")
    print("  MODEL FIT BENCHMARKS ON SPACEONE GROUND TRUTH (ms)")
    print("=================================================================")
    print(f"1. Linear (B={p_lin[1]:.1f}, M={p_lin[0]:.2f}):         RMSE = {rmse_lin:5.2f} ms")
    print(
        f"2. Power Law ({popt_pow[0]:.1f} + {popt_pow[1]:.1f} * N^{popt_pow[2]:.3f}): RMSE = {rmse_pow:5.2f} ms"
    )
    print(
        f"3. Logarithmic ({popt_log[0]:.1f} + {popt_log[1]:.1f} * ln(N)):  RMSE = {rmse_log:5.2f} ms"
    )

    # Generate exact C# Table
    mode_dict = {r["fleet_size"]: r["maxBLife_mode_ticks"] * 40 for r in table}

    def smooth_val(n):
        if n in mode_dict and mode_dict[n] > 0:
            return mode_dict[n]
        val_ms = popt_pow[0] + popt_pow[1] * (n ** popt_pow[2])
        ticks = int(round(val_ms / 40.0))
        return ticks * 40

    table_100 = [0] + [smooth_val(n) for n in range(1, 101)]

    print("\n--- Generated C# Hook.BulletLifeTable (0..100) ---")
    print("public int[] BulletLifeTable { get; set; } = new[] {")
    for chunk_start in range(0, 101, 10):
        chunk = table_100[chunk_start : chunk_start + 10]
        comment = f"// {chunk_start} - {min(chunk_start+9, 100)} size"
        line = ", ".join(f"{v}" for v in chunk) + ","
        print(f"    {line:<60} {comment}")
    print("};")


if __name__ == "__main__":
    evaluate_and_generate()
