#!/usr/bin/env python3
"""
Graphic-agnostic ground truth probe and structural analyzer.

Extracts dimensions, alpha masks, core vs glow segmentation, reflective/rotational
symmetries, connected components, radial glow falloff profiles, and typography detection.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def compute_bbox(mask: np.ndarray) -> Optional[List[int]]:
    """Returns [min_x, min_y, max_x, max_y] for non-zero entries in mask."""
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def compute_weighted_centroid(mask: np.ndarray, weights: np.ndarray) -> Optional[Tuple[float, float]]:
    """Calculates weighted center of mass (cx, cy)."""
    w = weights * mask
    total = np.sum(w)
    if total <= 0:
        return None
    h, width = mask.shape
    xs, ys = np.meshgrid(np.arange(width), np.arange(h))
    cx = float(np.sum(xs * w) / total)
    cy = float(np.sum(ys * w) / total)
    return cx, cy


def detect_symmetries(arr: np.ndarray, alpha_threshold: int = 20) -> Dict[str, Any]:
    """
    Tests for horizontal reflection, vertical reflection, and N-fold rotational symmetries.
    """
    alpha = arr[:, :, 3]
    mask = alpha > alpha_threshold
    if not np.any(mask):
        return {"horizontal_reflective": False, "vertical_reflective": False, "rotational_order": 1}

    # Horizontal flip (mirror along vertical center line)
    h_flipped = np.fliplr(alpha)
    h_mask = h_flipped > alpha_threshold
    h_iou = float(np.logical_and(mask, h_mask).sum() / max(np.logical_or(mask, h_mask).sum(), 1))

    # Vertical flip (mirror along horizontal center line)
    v_flipped = np.flipud(alpha)
    v_mask = v_flipped > alpha_threshold
    v_iou = float(np.logical_and(mask, v_mask).sum() / max(np.logical_or(mask, v_mask).sum(), 1))

    # Rotational symmetry orders to test: 2, 3, 4, 6, 8
    rotational_matches = []
    for order in [2, 3, 4, 5, 6, 8]:
        angle = 360.0 / order
        rotated = ndimage.rotate(alpha, angle, reshape=False, order=1)
        r_mask = rotated > alpha_threshold
        r_iou = float(np.logical_and(mask, r_mask).sum() / max(np.logical_or(mask, r_mask).sum(), 1))
        if r_iou >= 0.92:
            rotational_matches.append(order)

    best_rot = max(rotational_matches) if rotational_matches else 1

    return {
        "horizontal_reflective": bool(h_iou >= 0.90),
        "horizontal_iou": round(h_iou, 4),
        "vertical_reflective": bool(v_iou >= 0.90),
        "vertical_iou": round(v_iou, 4),
        "rotational_order": best_rot,
        "rotational_candidates": rotational_matches,
    }


def analyze_glow_profile(
    arr: np.ndarray,
    cx: float,
    cy: float,
    max_radius: int = 120,
) -> Dict[str, Any]:
    """
    Measures radial alpha intensity falloff I(r) from centroid to estimate Gaussian blur sigmas.
    """
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    y_coords, x_coords = np.ogrid[:h, :w]
    dist = np.sqrt((x_coords - cx) ** 2 + (y_coords - cy) ** 2)

    radial_profile = []
    sigmas_detected = []

    # Bin in 2px radial steps
    step = 2
    r_bins = np.arange(0, max_radius + step, step)
    for i in range(len(r_bins) - 1):
        r_inner, r_outer = r_bins[i], r_bins[i + 1]
        ring_mask = (dist >= r_inner) & (dist < r_outer)
        if np.any(ring_mask):
            mean_a = float(np.mean(alpha[ring_mask]))
            max_a = float(np.max(alpha[ring_mask]))
        else:
            mean_a, max_a = 0.0, 0.0
        radial_profile.append({"r": int((r_inner + r_outer) / 2), "mean_alpha": round(mean_a, 1), "max_alpha": round(max_a, 1)})

    # Estimate blur stages from alpha thresholds (falloff to 50%, 25%, 10%)
    max_alpha = max((p["max_alpha"] for p in radial_profile), default=255.0)
    if max_alpha > 0:
        for frac in [0.60, 0.35, 0.15, 0.05]:
            target_a = max_alpha * frac
            for p in radial_profile:
                if p["mean_alpha"] <= target_a and p["r"] > 5:
                    # Gaussian approximation: r ≈ 2.0 * sigma at 15% falloff
                    est_sigma = round(p["r"] / 2.0, 1)
                    if est_sigma not in sigmas_detected:
                        sigmas_detected.append(est_sigma)
                    break

    return {
        "radial_profile": radial_profile[:30],  # Sample up to 60px
        "estimated_blur_sigmas": sorted(sigmas_detected),
    }


def segment_components(
    arr: np.ndarray,
    core_alpha_threshold: int = 180,
    core_intensity_threshold: int = 180,
) -> List[Dict[str, Any]]:
    """
    Extracts connected components in the core foreground using ndimage.label.
    """
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    intensity = np.mean(rgb, axis=2)

    core_mask = (alpha >= core_alpha_threshold) & (intensity >= core_intensity_threshold)
    labeled, num_features = ndimage.label(core_mask)

    components = []
    slices = ndimage.find_objects(labeled)

    for idx, sl in enumerate(slices):
        if sl is None:
            continue
        comp_mask = labeled[sl] == (idx + 1)
        pixel_count = int(np.sum(comp_mask))
        if pixel_count < 10:  # Ignore isolated single-pixel noise
            continue

        min_y, max_y = sl[0].start, sl[0].stop - 1
        min_x, max_x = sl[1].start, sl[1].stop - 1
        w = max_x - min_x + 1
        h = max_y - min_y + 1

        components.append({
            "id": idx + 1,
            "bbox": [min_x, min_y, max_x, max_y],
            "width": w,
            "height": h,
            "pixels": pixel_count,
            "aspect_ratio": round(w / max(h, 1), 2),
        })

    # Sort components by vertical position
    components.sort(key=lambda c: c["bbox"][1])
    return components


def detect_typography(components: List[Dict[str, Any]], img_height: int) -> Optional[Dict[str, Any]]:
    """
    Identifies whether a subset of components forms a horizontal text band.
    """
    if len(components) < 2:
        # Check if a single component has text-like aspect ratio (w > 2.5 * h)
        for c in components:
            if c["aspect_ratio"] >= 2.5 and 8 <= c["height"] <= 40:
                return {
                    "detected": True,
                    "bbox": c["bbox"],
                    "width": c["width"],
                    "height": c["height"],
                    "estimated_cap_height": c["height"],
                    "baseline_y": c["bbox"][3],
                    "multi_glyph": False,
                }
        return None

    # Group components by overlapping vertical range
    candidate_glyphs = [c for c in components if 6 <= c["height"] <= 40 and c["aspect_ratio"] < 2.5]
    if len(candidate_glyphs) >= 2:
        # Check if they share similar vertical bounds
        median_h = float(np.median([c["height"] for c in candidate_glyphs]))
        aligned = [c for c in candidate_glyphs if abs(c["height"] - median_h) <= 4]
        if len(aligned) >= 3:
            min_x = min(c["bbox"][0] for c in aligned)
            min_y = min(c["bbox"][1] for c in aligned)
            max_x = max(c["bbox"][2] for c in aligned)
            max_y = max(c["bbox"][3] for c in aligned)
            return {
                "detected": True,
                "bbox": [min_x, min_y, max_x, max_y],
                "width": max_x - min_x + 1,
                "height": max_y - min_y + 1,
                "estimated_cap_height": int(round(median_h)),
                "baseline_y": max_y,
                "glyph_count": len(aligned),
                "multi_glyph": True,
            }

    return None


def probe_image(
    image_path: str | Path,
    output_probe_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    """
    Executes a complete structural, geometric, and color probe of a target image.
    """
    img_file = Path(image_path).resolve()
    if not img_file.is_file():
        raise FileNotFoundError(f"Image not found: {img_file}")

    with Image.open(img_file) as im:
        rgba = im.convert("RGBA")
        arr = np.array(rgba, dtype=np.float32)

    width, height = rgba.size
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]

    # 1. Bounds & Centroids
    alpha_mask = alpha > 15
    core_mask = (alpha > 180) & (np.mean(rgb, axis=2) > 180)
    halo_mask = (alpha > 15) & (alpha <= 180)

    total_bbox = compute_bbox(alpha_mask) or [0, 0, width - 1, height - 1]
    core_bbox = compute_bbox(core_mask)
    centroid = compute_weighted_centroid(alpha_mask, alpha) or (width / 2.0, height / 2.0)
    core_centroid = compute_weighted_centroid(core_mask, alpha) if np.any(core_mask) else centroid

    # 2. Color Palette Breakdown
    zero_alpha = alpha == 0
    bg_color = [int(np.median(rgb[zero_alpha, c])) for c in range(3)] if np.any(zero_alpha) else [0, 0, 0]

    core_rgb = [int(np.mean(rgb[core_mask, c])) for c in range(3)] if np.any(core_mask) else [255, 255, 255]
    halo_rgb = [int(np.mean(rgb[halo_mask, c])) for c in range(3)] if np.any(halo_mask) else [0, 0, 0]

    # Hex codes
    def to_hex(c_list: List[int]) -> str:
        return f"#{c_list[0]:02X}{c_list[1]:02X}{c_list[2]:02X}"

    # 3. Symmetry
    symmetry_data = detect_symmetries(arr)

    # 4. Glow Profile
    glow_data = analyze_glow_profile(arr, centroid[0], centroid[1])

    # 5. Connected Components
    components = segment_components(arr)

    # 6. Typography
    type_data = detect_typography(components, height)

    report = {
        "file": str(img_file.name),
        "canvas": {"width": width, "height": height},
        "bounds": {
            "full_alpha_bbox": total_bbox,
            "full_width": total_bbox[2] - total_bbox[0] + 1,
            "full_height": total_bbox[3] - total_bbox[1] + 1,
            "core_bbox": core_bbox,
            "core_width": (core_bbox[2] - core_bbox[0] + 1) if core_bbox else None,
            "core_height": (core_bbox[3] - core_bbox[1] + 1) if core_bbox else None,
        },
        "centroids": {
            "alpha_weighted": [round(centroid[0], 2), round(centroid[1], 2)],
            "core_weighted": [round(core_centroid[0], 2), round(core_centroid[1], 2)],
        },
        "palette": {
            "core_mean_rgb": core_rgb,
            "core_hex": to_hex(core_rgb),
            "glow_mean_rgb": halo_rgb,
            "glow_hex": to_hex(halo_rgb),
            "background_clear_rgb": bg_color,
            "background_clear_hex": to_hex(bg_color),
        },
        "symmetry": symmetry_data,
        "glow": glow_data,
        "components": components,
        "typography": type_data,
    }

    # Optional visual probe diagram
    if output_probe_path:
        out_probe = Path(output_probe_path).resolve()
        out_probe.parent.mkdir(parents=True, exist_ok=True)

        diag = rgba.copy()
        draw = ImageDraw.Draw(diag)

        # Draw full alpha bounding box (green)
        draw.rectangle(
            [total_bbox[0], total_bbox[1], total_bbox[2], total_bbox[3]],
            outline=(0, 255, 0, 200),
            width=1,
        )

        # Draw core bounding box (cyan)
        if core_bbox:
            draw.rectangle(
                [core_bbox[0], core_bbox[1], core_bbox[2], core_bbox[3]],
                outline=(0, 240, 255, 230),
                width=2,
            )

        # Draw component bounding boxes (magenta / yellow)
        for c in components:
            b = c["bbox"]
            is_text = type_data and type_data.get("bbox") and (b[1] >= type_data["bbox"][1] and b[3] <= type_data["bbox"][3])
            col = (255, 220, 0, 220) if is_text else (255, 0, 180, 220)
            draw.rectangle([b[0], b[1], b[2], b[3]], outline=col, width=1)

        # Draw centroid crosshair (+)
        cx_int, cy_int = int(round(core_centroid[0])), int(round(core_centroid[1]))
        draw.line([(cx_int - 8, cy_int), (cx_int + 8, cy_int)], fill=(255, 255, 255, 255), width=1)
        draw.line([(cx_int, cy_int - 8), (cx_int, cy_int + 8)], fill=(255, 255, 255, 255), width=1)

        diag.save(out_probe)

    return report


def format_cli_report(data: Dict[str, Any]) -> str:
    """Formats report data into clean, readable terminal output."""
    b = data["bounds"]
    c = data["centroids"]
    p = data["palette"]
    s = data["symmetry"]
    g = data["glow"]
    t = data["typography"]

    sym_str = []
    if s["horizontal_reflective"]:
        sym_str.append(f"Horizontal (IoU: {s['horizontal_iou']:.2f})")
    if s["vertical_reflective"]:
        sym_str.append(f"Vertical (IoU: {s['vertical_iou']:.2f})")
    if s["rotational_order"] > 1:
        sym_str.append(f"{s['rotational_order']}-fold Rotational")
    sym_desc = ", ".join(sym_str) if sym_str else "Asymmetric"

    sigmas_str = ", ".join(str(sig) for sig in g["estimated_blur_sigmas"]) or "None detected"

    type_desc = "None detected"
    if t and t.get("detected"):
        type_desc = f"Detected at y={t['baseline_y']} (Cap Height: ~{t['estimated_cap_height']}px, Span: {t['width']}px, Glyphs: {t.get('glyph_count', 1)})"

    return f"""===================================================================
         GROUND TRUTH GRAPHIC PROBE: {data['file']}
