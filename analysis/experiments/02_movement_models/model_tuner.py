#!/usr/bin/env python3
"""
Movement Model Tuner & Statistical Selection Pipeline for Spaceone.io.

Calibrates each candidate movement model in the Model Zoo against ground-truth training tracks,
and performs rigorous out-of-sample validation on unseen test tracks.
Computes Position RMSE, Velocity RMSE, Heading Error, AIC, and BIC to identify the exact physics mechanism.
"""

import os
import sys
import math
import json
import argparse
from typing import List, Dict, Any, Tuple
import numpy as np
from scipy.optimize import minimize

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.models.model_zoo import get_all_models, BaseMovementModel, wrap_angle


def evaluate_trajectory_metrics(
    model: BaseMovementModel,
    track: Dict[str, Any],
) -> Dict[str, float]:
    samples = track["samples"]
    n_samples = len(samples)
    if n_samples < 2:
        return {"pos_rmse": 0.0, "vel_rmse": 0.0, "heading_mae": 0.0, "speed_mae": 0.0}

    init_pos = np.array(samples[0]["pos"], dtype=np.float64)
    init_vel = np.array(samples[0]["vel"], dtype=np.float64)
    target_headings = np.array([s["heading"] for s in samples[:-1]], dtype=np.float64)

    true_positions = np.array([s["pos"] for s in samples], dtype=np.float64)
    true_velocities = np.array([s["vel"] for s in samples], dtype=np.float64)

    sim_positions, sim_velocities = model.simulate_trajectory(init_pos, init_vel, target_headings)

    # Position RMSE
    pos_diff = sim_positions - true_positions
    pos_rmse = float(np.sqrt(np.mean(np.sum(pos_diff**2, axis=1))))

    # Velocity RMSE
    vel_diff = sim_velocities - true_velocities
    vel_rmse = float(np.sqrt(np.mean(np.sum(vel_diff**2, axis=1))))

    # Heading Error & Speed Error
    heading_errors = []
    speed_errors = []
    for t in range(n_samples):
        sv = sim_velocities[t]
        tv = true_velocities[t]
        s_spd = math.hypot(sv[0], sv[1])
        t_spd = math.hypot(tv[0], tv[1])
        speed_errors.append(abs(s_spd - t_spd))

        if s_spd > 1e-3 and t_spd > 1e-3:
            s_ang = math.atan2(sv[1], sv[0])
            t_ang = math.atan2(tv[1], tv[0])
            heading_errors.append(abs(wrap_angle(s_ang - t_ang)))
        else:
            heading_errors.append(0.0)

    heading_mae = float(np.mean(heading_errors))
    speed_mae = float(np.mean(speed_errors))

    return {
        "pos_rmse": pos_rmse,
        "vel_rmse": vel_rmse,
        "heading_mae": heading_mae,
        "speed_mae": speed_mae,
    }


def compute_dataset_loss(
    param_values: List[float],
    model: BaseMovementModel,
    tracks: List[Dict[str, Any]],
    w_p: float = 1.0,
    w_v: float = 1.5,
    w_th: float = 2.0,
) -> float:
    model.set_params_from_array(param_values)
    losses = []
    for tr in tracks:
        m = evaluate_trajectory_metrics(model, tr)
        loss = w_p * m["pos_rmse"] + w_v * m["vel_rmse"] + w_th * m["heading_mae"]
        losses.append(loss)
    return float(np.mean(losses))


