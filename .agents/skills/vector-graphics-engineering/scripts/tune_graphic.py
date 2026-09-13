#!/usr/bin/env python3
"""
Automated vector graphic parameter tuner and loss optimizer.

Takes a parametric SVG template with named placeholders (e.g. {blur_radius}, {stroke_width}),
evaluates candidates against a reference target image using in-memory headless Chromium rendering,
and converges on optimal parameters via 1D/2D grid sweeps or SciPy multi-variable optimization.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
from scipy.optimize import minimize

from compare_graphics import compare_images, format_report


class GraphicTuner:
    """
    Manages in-memory Chromium page evaluation and loss calculation for parametric SVGs.
    """

    def __init__(
        self,
        template_svg: str,
        reference_arr: np.ndarray,
        width: int,
        height: int,
        metric: str = "combined",
        alpha_threshold: int = 15,
    ):
        self.template_svg = template_svg
        self.ref_arr = reference_arr
        self.width = width
        self.height = height
        self.metric = metric
        self.alpha_threshold = alpha_threshold
        self.eval_count = 0

    def calculate_loss(self, cand_arr: np.ndarray) -> float:
        """Computes loss between candidate and reference."""
        ref_clean = np.copy(self.ref_arr)
        cand_clean = np.copy(cand_arr)
        ref_clean[ref_clean[:, :, 3] == 0, :3] = 0
        cand_clean[cand_clean[:, :, 3] == 0, :3] = 0

        diff = ref_clean - cand_clean
        mse = float(np.mean(diff ** 2))
        rmse = math.sqrt(mse)

        if self.metric == "rmse":
            return rmse

        # Combined metric: RMSE + penalty for alpha silhouette mismatch
        mask_ref = self.ref_arr[:, :, 3] > self.alpha_threshold
        mask_cand = cand_arr[:, :, 3] > self.alpha_threshold
        intersection = np.logical_and(mask_ref, mask_cand).sum()
        union = np.logical_or(mask_ref, mask_cand).sum()
        alpha_iou = float(intersection / union) if union > 0 else 0.0

        # Loss balances color/glow RMSE with silhouette overlap
        loss = rmse + 60.0 * (1.0 - alpha_iou)
        return loss

    def render_candidate(self, page: Any, params: Dict[str, float]) -> Tuple[np.ndarray, str]:
        """Injects parameters into SVG template and captures in-memory PNG bytes."""
        try:
            svg_content = self.template_svg.format(**params)
        except KeyError as err:
            raise KeyError(f"Template placeholder {err} missing from parameters {list(params.keys())}")

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {{ box-sizing: border-box; }}
    html, body {{
      margin: 0; padding: 0;
      width: {self.width}px; height: {self.height}px;
      background: transparent; overflow: hidden;
    }}
    svg {{ display: block; width: {self.width}px; height: {self.height}px; }}
  </style>
</head>
<body>
{svg_content}
</body>
</html>"""

        page.set_content(html_content, wait_until="networkidle")
        png_bytes = page.screenshot(
            omit_background=True,
            clip={"x": 0, "y": 0, "width": self.width, "height": self.height},
        )
        with Image.open(io.BytesIO(png_bytes)) as im:
            cand_im = im.convert("RGBA")
            cand_arr = np.array(cand_im, dtype=np.float32)

        return cand_arr, svg_content


def run_sweep(
    tuner: GraphicTuner,
    page: Any,
    param_name: str,
    start: float,
    stop: float,
    step: float,
    fixed_params: Dict[str, float],
) -> Tuple[float, float, List[Tuple[float, float]]]:
    """Sweeps a single parameter across [start, stop] in increments of step."""
    values = np.arange(start, stop + step * 0.5, step)
    results: List[Tuple[float, float]] = []

    print(f"\n[tune_graphic] Sweeping '{param_name}' from {start} to {stop} (step {step})...")
    print(f"  {'Value':>10} | {'Loss':>10}")
    print(f"  {'-'*10}-+-{'-'*10}")

    for val in values:
        current_params = dict(fixed_params)
        current_params[param_name] = float(val)
        cand_arr, _ = tuner.render_candidate(page, current_params)
        loss = tuner.calculate_loss(cand_arr)
        results.append((float(val), loss))
        print(f"  {val:10.2f} | {loss:10.2f}")

    best_val, best_loss = min(results, key=lambda x: x[1])
    print(f"[tune_graphic] Optimal '{param_name}': {best_val:.2f} (Loss: {best_loss:.2f})")
    return best_val, best_loss, results


