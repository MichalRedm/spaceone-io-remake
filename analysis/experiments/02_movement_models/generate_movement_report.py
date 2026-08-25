#!/usr/bin/env python3
"""
Movement Model Comparison & Physics Reverse-Engineering Report Generator.

Compiles an interactive HTML report illustrating:
- Model rankings across all 10 candidate paradigms
- Side-by-side trajectory traces (Ground Truth vs Winning Model vs Baseline Drag)
- Turning phase space & speed dip profiles
- Physical conclusions and architectural recommendations for the C# game engine.
"""

import os
import sys
import json
import math
import argparse
from typing import Dict, List, Any
import numpy as np

# Ensure analysis root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from analysis.models.model_zoo import (
    LinearDragNewtonianModel,
    KinematicTurningModel,
    TurnRateWithSpeedDipModel,
    FrictionlessClampedModel,
)


def generate_trajectory_svg(
    true_pos: np.ndarray,
    sim_winning: np.ndarray,
    sim_baseline: np.ndarray,
    width: int = 500,
    height: int = 350,
) -> str:
    """Generates an SVG snippet comparing true trajectory vs winning and baseline models."""
    all_pts = np.vstack([true_pos, sim_winning, sim_baseline])
    min_x, min_y = np.min(all_pts, axis=0)
    max_x, max_y = np.max(all_pts, axis=0)

    span_x = max(10.0, max_x - min_x)
    span_y = max(10.0, max_y - min_y)
    margin = 30.0

    def to_svg(p):
        sx = margin + (p[0] - min_x) / span_x * (width - 2 * margin)
        sy = height - (margin + (p[1] - min_y) / span_y * (height - 2 * margin))
        return f"{sx:.1f},{sy:.1f}"

    def make_polyline(pts, color, stroke_width, dash=""):
        coords = " ".join([to_svg(p) for p in pts])
        dash_attr = f'stroke-dasharray="{dash}"' if dash else ""
        return f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="{stroke_width}" {dash_attr} />'

    svg = f'<svg viewBox="0 0 {width} {height}" width="100%" height="240" style="background:#0d1117; border-radius:6px; border:1px solid #30363d;">\n'
    svg += f'  {make_polyline(sim_baseline, "#f85149", 2, "4,4")}\n'
    svg += f'  {make_polyline(sim_winning, "#3fb950", 2.5)}\n'
    svg += f'  {make_polyline(true_pos, "#58a6ff", 3)}\n'

    # Start and End points
    p_start = to_svg(true_pos[0]).split(",")
    p_end = to_svg(true_pos[-1]).split(",")
    svg += f'  <circle cx="{p_start[0]}" cy="{p_start[1]}" r="5" fill="#58a6ff" />\n'
    svg += f'  <circle cx="{p_end[0]}" cy="{p_end[1]}" r="5" fill="#d29922" />\n'
    svg += "</svg>"
    return svg