def tune_model(
    model: BaseMovementModel,
    train_tracks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    init_params = model.get_initial_params()
    bounds = model.param_bounds

    # Optimization using L-BFGS-B
    res = minimize(
        compute_dataset_loss,
        x0=init_params,
        args=(model, train_tracks),
        bounds=bounds,
        method="L-BFGS-B",
        options={"maxiter": 150, "ftol": 1e-6},
    )

    optimal_params = [float(x) for x in res.x]
    model.set_params_from_array(optimal_params)

    return {
        "optimal_params": {name: val for name, val in zip(model.param_names, optimal_params)},
        "train_loss": float(res.fun),
        "success": bool(res.success),
        "iterations": int(res.nit),
    }


def evaluate_model_on_dataset(
    model: BaseMovementModel,
    tracks: List[Dict[str, Any]],
) -> Dict[str, float]:
    pos_rmses = []
    vel_rmses = []
    heading_maes = []
    speed_maes = []

    total_samples = 0
    total_squared_pos_error = 0.0

    for tr in tracks:
        m = evaluate_trajectory_metrics(model, tr)
        pos_rmses.append(m["pos_rmse"])
        vel_rmses.append(m["vel_rmse"])
        heading_maes.append(m["heading_mae"])
        speed_maes.append(m["speed_mae"])

        n_pts = len(tr["samples"])
        total_samples += n_pts
        total_squared_pos_error += (m["pos_rmse"] ** 2) * n_pts

    mean_pos_rmse = float(np.mean(pos_rmses))
    mean_vel_rmse = float(np.mean(vel_rmses))
    mean_heading_mae = float(np.mean(heading_maes))
    mean_speed_mae = float(np.mean(speed_maes))

    # Overall Mean Squared Error for AIC/BIC
    overall_mse = total_squared_pos_error / max(1, total_samples)
    k = len(model.param_names)
    n = max(1, total_samples)

    aic = 2 * k + n * math.log(max(overall_mse, 1e-6))
    bic = k * math.log(n) + n * math.log(max(overall_mse, 1e-6))

    return {
        "pos_rmse": mean_pos_rmse,
        "vel_rmse": mean_vel_rmse,
        "heading_mae": mean_heading_mae,
        "speed_mae": mean_speed_mae,
        "aic": float(aic),
        "bic": float(bic),
        "total_test_samples": total_samples,
    }


def run_pipeline(
    dataset_path: str,
    output_json_path: str,
):
    with open(dataset_path, "r") as f:
        dataset = json.load(f)

    single_train = dataset["single_ship"]["train"]
    single_test = dataset["single_ship"]["test"]

    multi_train = dataset["multi_ship"]["train"][:50]  # Subsample for fast robust fitting
    multi_test = dataset["multi_ship"]["test"][:50]

    print(f"[*] Starting Movement Physics Model Zoo Benchmark...")
    print(f"    - Single Ship (N=1 Pure Physics): {len(single_train)} train tracks, {len(single_test)} test tracks")
    print(f"    - Multi Ship Centroids (N>=2): {len(multi_train)} train tracks, {len(multi_test)} test tracks")

    models = get_all_models()
    benchmark_results = []

    for model in models:
        print(f"\n=======================================================")
        print(f"[*] Calibrating Model: {model.name}")
        print(f"    Free Parameters: {model.param_names} | Bounds: {model.param_bounds}")

        # 1. Calibrate on Single Ship (N=1)
        tuning_info = tune_model(model, single_train)
        print(f"    [+] Calibrated Parameters: {tuning_info['optimal_params']}")

        # 2. Evaluate on Unseen Test Tracks (N=1)
        test_metrics_n1 = evaluate_model_on_dataset(model, single_test)
        print(f"    [+] Test (N=1)  -> Pos RMSE: {test_metrics_n1['pos_rmse']:6.2f} px | Vel RMSE: {test_metrics_n1['vel_rmse']:5.2f} px/t | Heading Err: {test_metrics_n1['heading_mae']:5.3f} rad | AIC: {test_metrics_n1['aic']:8.1f}")

        # 3. Evaluate on Multi-Ship Test Tracks (N>=2)
        test_metrics_multi = evaluate_model_on_dataset(model, multi_test)
        print(f"    [+] Test (N>=2) -> Pos RMSE: {test_metrics_multi['pos_rmse']:6.2f} px | Vel RMSE: {test_metrics_multi['vel_rmse']:5.2f} px/t | Heading Err: {test_metrics_multi['heading_mae']:5.3f} rad")

        benchmark_results.append({
            "model_name": model.name,
            "param_names": model.param_names,
            "calibrated_params": tuning_info["optimal_params"],
            "test_single_ship_n1": test_metrics_n1,
            "test_multi_ship": test_metrics_multi,
        })

    # Sort models by Test Position RMSE on Single Ship (N=1)
    benchmark_results.sort(key=lambda x: x["test_single_ship_n1"]["pos_rmse"])

    print("\n" + "=" * 95)
    print(f"{'RANK':<4} | {'MODEL NAME':<34} | {'POS RMSE (px)':<14} | {'VEL RMSE':<10} | {'HEADING ERR':<12} | {'AIC':<10}")
    print("=" * 95)
    for rank, res in enumerate(benchmark_results, start=1):
        m1 = res["test_single_ship_n1"]
        print(
            f"{rank:<4} | {res['model_name']:<34} | {m1['pos_rmse']:12.2f} px | "
            f"{m1['vel_rmse']:8.2f} | {m1['heading_mae']:10.3f} | {m1['aic']:10.1f}"
        )
    print("=" * 95)

    os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)
    with open(output_json_path, "w") as f:
        json.dump({"benchmark_results": benchmark_results}, f, indent=2)
    print(f"\n[+] Full benchmark results saved to {output_json_path}")


def main():
    parser = argparse.ArgumentParser(description="Run movement model tuning and statistical selection.")
    parser.add_argument(
        "--dataset",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../datasets/movement_physics_tracks.json")
        ),
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../datasets/movement_model_tuning_results.json")
        ),
    )
    args = parser.parse_args()
    run_pipeline(args.dataset, args.output)


if __name__ == "__main__":
    main()
