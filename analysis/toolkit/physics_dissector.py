#!/usr/bin/env python3
"""
Physics Dissection & Diagnostic Toolkit for Spaceone.io.

Performs deep vector analysis on empirical telemetry tracks:
- Apparent acceleration & force vectors (longitudinal vs lateral decomposition)
- Turning curvature, turning rates, and speed dip profiles during sharp reversals
- Angle error vs steering torque / centripetal force
- Generates an interactive diagnostic HTML dashboard and quantitative metrics JSON
"""

import os
import sys
import math
import json
import argparse
from typing import List, Dict, Any, Tuple
import numpy as np

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))
from analysis.models.model_zoo import wrap_angle


def analyze_trajectory_vectors(samples: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Performs frame-by-frame vector analysis on a single continuous trajectory.
    """
    n = len(samples)
    if n < 3:
        return {}

    speeds = []
    vel_angles = []
    target_angles = []
    angle_errors = []
    acc_mags = []
    acc_longs = []
    acc_lats = []
    acc_targets = []
    turn_rates = []

    for i in range(n - 1):
        p0 = samples[i]
        p1 = samples[i + 1]

        v0 = np.array(p0["vel"], dtype=np.float64)
        v1 = np.array(p1["vel"], dtype=np.float64)
        u0 = np.array(p0["heading"], dtype=np.float64)

        # Normalize target heading just in case
        u0_len = math.hypot(u0[0], u0[1])
        if u0_len > 1e-6:
            u0 = u0 / u0_len

        s0 = math.hypot(v0[0], v0[1])
        speeds.append(s0)

        th_v0 = math.atan2(v0[1], v0[0]) if s0 > 1e-3 else math.atan2(u0[1], u0[0])
        th_u0 = math.atan2(u0[1], u0[0])
        err = wrap_angle(th_u0 - th_v0)

        vel_angles.append(th_v0)
        target_angles.append(th_u0)
        angle_errors.append(err)

        # Apparent acceleration per tick: a = v_{t+1} - v_t
        a = v1 - v0
        a_mag = math.hypot(a[0], a[1])
        acc_mags.append(a_mag)

        # Longitudinal & lateral decomposition relative to current velocity direction
        if s0 > 1e-3:
            v_hat = v0 / s0
            v_perp = np.array([-v_hat[1], v_hat[0]])
            a_long = float(np.dot(a, v_hat))
            a_lat = float(np.dot(a, v_perp))
        else:
            a_long = a_mag
            a_lat = 0.0

        acc_longs.append(a_long)
        acc_lats.append(a_lat)

        # Force component along target heading
        a_tgt = float(np.dot(a, u0))
        acc_targets.append(a_tgt)

        # Angular rate of change (rad/tick)
        s1 = math.hypot(v1[0], v1[1])
        if s0 > 1e-3 and s1 > 1e-3:
            th_v1 = math.atan2(v1[1], v1[0])
            d_th = wrap_angle(th_v1 - th_v0)
            turn_rates.append(d_th)
        else:
            turn_rates.append(0.0)

    return {
        "speeds": speeds,
        "angle_errors": angle_errors,
        "acc_mags": acc_mags,
        "acc_longs": acc_longs,
        "acc_lats": acc_lats,
        "acc_targets": acc_targets,
        "turn_rates": turn_rates,
    }


def analyze_dataset_dissection(
    dataset_json_path: str,
) -> Dict[str, Any]:
    with open(dataset_json_path, "r") as f:
        data = json.load(f)

    single_tracks = data.get("single_ship", {}).get("train", []) + data.get("single_ship", {}).get("test", [])
    multi_tracks = data.get("multi_ship", {}).get("train", []) + data.get("multi_ship", {}).get("test", [])

    print(f"[*] Dissecting {len(single_tracks)} single-ship and {len(multi_tracks)} multi-ship tracks...")

    def aggregate_tracks(tracks):
        all_speeds = []
        all_errs = []
        all_acc_mags = []
        all_acc_longs = []
        all_acc_lats = []
        all_acc_targets = []
        all_turn_rates = []

        turn_binned_speeds = {"0_30": [], "30_60": [], "60_120": [], "120_180": []}
        turn_binned_acc_lat = {"0_30": [], "30_60": [], "60_120": [], "120_180": []}

        for tr in tracks:
            res = analyze_trajectory_vectors(tr["samples"])
            if not res:
                continue

            all_speeds.extend(res["speeds"])
            all_errs.extend(res["angle_errors"])
            all_acc_mags.extend(res["acc_mags"])
            all_acc_longs.extend(res["acc_longs"])
            all_acc_lats.extend(res["acc_lats"])
            all_acc_targets.extend(res["acc_targets"])
            all_turn_rates.extend(res["turn_rates"])

            for s, err, a_lat in zip(res["speeds"], res["angle_errors"], res["acc_lats"]):
                deg = abs(math.degrees(err))
                if deg < 30:
                    turn_binned_speeds["0_30"].append(s)
                    turn_binned_acc_lat["0_30"].append(abs(a_lat))
                elif deg < 60:
                    turn_binned_speeds["30_60"].append(s)
                    turn_binned_acc_lat["30_60"].append(abs(a_lat))
                elif deg < 120:
                    turn_binned_speeds["60_120"].append(s)
                    turn_binned_acc_lat["60_120"].append(abs(a_lat))
                else:
                    turn_binned_speeds["120_180"].append(s)
                    turn_binned_acc_lat["120_180"].append(abs(a_lat))

        cruise_speeds = [s for s in all_speeds if s > 1.0]

        summary = {
            "sample_count": len(all_speeds),
            "speed": {
                "mean": float(np.mean(cruise_speeds)) if cruise_speeds else 0.0,
                "median": float(np.median(cruise_speeds)) if cruise_speeds else 0.0,
                "max": float(np.max(cruise_speeds)) if cruise_speeds else 0.0,
                "p95": float(np.percentile(cruise_speeds, 95)) if cruise_speeds else 0.0,
                "std": float(np.std(cruise_speeds)) if cruise_speeds else 0.0,
            },
            "apparent_acceleration": {
                "mean_mag": float(np.mean(all_acc_mags)) if all_acc_mags else 0.0,
                "max_mag": float(np.max(all_acc_mags)) if all_acc_mags else 0.0,
                "mean_long": float(np.mean(all_acc_longs)) if all_acc_longs else 0.0,
                "mean_lat": float(np.mean(np.abs(all_acc_lats))) if all_acc_lats else 0.0,
                "mean_target_acc": float(np.mean(all_acc_targets)) if all_acc_targets else 0.0,
            },
            "turn_dynamics": {
                "mean_turn_rate_rad_tick": float(np.mean(np.abs(all_turn_rates))) if all_turn_rates else 0.0,
                "max_turn_rate_rad_tick": float(np.max(np.abs(all_turn_rates))) if all_turn_rates else 0.0,
                "speed_by_turn_angle": {
                    k: float(np.mean(v)) if v else 0.0 for k, v in turn_binned_speeds.items()
                },
                "lateral_acc_by_turn_angle": {
                    k: float(np.mean(v)) if v else 0.0 for k, v in turn_binned_acc_lat.items()
                },
            },
            "raw_histograms": {
                "speed_hist": [float(x) for x in np.histogram(cruise_speeds, bins=20)[0]] if cruise_speeds else [],
                "speed_edges": [float(x) for x in np.histogram(cruise_speeds, bins=20)[1]] if cruise_speeds else [],
                "acc_hist": [float(x) for x in np.histogram(all_acc_mags, bins=20)[0]] if all_acc_mags else [],
                "acc_edges": [float(x) for x in np.histogram(all_acc_mags, bins=20)[1]] if all_acc_mags else [],
            },
        }
        return summary

    single_summary = aggregate_tracks(single_tracks)
    multi_summary = aggregate_tracks(multi_tracks)

    results = {
        "single_ship_n1": single_summary,
        "multi_ship_centroids": multi_summary,
    }
    return results


def generate_html_dashboard(results: Dict[str, Any], output_html: str):
    s1 = results["single_ship_n1"]
    sm = results["multi_ship_centroids"]

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Spaceone.io Physics Dissection & Kinematic Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 24px;
            background: #0d1117;
            color: #c9d1d9;
        }}
        h1, h2, h3 {{ color: #58a6ff; }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }}
        .card {{
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }}
        th, td {{
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #21262d;
        }}
        th {{ color: #8b949e; font-size: 0.85em; text-transform: uppercase; }}
        .highlight {{ color: #3fb950; font-weight: bold; }}
        .badge {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            background: #238636;
            color: #ffffff;
        }}
        canvas {{ max-height: 280px; }}
    </style>
</head>
<body>
    <h1>🛸 Spaceone.io Movement Physics Dissection Dashboard</h1>
    <p>Empirical kinematic analysis on ground-truth telemetry recordings (non-dashing flight segments).</p>

    <div class="grid">
        <!-- Card 1: Key Empirical Metrics -->
        <div class="card">
            <h2>📊 Key Kinematic Invariants</h2>
            <table>
                <tr>
                    <th>Metric</th>
                    <th>Single Ship (N=1 Pure)</th>
                    <th>Fleet Centroids (N&ge;2)</th>
                </tr>
                <tr>
                    <td>Median Cruise Speed</td>
                    <td class="highlight">{s1['speed']['median']:.2f} px/tick ({s1['speed']['median']*25:.1f} px/s)</td>
                    <td class="highlight">{sm['speed']['median']:.2f} px/tick ({sm['speed']['median']*25:.1f} px/s)</td>
                </tr>
                <tr>
                    <td>Mean Cruise Speed</td>
                    <td>{s1['speed']['mean']:.2f} px/tick</td>
                    <td>{sm['speed']['mean']:.2f} px/tick</td>
                </tr>
                <tr>
                    <td>Max Observed Speed</td>
                    <td>{s1['speed']['max']:.2f} px/tick</td>
                    <td>{sm['speed']['max']:.2f} px/tick</td>
                </tr>
                <tr>
                    <td>Mean Apparent Acceleration</td>
                    <td>{s1['apparent_acceleration']['mean_mag']:.2f} px/tick&sup2;</td>
                    <td>{sm['apparent_acceleration']['mean_mag']:.2f} px/tick&sup2;</td>
                </tr>
                <tr>
                    <td>Max Apparent Acceleration</td>
                    <td>{s1['apparent_acceleration']['max_mag']:.2f} px/tick&sup2;</td>
                    <td>{sm['apparent_acceleration']['max_mag']:.2f} px/tick&sup2;</td>
                </tr>
                <tr>
                    <td>Max Turn Rate</td>
                    <td>{s1['turn_dynamics']['max_turn_rate_rad_tick']:.3f} rad/tick ({math.degrees(s1['turn_dynamics']['max_turn_rate_rad_tick'])*25:.1f}&deg;/s)</td>
                    <td>{sm['turn_dynamics']['max_turn_rate_rad_tick']:.3f} rad/tick ({math.degrees(sm['turn_dynamics']['max_turn_rate_rad_tick'])*25:.1f}&deg;/s)</td>
                </tr>
            </table>
        </div>

        <!-- Card 2: Turn Dynamics & Speed Dip -->
        <div class="card">
            <h2>🔄 Turn Dynamics & Speed Dips</h2>
            <p>Compares cruise speed across steering angle deviation brackets (testing if momentum dips during turns):</p>
            <table>
                <tr>
                    <th>Steering Angle Deviation</th>
                    <th>Single Ship Speed</th>
                    <th>Centroid Speed</th>
                    <th>Mean Lateral Accel</th>
                </tr>
                <tr>
                    <td>Straight Flight (0&deg; - 30&deg;)</td>
                    <td>{s1['turn_dynamics']['speed_by_turn_angle']['0_30']:.2f} px/tick</td>
                    <td>{sm['turn_dynamics']['speed_by_turn_angle']['0_30']:.2f} px/tick</td>
                    <td>{s1['turn_dynamics']['lateral_acc_by_turn_angle']['0_30']:.2f} px/tick&sup2;</td>
                </tr>
                <tr>
                    <td>Gentle Turn (30&deg; - 60&deg;)</td>
                    <td>{s1['turn_dynamics']['speed_by_turn_angle']['30_60']:.2f} px/tick</td>
                    <td>{sm['turn_dynamics']['speed_by_turn_angle']['30_60']:.2f} px/tick</td>
                    <td>{s1['turn_dynamics']['lateral_acc_by_turn_angle']['30_60']:.2f} px/tick&sup2;</td>
                </tr>
                <tr>
                    <td>Hard Turn (60&deg; - 120&deg;)</td>
                    <td>{s1['turn_dynamics']['speed_by_turn_angle']['60_120']:.2f} px/tick</td>
                    <td>{sm['turn_dynamics']['speed_by_turn_angle']['60_120']:.2f} px/tick</td>
                    <td>{s1['turn_dynamics']['lateral_acc_by_turn_angle']['60_120']:.2f} px/tick&sup2;</td>
                </tr>
                <tr>
                    <td>Sharp U-Turn (120&deg; - 180&deg;)</td>
                    <td class="highlight">{s1['turn_dynamics']['speed_by_turn_angle']['120_180']:.2f} px/tick</td>
                    <td class="highlight">{sm['turn_dynamics']['speed_by_turn_angle']['120_180']:.2f} px/tick</td>
                    <td>{s1['turn_dynamics']['lateral_acc_by_turn_angle']['120_180']:.2f} px/tick&sup2;</td>
                </tr>
            </table>
        </div>

        <!-- Card 3: Speed Distribution Chart -->
        <div class="card">
            <h2>📈 Cruise Speed Distribution (Single Ship)</h2>
            <canvas id="speedChart"></canvas>
        </div>

        <!-- Card 4: Acceleration Magnitude Chart -->
        <div class="card">
            <h2>⚡ Apparent Acceleration Distribution</h2>
            <canvas id="accChart"></canvas>
        </div>
    </div>

    <script>
        const speedEdges = {json.dumps(s1['raw_histograms']['speed_edges'][:-1])};
        const speedHist = {json.dumps(s1['raw_histograms']['speed_hist'])};
        new Chart(document.getElementById('speedChart'), {{
            type: 'bar',
            data: {{
                labels: speedEdges.map(x => x.toFixed(1) + ' px/t'),
                datasets: [{{
                    label: 'Frame Count',
                    data: speedHist,
                    backgroundColor: '#58a6ff'
                }}]
            }},
            options: {{ responsive: true, plugins: {{ legend: {{ display: false }} }} }}
        }});

        const accEdges = {json.dumps(s1['raw_histograms']['acc_edges'][:-1])};
        const accHist = {json.dumps(s1['raw_histograms']['acc_hist'])};
        new Chart(document.getElementById('accChart'), {{
            type: 'bar',
            data: {{
                labels: accEdges.map(x => x.toFixed(2)),
                datasets: [{{
                    label: 'Frame Count',
                    data: accHist,
                    backgroundColor: '#3fb950'
                }}]
            }},
            options: {{ responsive: true, plugins: {{ legend: {{ display: false }} }} }}
        }});
    </script>
</body>
</html>
"""
    os.makedirs(os.path.dirname(os.path.abspath(output_html)), exist_ok=True)
    with open(output_html, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"[+] HTML Dashboard generated at {output_html}")


def main():
    parser = argparse.ArgumentParser(description="Dissect kinematics and apparent forces.")
    parser.add_argument(
        "--input",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../datasets/movement_physics_tracks.json")
        ),
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../datasets/movement_dissection_results.json")
        ),
    )
    parser.add_argument(
        "--output-html",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../datasets/physics_dissection_dashboard.html")
        ),
    )
    args = parser.parse_args()

    results = analyze_dataset_dissection(args.input)

    with open(args.output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[+] Dissection metrics saved to {args.output_json}")

    generate_html_dashboard(results, args.output_html)


if __name__ == "__main__":
    main()
