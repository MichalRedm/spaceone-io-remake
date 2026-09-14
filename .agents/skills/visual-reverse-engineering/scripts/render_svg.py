#!/usr/bin/env python3
"""
Headless SVG-to-PNG rasterization utility using Playwright Chromium.

Supports arbitrary SVG filters (feGaussianBlur, feMerge, feColorMatrix, drop-shadows),
web fonts, precision clipping, alpha transparency, and resolution scaling.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Tuple
from playwright.sync_api import sync_playwright


def parse_svg_dimensions(svg_path: Path) -> Tuple[int, int]:
    """
    Extracts native width and height from SVG attributes or viewBox.
    Falls back to (512, 512) if dimensions cannot be determined.
    """
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()

        # Check viewBox first: 'min-x min-y width height'
        viewbox = root.get("viewBox")
        if viewbox:
            parts = [float(p) for p in re.split(r"[\s,]+", viewbox.strip()) if p]
            if len(parts) == 4:
                return int(round(parts[2])), int(round(parts[3]))

        # Check explicit width/height attributes
        width_str = root.get("width")
        height_str = root.get("height")
        if width_str and height_str:
            w = float(re.sub(r"[^\d.]", "", width_str))
            h = float(re.sub(r"[^\d.]", "", height_str))
            return int(round(w)), int(round(h))
    except Exception as exc:
        print(f"[render_svg] Warning: Failed to parse dimensions from {svg_path} ({exc}). Using default 512x512.", file=sys.stderr)

    return 512, 512


def render_svg_to_png(
    svg_path: str | Path,
    png_path: str | Path,
    width: Optional[int] = None,
    height: Optional[int] = None,
    scale: float = 1.0,
) -> Path:
    """
    Renders an SVG vector file to a transparent PNG file.

    :param svg_path: Path to the input .svg file.
    :param png_path: Path to write the output .png file.
    :param width: Target pixel width. If None, auto-detected from SVG.
    :param height: Target pixel height. If None, auto-detected from SVG.
    :param scale: Device pixel ratio / scale multiplier. Defaults to 1.0.
    :return: Resolved Path of the generated PNG file.
    """
    svg_file = Path(svg_path).resolve()
    if not svg_file.is_file():
        raise FileNotFoundError(f"SVG file does not exist: {svg_file}")

    png_file = Path(png_path).resolve()
    png_file.parent.mkdir(parents=True, exist_ok=True)

    native_w, native_h = parse_svg_dimensions(svg_file)
    target_w = width if width and width > 0 else native_w
    target_h = height if height and height > 0 else native_h

    # Read SVG markup
    svg_raw = svg_file.read_text(encoding="utf-8")

    # Construct clean, zero-margin HTML page containing SVG
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {{ box-sizing: border-box; }}
    html, body {{
      margin: 0;
      padding: 0;
      width: {target_w}px;
      height: {target_h}px;
      background: transparent;
      overflow: hidden;
    }}
    svg {{
      display: block;
      width: {target_w}px;
      height: {target_h}px;
    }}
  </style>
</head>
<body>
{svg_raw}
</body>
</html>"""

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(
            viewport={"width": target_w, "height": target_h},
            device_scale_factor=scale,
        )
        page = context.new_page()
        page.set_content(html_content, wait_until="networkidle")

        # Capture transparent screenshot of the viewport
        page.screenshot(
            path=str(png_file),
            omit_background=True,
            clip={"x": 0, "y": 0, "width": target_w, "height": target_h},
        )
        browser.close()

    print(f"[render_svg] Rendered: {svg_file.name} -> {png_file} ({target_w}x{target_h}, scale={scale})")
    return png_file


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Headless SVG to transparent PNG rasterizer using Playwright Chromium."
    )
    parser.add_argument("-i", "--input", required=True, help="Input SVG file path")
    parser.add_argument("-o", "--output", required=True, help="Output PNG file path")
    parser.add_argument("-w", "--width", type=int, default=None, help="Target pixel width (defaults to SVG width/viewBox)")
    parser.add_argument("-H", "--height", type=int, default=None, help="Target pixel height (defaults to SVG height/viewBox)")
    parser.add_argument("-s", "--scale", type=float, default=1.0, help="Resolution scale factor (default: 1.0)")

    args = parser.parse_args()
    try:
        render_svg_to_png(
            svg_path=args.input,
            png_path=args.output,
            width=args.width,
            height=args.height,
            scale=args.scale,
        )
        return 0
    except Exception as err:
        print(f"[render_svg] Error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