def run_optimization(
    tuner: GraphicTuner,
    page: Any,
    param_specs: Dict[str, Tuple[float, float, float]],  # name -> (init, min, max)
    fixed_params: Dict[str, float],
    max_iter: int = 50,
) -> Tuple[Dict[str, float], float]:
    """Runs multi-variable Nelder-Mead optimization over bounded parameters."""
    names = list(param_specs.keys())
    x0 = [param_specs[k][0] for k in names]
    bounds = [(param_specs[k][1], param_specs[k][2]) for k in names]

    print(f"\n[tune_graphic] Starting multi-variable optimization for: {names}")
    for k in names:
        init_v, min_v, max_v = param_specs[k]
        print(f"  • {k}: initial={init_v}, bounds=[{min_v}, {max_v}]")

    def objective(x: np.ndarray) -> float:
        # Penalize values outside bounds
        penalty = 0.0
        params = dict(fixed_params)
        for idx, k in enumerate(names):
            val = float(x[idx])
            min_b, max_b = bounds[idx]
            if val < min_b:
                penalty += (min_b - val) * 200.0
                val = min_b
            elif val > max_b:
                penalty += (val - max_b) * 200.0
                val = max_b
            params[k] = val

        cand_arr, _ = tuner.render_candidate(page, params)
        loss = tuner.calculate_loss(cand_arr) + penalty
        tuner.eval_count += 1
        return loss

    res = minimize(
        objective,
        x0=x0,
        method="Nelder-Mead",
        options={"maxiter": max_iter, "xatol": 0.25, "fatol": 0.25, "disp": False},
    )

    best_params = dict(fixed_params)
    for idx, k in enumerate(names):
        min_b, max_b = bounds[idx]
        best_params[k] = float(np.clip(res.x[idx], min_b, max_b))

    print(f"[tune_graphic] Optimization finished in {tuner.eval_count} evaluations.")
    for k in names:
        print(f"  * {k} = {best_params[k]:.2f}")
    print(f"  * Final Loss: {res.fun:.2f}")

    return best_params, float(res.fun)


