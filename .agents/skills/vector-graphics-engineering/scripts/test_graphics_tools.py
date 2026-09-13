#!/usr/bin/env python3
"""
Unit and integration tests for vector graphics engineering scripts:
- render_svg.py
- compare_graphics.py
- pack_spritesheet.py
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

# Import tools directly
from render_svg import render_svg_to_png
from compare_graphics import compare_images
from pack_spritesheet import pack_frames


SAMPLE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
      <feMerge>
        <feMergeNode in="blur1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <path d="M 32 80 L 64 32 L 96 80" fill="none" stroke="#00ffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neon-glow)" />
  <path d="M 32 80 L 64 32 L 96 80" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
</svg>"""

SAMPLE_SVG_ALT = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <path d="M 32 80 L 64 32 L 96 80" fill="none" stroke="#ff0000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
</svg>"""


class TestGraphicsTools(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="test_gfx_"))

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_render_svg(self):
        svg_file = self.temp_dir / "test_arrow.svg"
        svg_file.write_text(SAMPLE_SVG, encoding="utf-8")

        png_file = self.temp_dir / "test_arrow.png"
        res = render_svg_to_png(svg_file, png_file, width=128, height=128)

        self.assertTrue(png_file.is_file(), "Rendered PNG file should exist")
        with Image.open(png_file) as im:
            self.assertEqual(im.size, (128, 128), "PNG dimensions should match 128x128")
            self.assertEqual(im.mode, "RGBA", "PNG mode should be RGBA")

            # Check that alpha channel has both transparent and opaque pixels
            alpha = im.getchannel("A")
            min_a, max_a = alpha.getextrema()
            self.assertEqual(min_a, 0, "Background should have transparent pixels")
            self.assertGreater(max_a, 200, "Foreground should have opaque pixels")

    def test_compare_graphics_identity(self):
        svg_file = self.temp_dir / "test_arrow.svg"
        svg_file.write_text(SAMPLE_SVG, encoding="utf-8")

        png_file = self.temp_dir / "test_arrow.png"
        render_svg_to_png(svg_file, png_file, width=128, height=128)

        # Comparing an image to itself must yield RMSE == 0.0 and Alpha IoU == 1.0
        metrics = compare_images(png_file, png_file)
        self.assertEqual(metrics["rmse"], 0.0)
        self.assertAlmostEqual(metrics["alpha_iou"], 1.0, places=3)
        self.assertEqual(metrics["delta_bbox"], [0, 0])
        self.assertEqual(metrics["delta_centroid"], [0.0, 0.0])

    def test_compare_graphics_difference_and_diagnostic(self):
        svg1 = self.temp_dir / "test_arrow.svg"
        svg1.write_text(SAMPLE_SVG, encoding="utf-8")
        png1 = self.temp_dir / "test_arrow.png"
        render_svg_to_png(svg1, png1, width=128, height=128)

        svg2 = self.temp_dir / "test_alt.svg"
        svg2.write_text(SAMPLE_SVG_ALT, encoding="utf-8")
        png2 = self.temp_dir / "test_alt.png"
        render_svg_to_png(svg2, png2, width=128, height=128)

        diag_png = self.temp_dir / "diagnostic.png"
        metrics = compare_images(png1, png2, diff_image_output=diag_png)

        self.assertGreater(metrics["rmse"], 0.0, "Different images should have non-zero RMSE")
        self.assertTrue(diag_png.is_file(), "Diagnostic image should be generated")

        with Image.open(diag_png) as diag_im:
            self.assertGreater(diag_im.width, 128 * 4, "Diagnostic image should contain 4 panels")

    def test_pack_spritesheet(self):
        svg1 = self.temp_dir / "frame_0.svg"
        svg1.write_text(SAMPLE_SVG, encoding="utf-8")
        png1 = self.temp_dir / "frame_0.png"
        render_svg_to_png(svg1, png1, width=64, height=64)

        svg2 = self.temp_dir / "frame_1.svg"
        svg2.write_text(SAMPLE_SVG_ALT, encoding="utf-8")
        png2 = self.temp_dir / "frame_1.png"
        render_svg_to_png(svg2, png2, width=64, height=64)

        sheet_png = self.temp_dir / "spritesheet.png"
        meta_json = self.temp_dir / "spritesheet.json"

        pack_frames(
            frame_paths=[png1, png2],
            output_png_path=sheet_png,
            tile_width=64,
            tile_height=64,
            orientation="horizontal",
            metadata_json_path=meta_json,
        )

        self.assertTrue(meta_json.is_file(), "Metadata JSON should exist")

    def test_tune_graphic_sweep(self):
        from tune_graphic import GraphicTuner, run_sweep
        from playwright.sync_api import sync_playwright
        import numpy as np

        # Write and render ground truth target with blur_radius=4.0
        svg_truth = self.temp_dir / "truth.svg"
        svg_truth.write_text(SAMPLE_SVG, encoding="utf-8")
        png_truth = self.temp_dir / "truth.png"
        render_svg_to_png(svg_truth, png_truth, width=128, height=128)

        with Image.open(png_truth) as im:
            ref_arr = np.array(im.convert("RGBA"), dtype=np.float32)

        # Parametric template
        template = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="{blur:.2f}" result="blur1" />
      <feMerge>
        <feMergeNode in="blur1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <path d="M 32 80 L 64 32 L 96 80" fill="none" stroke="#00ffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" filter="url(#neon-glow)" />
  <path d="M 32 80 L 64 32 L 96 80" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
</svg>"""

        tuner = GraphicTuner(
            template_svg=template,
            reference_arr=ref_arr,
            width=128,
            height=128,
            metric="rmse",
        )

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 128, "height": 128})
            page = context.new_page()

            best_val, best_loss, results = run_sweep(
                tuner=tuner,
                page=page,
                param_name="blur",
                start=2.0,
                stop=6.0,
                step=2.0,
                fixed_params={},
            )
            browser.close()

        # In SAMPLE_SVG, stdDeviation was 4.0. The sweep [2.0, 4.0, 6.0] should find 4.0 as optimal
        self.assertAlmostEqual(best_val, 4.0, places=1)
        self.assertLess(best_loss, 5.0, "Loss at optimal blur should be close to 0")


if __name__ == "__main__":
    unittest.main()

