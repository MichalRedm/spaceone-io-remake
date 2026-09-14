#!/usr/bin/env python3
"""
Automated human-indistinguishability validation gate.

Evaluates a candidate vector graphic against a ground-truth reference sprite
using deterministic perceptual thresholds (Core SSIM, Core IoU, Edge IoU,
Global PSNR, Centroid, Bbox, and Color Delta).

Exits with code 0 (PASS) ONLY when all criteria are satisfied.
Exits with code 1 (FAIL) if any threshold is violated.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from compare_graphics import compare_images, format_report
from render_svg import render_svg_to_png


# Quantitative thresholds defining human perceptual indistinguishability
DEFAULT_THRESHOLDS = {
    "core_ssim_min": 0.985,
    "core_iou_min": 0.960,
    "edge_iou_min": 0.940,
    "psnr_min_db": 30.0,
    "max_centroid_shift_px": 0.5,
    "max_bbox_delta_px": 2,
    "max_color_rmse": 8.0,
}


def evaluate_gate(metrics: Dict[str, Any], thresholds: Dict[str, float]) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Evaluates comparison metrics against strict human-indistinguishability thresholds.
    Returns (all_passed, criteria_results).
    """
    criteria = [
        {
            "name": "Core Structural Similarity (SSIM)",
            "value": metrics["core_ssim"],
            "target": f">= {thresholds['core_ssim_min']:.3f}",
            "passed": bool(metrics["core_ssim"] >= thresholds["core_ssim_min"]),
            "criticality": "HIGH (Shape / Typography)",
        },
        {
            "name": "Core Silhouette Mask IoU",
            "value": f"{metrics['core_iou'] * 100.0:.2f}%",
            "target": f">= {thresholds['core_iou_min'] * 100.0:.1f}%",
            "passed": bool(metrics["core_iou"] >= thresholds["core_iou_min"]),
            "criticality": "HIGH (Stroke / Corner Joins)",
        },
        {
            "name": "Sobel Edge Contour IoU",
            "value": f"{metrics['edge_iou'] * 100.0:.2f}%",
            "target": f">= {thresholds['edge_iou_min'] * 100.0:.1f}%",
            "passed": bool(metrics["edge_iou"] >= thresholds["edge_iou_min"]),
            "criticality": "HIGH (Sharp vs Rounded Edges)",
        },
        {
            "name": "Global Reconstruction PSNR",
            "value": f"{metrics['psnr_db']:.2f} dB",
            "target": f">= {thresholds['psnr_min_db']:.1f} dB",
            "passed": bool(metrics["psnr_db"] >= thresholds["psnr_min_db"]),
            "criticality": "MEDIUM (Overall Fidelity)",
        },
        {
            "name": "Centroid Drift (dx, dy)",
            "value": f"({metrics['delta_cx_px']:.2f}, {metrics['delta_cy_px']:.2f}) px",
            "target": f"<= {thresholds['max_centroid_shift_px']:.2f} px",
            "passed": bool(
                abs(metrics["delta_cx_px"]) <= thresholds["max_centroid_shift_px"]
                and abs(metrics["delta_cy_px"]) <= thresholds["max_centroid_shift_px"]
            ),
            "criticality": "MEDIUM (Spatial Alignment)",
        },
        {
            "name": "Bounding Box Delta (dw, dh)",
            "value": f"({metrics['delta_w_px']}, {metrics['delta_h_px']}) px",
            "target": f"<= {int(thresholds['max_bbox_delta_px'])} px",
            "passed": bool(
                abs(metrics["delta_w_px"]) <= thresholds["max_bbox_delta_px"]
                and abs(metrics["delta_h_px"]) <= thresholds["max_bbox_delta_px"]
            ),
            "criticality": "LOW (Glow Spread)",
        },
        {
            "name": "Foreground Color RMSE",
            "value": f"{metrics['overlap_color_rmse']:.2f}",
            "target": f"<= {thresholds['max_color_rmse']:.1f}",
            "passed": bool(metrics["overlap_color_rmse"] <= thresholds["max_color_rmse"]),
            "criticality": "HIGH (Color & Luminance)",
        },
    ]

    all_passed = all(c["passed"] for c in criteria)
    return all_passed, criteria


