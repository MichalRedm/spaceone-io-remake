#!/usr/bin/env python3
"""
Visual comparison, perceptual diff metric, and 5-panel diagnostic tooling.

Computes RMSE, PSNR, Alpha IoU, Core SSIM, Edge Contour IoU, centroid/bbox delta,
and outputs high-resolution diagnostic comparison artifacts with 8x zoom core insets.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, sobel


def compute_alpha_bbox(arr: np.ndarray, alpha_threshold: int = 15) -> Optional[Tuple[int, int, int, int]]:
    """Returns (min_x, min_y, max_x, max_y) for pixels exceeding alpha_threshold."""
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > alpha_threshold)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def compute_alpha_centroid(arr: np.ndarray, alpha_threshold: int = 15) -> Optional[Tuple[float, float]]:
    """Computes weighted center of mass (cx, cy) based on alpha values."""
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


def compute_ssim(img1: np.ndarray, img2: np.ndarray, mask: Optional[np.ndarray] = None) -> float:
    """
    Computes Structural Similarity Index (SSIM) across luminance channels.
    If mask is provided, computes SSIM localized to the masked region.
    """
    # Convert RGB/RGBA to luminance Y = 0.299 R + 0.587 G + 0.114 B
    y1 = 0.299 * img1[:, :, 0] + 0.587 * img1[:, :, 1] + 0.114 * img1[:, :, 2]
    y2 = 0.299 * img2[:, :, 0] + 0.587 * img2[:, :, 1] + 0.114 * img2[:, :, 2]

    c1 = (0.01 * 255.0) ** 2
    c2 = (0.03 * 255.0) ** 2

    mu1 = gaussian_filter(y1, 1.5)
    mu2 = gaussian_filter(y2, 1.5)
    mu1_sq = mu1 ** 2
    mu2_sq = mu2 ** 2
    mu1_mu2 = mu1 * mu2

    sigma1_sq = gaussian_filter(y1 ** 2, 1.5) - mu1_sq
    sigma2_sq = gaussian_filter(y2 ** 2, 1.5) - mu2_sq
    sigma12 = gaussian_filter(y1 * y2, 1.5) - mu1_mu2

    num = (2 * mu1_mu2 + c1) * (2 * sigma12 + c2)
    den = (mu1_sq + mu2_sq + c1) * (sigma1_sq + sigma2_sq + c2)
    ssim_map = num / np.maximum(den, 1e-10)

    if mask is not None and np.any(mask):
        return float(np.mean(ssim_map[mask]))
    return float(np.mean(ssim_map))


def compute_edge_iou(arr1: np.ndarray, arr2: np.ndarray, threshold: float = 30.0) -> float:
    """
    Computes IoU of Sobel gradient magnitudes to penalize rounded vs sharp corner discrepancies.
    """
    lum1 = np.mean(arr1[:, :, :3], axis=2) * (arr1[:, :, 3] / 255.0)
    lum2 = np.mean(arr2[:, :, :3], axis=2) * (arr2[:, :, 3] / 255.0)

    edge1 = np.hypot(sobel(lum1, axis=0), sobel(lum1, axis=1)) > threshold
    edge2 = np.hypot(sobel(lum2, axis=0), sobel(lum2, axis=1)) > threshold

    intersection = np.logical_and(edge1, edge2).sum()
    union = np.logical_or(edge1, edge2).sum()
    return float(intersection / union) if union > 0 else 1.0


def compare_images(
    reference_path: str | Path,
    candidate_path: str | Path,
    diff_image_output: Optional[str | Path] = None,
    alpha_threshold: int = 15,
) -> Dict[str, Any]:
    """
    Compares two images and computes quantitative alignment, structural, and color metrics.
    Optionally outputs an enhanced 5-panel diagnostic visual comparison artifact.
    """
    ref_file = Path(reference_path).resolve()
    cand_file = Path(candidate_path).resolve()

    if not ref_file.is_file():
        raise FileNotFoundError(f"Reference image not found: {ref_file}")
    if not cand_file.is_file():
        raise FileNotFoundError(f"Candidate image not found: {cand_file}")

    im_ref = Image.open(ref_file).convert("RGBA")
    im_cand = Image.open(cand_file).convert("RGBA")

    max_w = max(im_ref.width, im_cand.width)
    max_h = max(im_ref.height, im_cand.height)

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

    # 3. Core Silhouette IoU & Core SSIM
    core_ref = (arr_ref[:, :, 3] > 180) & (np.mean(arr_ref[:, :, :3], axis=2) > 180)
    core_cand = (arr_cand[:, :, 3] > 180) & (np.mean(arr_cand[:, :, :3], axis=2) > 180)
    core_inter = np.logical_and(core_ref, core_cand).sum()
    core_union = np.logical_or(core_ref, core_cand).sum()
    core_iou = float(core_inter / core_union) if core_union > 0 else 1.0

    core_ssim = compute_ssim(arr_ref, arr_cand, mask=np.logical_or(core_ref, core_cand))
    global_ssim = compute_ssim(arr_ref, arr_cand)
    edge_iou = compute_edge_iou(arr_ref, arr_cand)

    # 4. Spatial Bounding Box & Centroid
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

    # 5. Foreground Color Delta (overlap region)
    if intersection > 0:
        overlap_ref_rgb = arr_ref[:, :, :3][np.logical_and(mask_ref, mask_cand)]
        overlap_cand_rgb = arr_cand[:, :, :3][np.logical_and(mask_ref, mask_cand)]
        color_rmse = float(math.sqrt(np.mean((overlap_ref_rgb - overlap_cand_rgb) ** 2)))
    else:
        color_rmse = 255.0

    metrics = {
        "global_rmse": round(rmse, 2),
        "psnr_db": round(psnr, 2),
        "global_ssim": round(global_ssim, 4),
        "core_ssim": round(core_ssim, 4),
        "alpha_iou": round(alpha_iou, 4),
        "core_iou": round(core_iou, 4),
        "edge_iou": round(edge_iou, 4),
        "overlap_color_rmse": round(color_rmse, 2),
        "delta_cx_px": round(delta_cx, 2),
        "delta_cy_px": round(delta_cy, 2),
        "delta_w_px": delta_w,
        "delta_h_px": delta_h,
        "ref_dimensions": [im_ref.width, im_ref.height],
        "cand_dimensions": [im_cand.width, im_cand.height],
    }

    # Generate 5-panel diagnostic artifact
    if diff_image_output:
        out_path = Path(diff_image_output).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        generate_5panel_diagnostic(
            canvas_ref, canvas_cand, arr_ref, arr_cand, out_path, metrics, core_ref
        )

    return metrics


def generate_5panel_diagnostic(
    im_ref: Image.Image,
    im_cand: Image.Image,
    arr_ref: np.ndarray,
    arr_cand: np.ndarray,
    output_path: Path,
    metrics: Dict[str, Any],
    core_ref: np.ndarray,
) -> None:
    """
    Assembles a 5-panel diagnostic image:
    [ 1: Ref ] [ 2: Candidate ] [ 3: 8x Zoom Inset ] [ 4: Edge Diff Heatmap ] [ 5: Alignment Overlay ]
    """
    w, h = im_ref.size
    panel_gap = 10
    total_w = w * 5 + panel_gap * 4 + 40
    header_h = 50
    total_h = h + header_h + 30

    artifact = Image.new("RGBA", (total_w, total_h), (11, 15, 25, 255))
    draw = ImageDraw.Draw(artifact)

    # Panel 1: Target Reference
    p1 = Image.new("RGBA", (w, h), (18, 22, 32, 255))
    p1.paste(im_ref, (0, 0), im_ref)
    artifact.paste(p1, (20, header_h))

    # Panel 2: Candidate Render
    p2 = Image.new("RGBA", (w, h), (18, 22, 32, 255))
    p2.paste(im_cand, (0, 0), im_cand)
    artifact.paste(p2, (20 + w + panel_gap, header_h))

    # Panel 3: 8x Zoom Core Inset
    p3 = Image.new("RGBA", (w, h), (18, 22, 32, 255))
    if np.any(core_ref):
        cy_idx, cx_idx = np.where(core_ref)
        center_x, center_y = int(np.mean(cx_idx)), int(np.mean(cy_idx))
    else:
        center_x, center_y = w // 2, h // 2

    crop_r = min(w, h) // 8  # 32px box in 256x256
    x0, y0 = max(0, center_x - crop_r), max(0, center_y - crop_r)
    x1, y1 = min(w, center_x + crop_r), min(h, center_y + crop_r)

    zoom_ref = im_ref.crop((x0, y0, x1, y1)).resize((w // 2, h), Image.Resampling.NEAREST)
    zoom_cand = im_cand.crop((x0, y0, x1, y1)).resize((w // 2, h), Image.Resampling.NEAREST)
    p3.paste(zoom_ref, (0, 0), zoom_ref)
    p3.paste(zoom_cand, (w // 2, 0), zoom_cand)
    # Split line
    p3_draw = ImageDraw.Draw(p3)
    p3_draw.line([(w // 2, 0), (w // 2, h)], fill=(0, 240, 255, 255), width=2)
    artifact.paste(p3, (20 + (w + panel_gap) * 2, header_h))

    # Panel 4: Sobel Edge Difference Heatmap
    lum_ref = np.mean(arr_ref[:, :, :3], axis=2) * (arr_ref[:, :, 3] / 255.0)
    lum_cand = np.mean(arr_cand[:, :, :3], axis=2) * (arr_cand[:, :, 3] / 255.0)
    edge_ref = np.hypot(sobel(lum_ref, axis=0), sobel(lum_ref, axis=1))
    edge_cand = np.hypot(sobel(lum_cand, axis=0), sobel(lum_cand, axis=1))
    edge_diff = np.clip(np.abs(edge_ref - edge_cand) * 2.0, 0, 255).astype(np.uint8)

    p4_arr = np.zeros((h, w, 4), dtype=np.uint8)
    p4_arr[:, :, 0] = edge_diff  # Red channel represents edge discrepancy
    p4_arr[:, :, 1] = np.clip(255 - edge_diff, 0, 255)  # Green where edges match
    p4_arr[:, :, 3] = 255
    artifact.paste(Image.fromarray(p4_arr), (20 + (w + panel_gap) * 3, header_h))

    # Panel 5: Alignment Overlay (Red = Ref, Green = Cand, White = Overlap)
    p5_arr = np.zeros((h, w, 4), dtype=np.uint8)
    ref_alpha_norm = arr_ref[:, :, 3] / 255.0
    cand_alpha_norm = arr_cand[:, :, 3] / 255.0

    p5_arr[:, :, 0] = np.clip(ref_alpha_norm * 255, 0, 255).astype(np.uint8)
    p5_arr[:, :, 1] = np.clip(cand_alpha_norm * 255, 0, 255).astype(np.uint8)
    # White highlight where both have core content
    overlap_core = np.logical_and(arr_ref[:, :, 3] > 150, arr_cand[:, :, 3] > 150)
    p5_arr[overlap_core, 0] = 255
    p5_arr[overlap_core, 1] = 255
    p5_arr[overlap_core, 2] = 255
    p5_arr[:, :, 3] = 255
    artifact.paste(Image.fromarray(p5_arr), (20 + (w + panel_gap) * 4, header_h))

    # Add Titles
    titles = [
        "1. TARGET REFERENCE",
        "2. CANDIDATE RENDER",
        "3. 8x ZOOM INSET (Ref|Cand)",
        "4. SOBEL EDGE CONTOUR DIFF",
        "5. ALIGNMENT OVERLAY (R:Ref, G:Cand)",
    ]
    for idx, t in enumerate(titles):
        pos_x = 20 + idx * (w + panel_gap)
        draw.text((pos_x, 18), t, fill=(220, 230, 245, 255))

    artifact.save(output_path)


def format_report(m: Dict[str, Any]) -> str:
    """Formats comparison metrics into a structured report."""
    return f"""===================================================================
         GRAPHIC REVERSE-ENGINEERING QUALITY AUDIT                
