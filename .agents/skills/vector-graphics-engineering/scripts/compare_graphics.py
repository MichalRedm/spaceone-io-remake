#!/usr/bin/env python3
"""
Graphic reverse-engineering and visual quality difference inspector.

Compares a candidate vector-rendered raster graphic against a target reference graphic.
Computes spatial alignment metrics (bounding box, centroid, alpha IoU), perceptual error (RMSE, PSNR),
and generates a 4-panel diagnostic visual comparison artifact for inspection.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def compute_alpha_bbox(arr: np.ndarray, alpha_threshold: int = 15) -> Optional[Tuple[int, int, int, int]]:
    """
    Computes (min_x, min_y, max_x, max_y) of pixels where alpha > alpha_threshold.
    Returns None if image is completely transparent.
    """
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > alpha_threshold)
    if len(xs) == 0 or len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def compute_alpha_centroid(arr: np.ndarray, alpha_threshold: int = 15) -> Optional[Tuple[float, float]]:
    """
    Computes weighted center of mass (cx, cy) based on alpha values.
    """
    alpha = arr[:, :, 3].astype(np.float64)
    alpha_mask = alpha > alpha_threshold
    weights = alpha * alpha_mask
    total_w = np.sum(weights)
    if total_w <= 0:
        return None

    h, w = arr.shape[:2]
    xs, ys = np.meshgrid(np.arange(w), np.arange(h))
    cx = float(np.sum(xs * weights) / total_w)
    cy = float(np.sum(ys * weights) / total_w)
    return cx, cy


def compare_images(
    reference_path: str | Path,
    candidate_path: str | Path,
    diff_image_output: Optional[str | Path] = None,
    alpha_threshold: int = 15,
) -> Dict[str, Any]:
    """
    Compares two images and computes quantitative alignment and color metrics.
    Optionally outputs a 4-panel diagnostic visual comparison artifact.
    """
    ref_file = Path(reference_path).resolve()
    cand_file = Path(candidate_path).resolve()

    if not ref_file.is_file():
        raise FileNotFoundError(f"Reference image not found: {ref_file}")
    if not cand_file.is_file():
        raise FileNotFoundError(f"Candidate image not found: {cand_file}")

    im_ref = Image.open(ref_file).convert("RGBA")
    im_cand = Image.open(cand_file).convert("RGBA")

    # Determine unified canvas bounds
    max_w = max(im_ref.width, im_cand.width)
    max_h = max(im_ref.height, im_cand.height)

    # Center images onto identical canvases
    canvas_ref = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))
    canvas_cand = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))

    pad_ref_x = (max_w - im_ref.width) // 2
    pad_ref_y = (max_h - im_ref.height) // 2
    canvas_ref.paste(im_ref, (pad_ref_x, pad_ref_y))

    pad_cand_x = (max_w - im_cand.width) // 2
    pad_cand_y = (max_h - im_cand.height) // 2
    canvas_cand.paste(im_cand, (pad_cand_x, pad_cand_y))

    arr_ref = np.array(canvas_ref, dtype=np.float32)
    arr_cand = np.array(canvas_cand, dtype=np.float32)

    # Normalize fully transparent pixels to prevent invisible background colors from distorting metrics
    arr_ref[arr_ref[:, :, 3] == 0, :3] = 0
    arr_cand[arr_cand[:, :, 3] == 0, :3] = 0

    # 1. Error Metrics (RMSE and PSNR across RGBA)
    diff = arr_ref - arr_cand
    mse = float(np.mean(diff ** 2))
    rmse = math.sqrt(mse)
    psnr = float(10 * math.log10((255.0 ** 2) / max(mse, 1e-10)))

    # 2. Alpha Channel IoU
    mask_ref = arr_ref[:, :, 3] > alpha_threshold
    mask_cand = arr_cand[:, :, 3] > alpha_threshold
    intersection = np.logical_and(mask_ref, mask_cand).sum()
    union = np.logical_or(mask_ref, mask_cand).sum()
    alpha_iou = float(intersection / union) if union > 0 else 1.0

    # 3. Spatial Bounding Box & Centroid
    bbox_ref = compute_alpha_bbox(arr_ref, alpha_threshold)
    bbox_cand = compute_alpha_bbox(arr_cand, alpha_threshold)
    cent_ref = compute_alpha_centroid(arr_ref, alpha_threshold)
    cent_cand = compute_alpha_centroid(arr_cand, alpha_threshold)

    bbox_w_ref = (bbox_ref[2] - bbox_ref[0] + 1) if bbox_ref else 0
    bbox_h_ref = (bbox_ref[3] - bbox_ref[1] + 1) if bbox_ref else 0
    bbox_w_cand = (bbox_cand[2] - bbox_cand[0] + 1) if bbox_cand else 0
    bbox_h_cand = (bbox_cand[3] - bbox_cand[1] + 1) if bbox_cand else 0

    delta_w = bbox_w_cand - bbox_w_ref
    delta_h = bbox_h_cand - bbox_h_ref

    delta_cx = (cent_cand[0] - cent_ref[0]) if (cent_ref and cent_cand) else 0.0
    delta_cy = (cent_cand[1] - cent_ref[1]) if (cent_ref and cent_cand) else 0.0

    # 4. Foreground Color Delta (overlap region)
    if intersection > 0:
        overlap_ref_rgb = arr_ref[:, :, :3][np.logical_and(mask_ref, mask_cand)]
        overlap_cand_rgb = arr_cand[:, :, :3][np.logical_and(mask_ref, mask_cand)]
        color_rmse = float(math.sqrt(np.mean((overlap_ref_rgb - overlap_cand_rgb) ** 2)))
    else:
        color_rmse = 255.0

    metrics: Dict[str, Any] = {
        "rmse": round(rmse, 2),
        "psnr_db": round(psnr, 2),
        "alpha_iou": round(alpha_iou, 4),
        "color_rmse": round(color_rmse, 2),
        "reference_dim": [im_ref.width, im_ref.height],
        "candidate_dim": [im_cand.width, im_cand.height],
        "reference_bbox": bbox_ref,
        "candidate_bbox": bbox_cand,
        "delta_bbox": [delta_w, delta_h],
        "delta_centroid": [round(delta_cx, 2), round(delta_cy, 2)],
    }

    # 5. Generate Diagnostic Visual Artifact if requested
    if diff_image_output:
        out_file = Path(diff_image_output).resolve()
        out_file.parent.mkdir(parents=True, exist_ok=True)

        # Difference Heatmap (absolute RGB + alpha diff, amplified)
        abs_rgb = np.abs(arr_ref[:, :, :3] - arr_cand[:, :, :3]).mean(axis=2)
        abs_alpha = np.abs(arr_ref[:, :, 3] - arr_cand[:, :, 3])
        diff_mag = (abs_rgb * 0.7 + abs_alpha * 0.3) / 255.0

        # Amplify differences to make subtle mismatches immediately noticeable
        norm_diff = np.clip(diff_mag * 3.5, 0.0, 1.0)
        heat = np.zeros((max_h, max_w, 4), dtype=np.uint8)
        heat[:, :, 0] = (norm_diff * 255).astype(np.uint8)  # Red channel
        heat[:, :, 1] = ((1.0 - np.abs(norm_diff - 0.5) * 2.0) * 230).astype(np.uint8)  # Green channel
        heat[:, :, 2] = ((1.0 - norm_diff) * 140).astype(np.uint8)  # Blue channel
        heat[:, :, 3] = (np.clip(norm_diff * 6.0, 0.0, 1.0) * 255).astype(np.uint8)  # Alpha
        heatmap_im = Image.fromarray(heat, "RGBA")

        # Alignment Edge Overlay: Target in Red/Blue, Candidate in Green
        overlay_arr = np.zeros((max_h, max_w, 3), dtype=np.uint8)
        overlay_arr[:, :, 0] = np.clip(arr_ref[:, :, 0] * (arr_ref[:, :, 3] / 255.0), 0, 255).astype(np.uint8)
        overlay_arr[:, :, 1] = np.clip(arr_cand[:, :, 1] * (arr_cand[:, :, 3] / 255.0), 0, 255).astype(np.uint8)
        overlay_arr[:, :, 2] = np.clip(arr_ref[:, :, 2] * (arr_ref[:, :, 3] / 255.0) * 0.5 + arr_cand[:, :, 2] * (arr_cand[:, :, 3] / 255.0) * 0.5, 0, 255).astype(np.uint8)
        overlay_im = Image.fromarray(overlay_arr, "RGB")

        # Build 4-panel strip on dark graphite background
        pad = 12
        header_h = 44
        panel_w = max_w
        panel_h = max_h
        strip_w = panel_w * 4 + pad * 5
        strip_h = panel_h + header_h + pad * 2

        diagnostic = Image.new("RGBA", (strip_w, strip_h), (18, 22, 28, 255))
        draw = ImageDraw.Draw(diagnostic)

        panels = [
            ("TARGET REFERENCE", canvas_ref, True),
            ("CANDIDATE RENDER", canvas_cand, True),
            ("DIFF HEATMAP", heatmap_im, True),
            ("ALIGNMENT OVERLAY (R:Ref, G:Cand)", overlay_im, False),
        ]

        for idx, (title, img, is_rgba) in enumerate(panels):
            x = pad + idx * (panel_w + pad)
            y = header_h + pad
            # Panel border
            draw.rectangle([x - 1, y - 1, x + panel_w, y + panel_h], outline=(50, 60, 75, 255), width=1)
            # Title
            draw.text((x + 4, pad), title, fill=(210, 220, 235, 255))
            # Image
            if is_rgba:
                diagnostic.paste(img, (x, y), img)
            else:
                diagnostic.paste(img, (x, y))

        diagnostic.save(out_file)
        metrics["diagnostic_image"] = str(out_file)

    return metrics


def format_report(metrics: Dict[str, Any]) -> str:
    """Formats metrics into an actionable diagnostic report for agents and developers."""
    lines = [
        "===================================================================",
        "         GRAPHIC REVERSE-ENGINEERING QUALITY AUDIT                ",
        "===================================================================",
        f"  * Global RMSE:        {metrics['rmse']:>8}  (Target: < 15.0 for close parity)",
        f"  * PSNR:               {metrics['psnr_db']:>8} dB (Higher is better, >30 dB is high)",
        f"  * Alpha Mask IoU:     {metrics['alpha_iou']:>8}  (Target: > 0.90 for identical bounds)",
        f"  * Overlap Color RMSE: {metrics['color_rmse']:>8}",
        "-------------------------------------------------------------------",
        f"  * Centroid Shift:     dx = {metrics['delta_centroid'][0]:+5.1f} px, dy = {metrics['delta_centroid'][1]:+5.1f} px",
        f"  * Bounding Box Delta: dw = {metrics['delta_bbox'][0]:+5d} px, dh = {metrics['delta_bbox'][1]:+5d} px",
        "-------------------------------------------------------------------",
    ]

    # Actionable guidance
    dx, dy = metrics["delta_centroid"]
    dw, dh = metrics["delta_bbox"]
    iou = metrics["alpha_iou"]

    tips = []
    if abs(dx) > 1.5 or abs(dy) > 1.5:
        dir_x = "right" if dx > 0 else "left"
        dir_y = "down" if dy > 0 else "up"
        tips.append(f"Position: Candidate is shifted {dir_x} by {abs(dx):.1f}px and {dir_y} by {abs(dy):.1f}px.")
    if abs(dw) > 3 or abs(dh) > 3:
        w_rel = "wider" if dw > 0 else "narrower"
        h_rel = "taller" if dh > 0 else "shorter"
        tips.append(f"Scale: Candidate is {w_rel} ({abs(dw)}px) and {h_rel} ({abs(dh)}px) than target.")
    if iou < 0.85:
        tips.append(f"Silhouette: Low IoU ({iou:.2f}). Check vector path contours or glow radius spread.")
    if metrics["color_rmse"] > 30.0:
        tips.append("Palette: Overlapping core colors deviate significantly. Verify stroke/fill hex codes.")

    if tips:
        lines.append("  Recommended Iterations:")
        for t in tips:
            lines.append(f"    - {t}")
    else:
        lines.append("  Visual Parity: EXCELLENT (within high-fidelity thresholds).")

    lines.append("===================================================================")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Graphic reverse-engineering quality difference inspector."
    )
    parser.add_argument("-r", "--reference", required=True, help="Reference target image (e.g. original asset)")
    parser.add_argument("-c", "--candidate", required=True, help="Candidate image (e.g. rendered vector SVG)")
    parser.add_argument("-o", "--output", default=None, help="Path to write 4-panel diagnostic visual comparison artifact")
    parser.add_argument("-j", "--json", default=None, help="Path to write raw metrics JSON")
    parser.add_argument("-t", "--threshold-rmse", type=float, default=None, help="Fail (exit 1) if RMSE exceeds this threshold")

    args = parser.parse_args()

    try:
        metrics = compare_images(
            reference_path=args.reference,
            candidate_path=args.candidate,
            diff_image_output=args.output,
        )

        print(format_report(metrics))

        if args.json:
            out_json = Path(args.json).resolve()
            out_json.parent.mkdir(parents=True, exist_ok=True)
            out_json.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

        if args.threshold_rmse is not None and metrics["rmse"] > args.threshold_rmse:
            print(f"[compare_graphics] RMSE {metrics['rmse']} exceeded threshold {args.threshold_rmse}", file=sys.stderr)
            return 1

        return 0
    except Exception as exc:
        print(f"[compare_graphics] Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