def format_gate_report(all_passed: bool, criteria: List[Dict[str, Any]], metrics: Dict[str, Any]) -> str:
    """Formats a deterministic gate report with pass/fail badges."""
    verdict = "[PASS] REPLICA IS HUMAN-INDISTINGUISHABLE" if all_passed else "[FAIL] REPLICA HAS PERCEPTIBLE DISCREPANCIES"
    border = "=" * 67

    lines = [
        border,
        f"         HUMAN INDISTINGUISHABILITY VERIFICATION GATE",
        border,
        f"  Overall Verdict: {verdict}",
        "-------------------------------------------------------------------",
        f"  {'Criterion':<32s} | {'Observed':<12s} | {'Target':<10s} | Status",
        "  " + "-" * 32 + "-+-" + "-" * 12 + "-+-" + "-" * 10 + "-+-------",
    ]

    for c in criteria:
        status = "[PASS]" if c["passed"] else "[FAIL]"
        val_str = str(c["value"])
        lines.append(f"  {c['name']:<32s} | {val_str:<12s} | {c['target']:<10s} | {status}")

    lines.append("-------------------------------------------------------------------")
    if all_passed:
        lines.append("  All rigorous perceptual criteria satisfied. Asset is ready for deployment.")
    else:
        failed_names = [c["name"] for c in criteria if not c["passed"]]
        lines.append("  STOP: Do NOT commit or conclude task until the following are fixed:")
        for fn in failed_names:
            lines.append(f"    • {fn}")
        lines.append("  Inspect the 5-panel diagnostic artifact (specifically 8x Zoom Inset and")
        lines.append("  Edge Contour Diff) to locate the exact geometric or lighting mismatch.")

    lines.append(border)
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Automated human-indistinguishability validation gate."
    )
    parser.add_argument("-r", "--reference", required=True, help="Path to ground-truth reference PNG")
    parser.add_argument("-c", "--candidate", default=None, help="Path to candidate PNG image")
    parser.add_argument("-s", "--svg", default=None, help="Path to candidate SVG file (auto-rasterized)")
    parser.add_argument("-o", "--output-diff", default=None, help="Save 5-panel diagnostic visual comparison artifact")
    parser.add_argument("--json", action="store_true", help="Output results as structured JSON")

    args = parser.parse_args()

    if not args.candidate and not args.svg:
        print("[verify_replica] Error: Must provide either --candidate PNG (-c) or --svg (-s).", file=sys.stderr)
        return 1

    ref_path = Path(args.reference).resolve()
    if not ref_path.is_file():
        print(f"[verify_replica] Reference file not found: {ref_path}", file=sys.stderr)
        return 1

    temp_png = None
    try:
        if args.svg:
            svg_path = Path(args.svg).resolve()
            if not svg_path.is_file():
                print(f"[verify_replica] SVG file not found: {svg_path}", file=sys.stderr)
                return 1
            # Render SVG to temporary PNG
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
                temp_png = Path(tf.name)
            render_svg_to_png(svg_path, temp_png)
            cand_path = temp_png
        else:
            cand_path = Path(args.candidate).resolve()
            if not cand_path.is_file():
                print(f"[verify_replica] Candidate file not found: {cand_path}", file=sys.stderr)
                return 1

        metrics = compare_images(ref_path, cand_path, diff_image_output=args.output_diff)
        all_passed, criteria = evaluate_gate(metrics, DEFAULT_THRESHOLDS)

        if args.json:
            result_payload = {
                "verdict": "PASS" if all_passed else "FAIL",
                "all_passed": all_passed,
                "metrics": metrics,
                "criteria": criteria,
            }
            print(json.dumps(result_payload, indent=2))
        else:
            print(format_gate_report(all_passed, criteria, metrics))

        return 0 if all_passed else 1

    finally:
        if temp_png and temp_png.is_file():
            temp_png.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
