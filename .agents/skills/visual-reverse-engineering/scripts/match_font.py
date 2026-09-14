#!/usr/bin/env python3
"""
Automated font recognition and typography parameter optimizer.

Evaluates candidate fonts against a raster text region, optimizing font-size,
font-weight, letter-spacing, and baseline position using Chamfer distance
and glyph silhouette IoU.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
from scipy import ndimage


DEFAULT_FONT_CATALOG = [
    "Exo 2",
    "Arial",
    "Roboto",
    "Helvetica",
    "Trebuchet MS",
    "Segoe UI",
    "Montserrat",
    "Oswald",
    "Verdana",
    "Tahoma",
    "Impact",
    "sans-serif",
]


def extract_text_crop(
    image_path: Path,
    crop_box: Optional[List[int]] = None,
    alpha_threshold: int = 150,
    intensity_threshold: int = 150,
) -> Tuple[np.ndarray, Tuple[int, int], List[int]]:
    """
    Extracts the binary silhouette mask of the text region from the image.
    Returns (mask, (full_w, full_h), [min_x, min_y, max_x, max_y]).
    """
    with Image.open(image_path) as im:
        rgba = im.convert("RGBA")
        arr = np.array(rgba)

    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    intensity = np.mean(rgb, axis=2)

    mask = (alpha >= alpha_threshold) & (intensity >= intensity_threshold)

    if crop_box:
        x0, y0, x1, y1 = crop_box
        sub_mask = np.zeros_like(mask)
        sub_mask[y0 : y1 + 1, x0 : x1 + 1] = mask[y0 : y1 + 1, x0 : x1 + 1]
        mask = sub_mask

    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise ValueError(f"No text pixels detected above thresholds in {image_path}")

    bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    return mask, (w, h), bbox


def render_candidate_text(
    page: Any,
    text: str,
    font_family: str,
    font_weight: str | int,
    font_size: float,
    letter_spacing: float,
    cx: float,
    baseline_y: float,
    width: int,
    height: int,
) -> Tuple[np.ndarray, Optional[List[int]]]:
    """
    Renders candidate SVG text in Chromium and returns (mask, bbox).
    """
    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <text x="{cx:.2f}" y="{baseline_y:.2f}" fill="#ffffff"
        font-family="'{font_family}', sans-serif"
        font-weight="{font_weight}"
        font-size="{font_size:.2f}"
        text-anchor="middle"
        letter-spacing="{letter_spacing:.2f}">{text}</text>
</svg>"""

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>* {{ box-sizing: border-box; }} html, body {{ margin:0; padding:0; width:{width}px; height:{height}px; background:transparent; overflow:hidden; }} svg {{ display:block; width:{width}px; height:{height}px; }}</style></head>
<body>{svg_content}</body></html>"""

    page.set_content(html, wait_until="domcontentloaded")
    buf = page.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": width, "height": height})
    with Image.open(io.BytesIO(buf)) as im:
        cand_arr = np.array(im.convert("RGBA"))

    mask = cand_arr[:, :, 3] > 128
    ys, xs = np.where(mask)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) > 0 else None
    return mask, bbox


def compute_metrics(ref_mask: np.ndarray, cand_mask: np.ndarray) -> Tuple[float, float]:
    """
    Computes (IoU, Chamfer distance) between reference and candidate masks.
    """
    intersection = np.logical_and(ref_mask, cand_mask).sum()
    union = np.logical_or(ref_mask, cand_mask).sum()
    iou = float(intersection / union) if union > 0 else 0.0

    if np.any(ref_mask) and np.any(cand_mask):
        dt_ref = ndimage.distance_transform_edt(~ref_mask)
        dt_cand = ndimage.distance_transform_edt(~cand_mask)
        chamfer = float((np.mean(dt_ref[cand_mask]) + np.mean(dt_cand[ref_mask])) / 2.0)
    else:
        chamfer = 999.0

    return iou, chamfer


def fit_font_parameters(
    page: Any,
    ref_mask: np.ndarray,
    ref_bbox: List[int],
    text: str,
    font_family: str,
    font_weight: str | int,
    canvas_w: int,
    canvas_h: int,
) -> Dict[str, Any]:
    """
    Deterministically aligns size, spacing, and baseline to match reference bbox, then calculates metrics.
    """
    ref_w = ref_bbox[2] - ref_bbox[0] + 1
    ref_h = ref_bbox[3] - ref_bbox[1] + 1
    cx = (ref_bbox[0] + ref_bbox[2]) / 2.0
    baseline_y = float(ref_bbox[3])

    # 1. Calibrate font size to match target height
    best_fs = float(ref_h * 1.30)
    for fs_test in np.arange(best_fs - 2.0, best_fs + 2.5, 0.5):
        _, cand_box = render_candidate_text(page, text, font_family, font_weight, fs_test, 0.0, cx, baseline_y, canvas_w, canvas_h)
        if cand_box:
            h_cand = cand_box[3] - cand_box[1] + 1
            if abs(h_cand - ref_h) <= 1:
                best_fs = float(fs_test)
                break

    # 2. Calibrate letter spacing to match target width
    best_ls = 0.0
    for ls_test in np.arange(-0.6, 2.2, 0.2):
        _, cand_box = render_candidate_text(page, text, font_family, font_weight, best_fs, ls_test, cx, baseline_y, canvas_w, canvas_h)
        if cand_box:
            w_cand = cand_box[2] - cand_box[0] + 1
            if abs(w_cand - ref_w) <= 1:
                best_ls = float(ls_test)
                break

    # 3. Fine-tune baseline Y alignment
    best_by = baseline_y
    best_iou = -1.0
    best_chamfer = 999.0

    for by_delta in [-1.0, -0.5, 0.0, 0.5, 1.0]:
        cand_mask, _ = render_candidate_text(
            page, text, font_family, font_weight, best_fs, best_ls, cx, baseline_y + by_delta, canvas_w, canvas_h
        )
        iou, chamfer = compute_metrics(ref_mask, cand_mask)
        if iou > best_iou:
            best_iou = iou
            best_chamfer = chamfer
            best_by = baseline_y + by_delta

    return {
        "font_family": font_family,
        "font_weight": str(font_weight),
        "font_size": round(best_fs, 2),
        "letter_spacing": round(best_ls, 2),
        "baseline_y": round(best_by, 2),
        "iou": round(best_iou, 4),
        "chamfer_dist": round(best_chamfer, 3),
        "composite_score": round(best_iou * 100.0 - best_chamfer * 4.0, 2),
    }


def match_font(
    image_path: str | Path,
    text: str,
    crop_box: Optional[List[int]] = None,
    font_catalog: Optional[List[str]] = None,
    output_diff_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    """
    Matches the optimal font family, weight, and layout for the reference image text.
    """
    img_file = Path(image_path).resolve()
    ref_mask, (canvas_w, canvas_h), bbox = extract_text_crop(img_file, crop_box=crop_box)

    ref_w = bbox[2] - bbox[0] + 1
    ref_h = bbox[3] - bbox[1] + 1
    cx = (bbox[0] + bbox[2]) / 2.0

    catalog = font_catalog or DEFAULT_FONT_CATALOG
    weights = [700, 800, 900, "bold"]

    print(f"\n[match_font] Probing typography for text: '{text}'")
    print(f"  • Reference text bbox: [{bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}] ({ref_w}x{ref_h}px)")
    print(f"  • Center X: {cx:.1f}, Estimated Baseline Y: {bbox[3]}")
    print(f"  • Evaluating {len(catalog)} font families...")

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": canvas_w, "height": canvas_h})

        # Phase 1: Fast evaluation across catalog at bold/900 weight
        screen_scores = []
        for ff in catalog:
            res = fit_font_parameters(page, ref_mask, bbox, text, ff, 900, canvas_w, canvas_h)
            screen_scores.append(res)

        screen_scores.sort(key=lambda r: r["composite_score"], reverse=True)
        top_families = [r["font_family"] for r in screen_scores[:3]]

        # Phase 2: Refine weights on Top 3 font families
        for ff in top_families:
            for fw in weights:
                res = fit_font_parameters(page, ref_mask, bbox, text, ff, fw, canvas_w, canvas_h)
                results.append(res)

        results.sort(key=lambda r: r["composite_score"], reverse=True)
        best = results[0]

        # Optional visual artifact
        if output_diff_path:
            out_diff = Path(output_diff_path).resolve()
            out_diff.parent.mkdir(parents=True, exist_ok=True)

            best_mask, _ = render_candidate_text(
                page,
                text,
                best["font_family"],
                best["font_weight"],
                best["font_size"],
                best["letter_spacing"],
                cx,
                best["baseline_y"],
                canvas_w,
                canvas_h,
            )

            crop_pad = 8
            x0 = max(0, bbox[0] - crop_pad)
            y0 = max(0, bbox[1] - crop_pad)
            x1 = min(canvas_w, bbox[2] + crop_pad)
            y1 = min(canvas_h, bbox[3] + crop_pad)
            cw, ch = x1 - x0, y1 - y0

            ref_crop = ref_mask[y0:y1, x0:x1]
            cand_crop = best_mask[y0:y1, x0:x1]

            panel = Image.new("RGBA", (cw * 3 + 20, ch + 26), (15, 18, 25, 255))

            # Panel 1: Ref
            p1 = np.zeros((ch, cw, 4), dtype=np.uint8)
            p1[ref_crop] = [255, 255, 255, 255]
            panel.paste(Image.fromarray(p1), (0, 16))

            # Panel 2: Candidate
            p2 = np.zeros((ch, cw, 4), dtype=np.uint8)
            p2[cand_crop] = [0, 240, 255, 255]
            panel.paste(Image.fromarray(p2), (cw + 10, 16))

            # Panel 3: Overlay (Red=Ref, Green=Cand, White=Overlap)
            p3 = np.zeros((ch, cw, 4), dtype=np.uint8)
            p3[ref_crop, 0] = 255
            p3[cand_crop, 1] = 255
            p3[np.logical_and(ref_crop, cand_crop)] = [255, 255, 255, 255]
            p3[:, :, 3] = 255
            panel.paste(Image.fromarray(p3), (cw * 2 + 20, 16))

            panel.save(out_diff)

        browser.close()

    return {
        "text": text,
        "reference_bbox": bbox,
        "best_match": best,
        "top_candidates": results[:5],
    }


def format_cli_report(res: Dict[str, Any]) -> str:
    """Formats font matching results into clean CLI output."""
    b = res["best_match"]
    lines = [
        "===================================================================",
        f"         AUTOMATED FONT MATCH REPORT: '{res['text']}'",
        "===================================================================",
        f"  * Optimal Font:         '{b['font_family']}' (weight: {b['font_weight']})",
        f"  * Glyph Silhouette IoU: {b['iou'] * 100.0:.1f}%",
        f"  * Chamfer Distance:     {b['chamfer_dist']:.2f} px",
        f"  * Calibrated Font Size: {b['font_size']:.2f} px",
        f"  * Optimal Letter Space: {b['letter_spacing']:.2f} px",
        f"  * Baseline Alignment Y: {b['baseline_y']:.2f} px",
        "-------------------------------------------------------------------",
        "  Top 5 Ranked Font Candidates:",
        "  Rank | Font Family      | Weight | Silhouette IoU | Chamfer Error",
        "  -----+------------------+--------+----------------+--------------",
    ]
    for idx, c in enumerate(res["top_candidates"], 1):
        lines.append(
            f"   #{idx:<2d}| {c['font_family']:<16s} | {c['font_weight']:<6s} | {c['iou']*100.0:12.1f}% | {c['chamfer_dist']:10.2f} px"
        )
    lines.append("===================================================================")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Automated font recognition and typography parameter optimizer."
    )
    parser.add_argument("-i", "--input", required=True, help="Path to reference image")
    parser.add_argument("-t", "--text", required=True, help="Expected text string")
    parser.add_argument("-c", "--crop", default=None, help="Crop box: min_x,min_y,max_x,max_y")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--output-diff", default=None, help="Path to save visual glyph alignment artifact")

    args = parser.parse_args()

    crop_box = [int(v.strip()) for v in args.crop.split(",")] if args.crop else None

    try:
        results = match_font(
            args.input,
            args.text,
            crop_box=crop_box,
            output_diff_path=args.output_diff,
        )

        if args.json:
            print(json.dumps(results, indent=2))
        else:
            print(format_cli_report(results))

        return 0
    except Exception as exc:
        print(f"[match_font] Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