===================================================================
  * Global PSNR:          {m['psnr_db']:6.2f} dB (Target: >= 30.0 dB)
  * Global RMSE:          {m['global_rmse']:6.2f}
  * Core SSIM:            {m['core_ssim']:6.4f}    (Target: >= 0.985 for indistinguishability)
  * Core Silhouette IoU:  {m['core_iou']:6.4f}    (Target: >= 0.960 for exact contour)
  * Edge Contour IoU:     {m['edge_iou']:6.4f}    (Target: >= 0.940 for sharp corners)
  * Overlap Color RMSE:   {m['overlap_color_rmse']:6.2f}
-------------------------------------------------------------------
  * Centroid Shift:     dx = {m['delta_cx_px']:5.1f} px, dy = {m['delta_cy_px']:5.1f} px
  * Bounding Box Delta: dw = {m['delta_w_px']:5d} px, dh = {m['delta_h_px']:5d} px
==================================================================="""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Visual comparison and 5-panel diagnostic tooling."
    )
    parser.add_argument("-r", "--reference", required=True, help="Target reference image")
    parser.add_argument("-c", "--candidate", required=True, help="Candidate render image")
    parser.add_argument("-o", "--output-diff", default=None, help="Save 5-panel diagnostic visual comparison artifact")
    parser.add_argument("--json", action="store_true", help="Print JSON metrics to stdout")

    args = parser.parse_args()
    try:
        metrics = compare_images(
            args.reference,
            args.candidate,
            diff_image_output=args.output_diff,
        )
        if args.json:
            import json
            print(json.dumps(metrics, indent=2))
        else:
            print(format_report(metrics))
        return 0
    except Exception as exc:
        print(f"[compare_graphics] Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