def parse_param_arg(arg_str: str) -> Tuple[str, float, float, float]:
    """Parses 'name=init:min:max' or 'name=start:stop:step'."""
    match = re.match(r"^([a-zA-Z0-9_-]+)=([0-9.-]+):([0-9.-]+):([0-9.-]+)$", arg_str.strip())
    if not match:
        raise ValueError(f"Invalid parameter specification: '{arg_str}'. Expected format: name=val1:val2:val3")
    name = match.group(1)
    v1 = float(match.group(2))
    v2 = float(match.group(3))
    v3 = float(match.group(4))
    return name, v1, v2, v3


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Automated vector graphic parameter tuner and loss optimizer."
    )
    parser.add_argument("-t", "--template", required=True, help="Path to SVG template containing {param} placeholders")
    parser.add_argument("-r", "--reference", required=True, help="Target reference PNG image")
    parser.add_argument("-o", "--output-svg", default=None, help="Path to save SVG with optimized parameters")
    parser.add_argument("--output-png", default=None, help="Path to save rendered PNG with optimized parameters")
    parser.add_argument("--output-diff", default=None, help="Path to save 4-panel visual comparison diagnostic artifact")
    parser.add_argument("-s", "--sweep", action="append", default=[], help="Sweep parameter: param=start:stop:step (can be repeated)")
    parser.add_argument("-p", "--optimize", action="append", default=[], help="Optimize parameter: param=init:min:max (can be repeated)")
    parser.add_argument("-f", "--fixed", action="append", default=[], help="Fixed parameter: param=value (can be repeated)")
    parser.add_argument("-m", "--metric", choices=["combined", "rmse"], default="combined", help="Loss metric to minimize")
    parser.add_argument("--max-iter", type=int, default=40, help="Maximum optimization iterations (default: 40)")

    args = parser.parse_args()

    template_path = Path(args.template).resolve()
    ref_path = Path(args.reference).resolve()

    if not template_path.is_file():
        print(f"[tune_graphic] Template SVG not found: {template_path}", file=sys.stderr)
        return 1
    if not ref_path.is_file():
        print(f"[tune_graphic] Reference image not found: {ref_path}", file=sys.stderr)
        return 1

    template_str = template_path.read_text(encoding="utf-8")
    with Image.open(ref_path) as ref_im:
        ref_rgba = ref_im.convert("RGBA")
        ref_w, ref_h = ref_rgba.size
        ref_arr = np.array(ref_rgba, dtype=np.float32)

    fixed_params: Dict[str, Any] = {}
    for fix_str in args.fixed:
        if "=" in fix_str:
            k, v = fix_str.split("=", 1)
            v_clean = v.strip()
            try:
                fixed_params[k.strip()] = float(v_clean)
            except ValueError:
                fixed_params[k.strip()] = v_clean

    tuner = GraphicTuner(
        template_svg=template_str,
        reference_arr=ref_arr,
        width=ref_w,
        height=ref_h,
        metric=args.metric,
    )

    t0 = time.time()
    best_params = dict(fixed_params)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": ref_w, "height": ref_h})
        page = context.new_page()

        # Handle 1D sweeps
        for swp in args.sweep:
            name, start, stop, step = parse_param_arg(swp)
            opt_val, _, _ = run_sweep(tuner, page, name, start, stop, step, best_params)
            best_params[name] = opt_val

        # Handle multi-variable optimization
        if args.optimize:
            param_specs: Dict[str, Tuple[float, float, float]] = {}
            for opt_str in args.optimize:
                name, init_v, min_v, max_v = parse_param_arg(opt_str)
                param_specs[name] = (init_v, min_v, max_v)

            opt_params, _ = run_optimization(
                tuner,
                page,
                param_specs=param_specs,
                fixed_params=best_params,
                max_iter=args.max_iter,
            )
            best_params.update(opt_params)

        # Final render with best parameters
        print("\n[tune_graphic] Generating final output with optimal parameters...")
        cand_arr, final_svg = tuner.render_candidate(page, best_params)
        browser.close()

    elapsed = time.time() - t0
    print(f"[tune_graphic] Completed in {elapsed:.2f}s!")

    if args.output_svg:
        out_svg_path = Path(args.output_svg).resolve()
        out_svg_path.parent.mkdir(parents=True, exist_ok=True)
        out_svg_path.write_text(final_svg, encoding="utf-8")
        print(f"  * Saved optimal SVG: {out_svg_path}")

    if args.output_png:
        out_png_path = Path(args.output_png).resolve()
        out_png_path.parent.mkdir(parents=True, exist_ok=True)
        cand_im = Image.fromarray(cand_arr.astype(np.uint8), "RGBA")
        cand_im.save(out_png_path)
        print(f"  * Saved optimal PNG: {out_png_path}")

    if args.output_diff:
        # Create candidate file temporarily if needed
        temp_cand = ref_path.parent / ".temp_tuned_cand.png"
        cand_im = Image.fromarray(cand_arr.astype(np.uint8), "RGBA")
        cand_im.save(temp_cand)
        metrics = compare_images(ref_path, temp_cand, diff_image_output=args.output_diff)
        temp_cand.unlink(missing_ok=True)
        print(f"  * Saved visual diff diagnostic: {args.output_diff}")
        print(format_report(metrics))

    return 0


if __name__ == "__main__":
    sys.exit(main())