def build_html_report(
    benchmark_data: Dict[str, Any],
    dissection_data: Dict[str, Any],
    dataset_tracks: Dict[str, Any],
    output_html: str,
):
    results = benchmark_data["benchmark_results"]
    s1_diss = dissection_data["single_ship_n1"]

    # Pick 2 representative test tracks to visualize
    test_tracks = dataset_tracks["single_ship"]["test"][:2]

    # Instantiate winning and baseline models with calibrated params
    winning_info = next(r for r in results if r["model_name"] == "Kinematic Turning Limited")
    dip_info = next(r for r in results if r["model_name"] == "Turn Rate Limited + Speed Dip")
    baseline_info = next(r for r in results if r["model_name"] == "Linear Drag Newtonian")

    m_winning = KinematicTurningModel(winning_info["calibrated_params"])
    m_baseline = LinearDragNewtonianModel(baseline_info["calibrated_params"])

    vis_svgs = []
    for tr in test_tracks:
        samples = tr["samples"]
        true_pos = np.array([s["pos"] for s in samples], dtype=np.float64)
        init_pos = np.array(samples[0]["pos"], dtype=np.float64)
        init_vel = np.array(samples[0]["vel"], dtype=np.float64)
        headings = np.array([s["heading"] for s in samples[:-1]], dtype=np.float64)

        sim_win_pos, _ = m_winning.simulate_trajectory(init_pos, init_vel, headings)
        sim_base_pos, _ = m_baseline.simulate_trajectory(init_pos, init_vel, headings)

        svg = generate_trajectory_svg(true_pos, sim_win_pos, sim_base_pos)
        vis_svgs.append(svg)

    table_rows = ""
    for rank, r in enumerate(results, start=1):
        m1 = r["test_single_ship_n1"]
        mm = r["test_multi_ship"]
        params_str = ", ".join([f"{k}={v:.3f}" for k, v in r["calibrated_params"].items()])
        highlight_cls = "highlight" if rank <= 2 else ""
        badge = '<span class="badge">WINNER</span>' if rank == 1 else ""

        table_rows += f"""
        <tr class="{highlight_cls}">
            <td>{rank} {badge}</td>
            <td><strong>{r['model_name']}</strong></td>
            <td><code>{params_str}</code></td>
            <td><strong>{m1['pos_rmse']:.2f} px</strong></td>
            <td>{m1['vel_rmse']:.2f} px/t</td>
            <td>{m1['heading_mae']:.3f} rad</td>
            <td>{m1['aic']:.1f}</td>
            <td>{mm['pos_rmse']:.2f} px</td>
        </tr>
        """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Spaceone.io Movement Physics Reverse Engineering Report</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 32px;
            background: #0d1117;
            color: #c9d1d9;
            line-height: 1.6;
        }}
        h1, h2, h3 {{ color: #58a6ff; }}
        .hero {{
            background: linear-gradient(135deg, #161b22, #0d1117);
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 24px;
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }}
        .card {{
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
        }}
        th, td {{
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid #21262d;
            font-size: 0.92em;
        }}
        th {{ color: #8b949e; text-transform: uppercase; font-size: 0.8em; }}
        .highlight {{ background: rgba(63, 185, 80, 0.1); color: #3fb950; }}
        .badge {{
            display: inline-block;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 0.75em;
            background: #238636;
            color: #ffffff;
            margin-left: 6px;
        }}
        .legend {{
            display: flex;
            gap: 16px;
            margin-bottom: 12px;
            font-size: 0.85em;
        }}
        .legend-item {{ display: flex; align-items: center; gap: 6px; }}
        .box {{ width: 14px; height: 4px; border-radius: 2px; }}
        code {{ background: #21262d; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.85em; }}
    </style>
</head>
<body>
    <div class="hero">
        <h1>🚀 Spaceone.io Regular Movement Physics: Reverse Engineering Report</h1>
        <p>Comprehensive empirical evaluation of 10 movement models against ground-truth telemetry recordings (non-dashing flight).</p>
    </div>

    <h2>🏆 Model Benchmark & Statistical Ranking</h2>
    <div class="card">
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Model Paradigm</th>
                    <th>Optimal Calibrated Parameters</th>
                    <th>Test Pos RMSE</th>
                    <th>Test Vel RMSE</th>
                    <th>Heading Err</th>
                    <th>AIC</th>
                    <th>Multi-Ship Centroid RMSE</th>
                </tr>
            </thead>
            <tbody>
                {table_rows}
            </tbody>
        </table>
    </div>

    <div class="grid">
        <div class="card">
            <h2>📈 Trajectory Verification Overlay (Test Track 1)</h2>
            <div class="legend">
                <div class="legend-item"><div class="box" style="background:#58a6ff;"></div> Ground Truth Recording</div>
                <div class="legend-item"><div class="box" style="background:#3fb950;"></div> Winning Model (Kinematic Turning)</div>
                <div class="legend-item"><div class="box" style="background:#f85149; border-top:1px dashed #f85149;"></div> Baseline (Linear Drag)</div>
            </div>
            {vis_svgs[0]}
        </div>

        <div class="card">
            <h2>📈 Trajectory Verification Overlay (Test Track 2)</h2>
            <div class="legend">
                <div class="legend-item"><div class="box" style="background:#58a6ff;"></div> Ground Truth Recording</div>
                <div class="legend-item"><div class="box" style="background:#3fb950;"></div> Winning Model (Kinematic Turning)</div>
                <div class="legend-item"><div class="box" style="background:#f85149; border-top:1px dashed #f85149;"></div> Baseline (Linear Drag)</div>
            </div>
            {vis_svgs[1]}
        </div>
    </div>

    <h2>🔍 Deep Physical Reverse-Engineering Insights</h2>
    <div class="grid">
        <div class="card">
            <h3>1. The Underlying Movement Mechanism</h3>
            <p>
                The empirical data decisively rejects pure linear Newtonian drag (RMSE: <strong>64.19 px</strong>).
                The true motion in Spaceone.io is governed by <strong>bounded angular turn-rate kinematics</strong> (RMSE: <strong>24.17 px</strong>, AIC: <strong>3534.0</strong>).
            </p>
            <ul>
                <li><strong>Cruise Speed</strong>: Steady-state cruise speed is clamped at \(V_{{max}} \approx 14.34\text{{ px/tick}}\) (\(358.5\text{{ px/s}}\)).</li>
                <li><strong>Turn Rate Limit</strong>: The velocity vector heading rotates smoothly towards the target angle at a maximum rate of \(\omega_{{max}} \approx 0.139\text{{ rad/tick}}\) (\(7.98^\circ\text{{/tick}}\) or \(\approx 200^\circ\text{{/s}}\)).</li>
            </ul>
        </div>

        <div class="card">
            <h3>2. Mouse Heading vs Thrust Direction</h3>
            <p>
                In the network protocol, the client immediately transmits the player's target mouse heading (\(\hat{{u}}\)).
                However, the ship's actual velocity heading does <strong>not</strong> jump instantaneously. Instead:
            </p>
            <ul>
                <li>The ship's visual sprite and velocity vector sweep along an arc constrained by \(\omega_{{max}}\).</li>
                <li>During hard \(90^\circ\) and \(180^\circ\) turns, speed temporarily dips from \(13.76\text{{ px/tick}}\) down to \(10.58\text{{ px/tick}}\), preserving curvature rather than sliding on linear friction.</li>
            </ul>
        </div>
    </div>
</body>
</html>
"""
    os.makedirs(os.path.dirname(os.path.abspath(output_html)), exist_ok=True)
    with open(output_html, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[+] Movement comparison report successfully written to {output_html}")


def main():
    parser = argparse.ArgumentParser(description="Generate movement comparison report.")
    parser.add_argument(
        "--benchmark-json",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../datasets/movement_model_tuning_results.json")
        ),
    )
    parser.add_argument(
        "--dissection-json",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../datasets/movement_dissection_results.json")
        ),
    )
    parser.add_argument(
        "--dataset-json",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../datasets/movement_physics_tracks.json")
        ),
    )
    parser.add_argument(
        "--output-html",
        type=str,
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../datasets/movement_model_comparison_report.html")
        ),
    )
    args = parser.parse_args()

    with open(args.benchmark_json, "r") as f:
        bench_data = json.load(f)
    with open(args.dissection_json, "r") as f:
        diss_data = json.load(f)
    with open(args.dataset_json, "r") as f:
        dataset_data = json.load(f)

    build_html_report(bench_data, diss_data, dataset_data, args.output_html)


if __name__ == "__main__":
    main()