===================================================================
  * Canvas Dimensions:    {data['canvas']['width']} x {data['canvas']['height']} px
  * Full Alpha Silhouette: {b['full_width']} x {b['full_height']} px (bounds: {b['full_alpha_bbox']})
  * Core Foreground Box:  {b['core_width']} x {b['core_height']} px (bounds: {b['core_bbox']})
  * Alpha Centroid:       ({c['alpha_weighted'][0]}, {c['alpha_weighted'][1]})
  * Core Centroid:        ({c['core_weighted'][0]}, {c['core_weighted'][1]})
-------------------------------------------------------------------
  * Symmetry Properties:  {sym_desc}
  * Core Color Hex:       {p['core_hex']} (RGB: {p['core_mean_rgb']})
  * Glow Halo Hex:        {p['glow_hex']} (RGB: {p['glow_mean_rgb']})
  * Clear BG Value:       {p['background_clear_hex']} (RGB: {p['background_clear_rgb']})
  * Estimated Glow Blur:  sigmas = [{sigmas_str}]
-------------------------------------------------------------------
  * Components Detected:  {len(data['components'])} distinct core components
  * Typography:           {type_desc}
==================================================================="""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Graphic-agnostic ground truth probe and structural analyzer."
    )
    parser.add_argument("-i", "--input", required=True, help="Path to input reference PNG image")
    parser.add_argument("--json", action="store_true", help="Print structured JSON report to stdout")
    parser.add_argument("-o", "--output-json", default=None, help="Save structured JSON report to file")
    parser.add_argument("--output-probe", default=None, help="Save visual annotated probe diagram PNG")

    args = parser.parse_args()

    try:
        report = probe_image(args.input, output_probe_path=args.output_probe)

        if args.output_json:
            out_file = Path(args.output_json).resolve()
            out_file.parent.mkdir(parents=True, exist_ok=True)
            out_file.write_text(json.dumps(report, indent=2), encoding="utf-8")

        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(format_cli_report(report))

        return 0
    except Exception as exc:
        print(f"[probe_graphic] Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
