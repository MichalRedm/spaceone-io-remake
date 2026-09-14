#!/usr/bin/env python3
"""
Unit test suite for visual reverse-engineering tooling.

Tests:
- probe_graphic (symmetries, bounding box, radial profile, core segmentation)
- compare_graphics (zero-alpha normalization, SSIM, IoU, centroid/bbox deltas)
- verify_replica (indistinguishability thresholds, pass/fail gating)
- match_font (chamfer distance, silhouette IoU)
- render_svg (Playwright headless rasterization)
- tune_graphic (multi-objective loss calculation)
"""

import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from compare_graphics import (
    compare_images,
    compute_alpha_bbox,
    compute_alpha_centroid,
    compute_edge_iou,
    compute_ssim,
)
from match_font import compute_metrics, render_candidate_text
from probe_graphic import (
    analyze_glow_profile,
    detect_symmetries,
    probe_image,
    segment_components,
)
from render_svg import render_svg_to_png
from tune_graphic import GraphicTuner
from verify_replica import (
    DEFAULT_THRESHOLDS,
    evaluate_gate,
)


class TestVisualReverseEngineeringTools(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_probe_graphic_symmetries_and_core(self):
        """Tests symmetry detection, core segmentation, and glow profiling on synthetic target."""
        # Create a 100x100 symmetric circle with intense core and diffuse halo
        arr = np.zeros((100, 100, 4), dtype=np.uint8)
        y, x = np.ogrid[:100, :100]
        dist_from_center = np.sqrt((x - 50) ** 2 + (y - 50) ** 2)

        # Core: dist <= 15, Bright white, high alpha
        core_mask = dist_from_center <= 15
        arr[core_mask] = [255, 255, 255, 255]

        # Diffuse halo: 15 < dist <= 40
        halo_mask = (dist_from_center > 15) & (dist_from_center <= 40)
        halo_alpha = (255 * (1 - (dist_from_center[halo_mask] - 15) / 25.0)).astype(np.uint8)
        arr[halo_mask, 0] = 0
        arr[halo_mask, 1] = 200
        arr[halo_mask, 2] = 255
        arr[halo_mask, 3] = halo_alpha

        symmetries = detect_symmetries(arr, alpha_threshold=15)
        self.assertTrue(symmetries["horizontal_reflective"])
        self.assertTrue(symmetries["vertical_reflective"])
        self.assertGreater(symmetries["horizontal_iou"], 0.95)
        self.assertGreater(symmetries["vertical_iou"], 0.95)

        components = segment_components(arr, core_alpha_threshold=180, core_intensity_threshold=180)
        self.assertGreaterEqual(len(components), 1)
        self.assertGreater(components[0]["pixels"], 500)

        glow_info = analyze_glow_profile(arr, cx=50.0, cy=50.0)
        self.assertIn("estimated_blur_sigmas", glow_info)
        self.assertGreater(len(glow_info["radial_profile"]), 0)

    def test_compare_graphics_zero_alpha_normalization(self):
        """Verifies that invisible RGB channels in transparent pixels do not distort RMSE."""
        im1 = Image.new("RGBA", (50, 50), (255, 255, 255, 0))  # transparent white
        im2 = Image.new("RGBA", (50, 50), (0, 0, 0, 0))        # transparent black

        p1 = self.work_dir / "im1.png"
        p2 = self.work_dir / "im2.png"
        im1.save(p1)
        im2.save(p2)

        metrics = compare_images(p1, p2)
        # Without zero-alpha normalization, RMSE would be 255. With normalization, RMSE is 0.0.
        self.assertEqual(metrics["global_rmse"], 0.0)
        self.assertEqual(metrics["alpha_iou"], 1.0)
        self.assertEqual(metrics["core_ssim"], 1.0)

    def test_compare_graphics_metrics_and_shifts(self):
        """Tests SSIM, IoU, and centroid/bbox shifts on synthetic shapes."""
        im1 = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        draw1 = ImageDraw.Draw(im1)
        draw1.rectangle([30, 30, 70, 70], fill=(255, 255, 255, 255))

        im2 = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        draw2 = ImageDraw.Draw(im2)
        # Shifted by +2px in X and +2px in Y
        draw2.rectangle([32, 32, 72, 72], fill=(255, 255, 255, 255))

        p1 = self.work_dir / "box1.png"
        p2 = self.work_dir / "box2.png"
        im1.save(p1)
        im2.save(p2)

        metrics = compare_images(p1, p2)
        self.assertAlmostEqual(metrics["delta_cx_px"], 2.0, places=1)
        self.assertAlmostEqual(metrics["delta_cy_px"], 2.0, places=1)
        self.assertEqual(metrics["delta_w_px"], 0)
        self.assertEqual(metrics["delta_h_px"], 0)
        self.assertLess(metrics["core_ssim"], 1.0)

    def test_verify_replica_threshold_evaluator(self):
        """Tests automated parity gating pass/fail conditions."""
        pass_metrics = {
            "core_ssim": 0.990,
            "core_iou": 0.970,
            "edge_iou": 0.950,
            "psnr_db": 34.5,
            "delta_cx_px": 0.2,
            "delta_cy_px": -0.1,
            "delta_w_px": 0,
            "delta_h_px": 1,
            "overlap_color_rmse": 4.2,
            "alpha_iou": 0.985,
        }
        passed, criteria = evaluate_gate(pass_metrics, DEFAULT_THRESHOLDS)
        self.assertTrue(passed)
        self.assertTrue(all(c["passed"] for c in criteria))

        fail_metrics = dict(pass_metrics)
        fail_metrics["core_ssim"] = 0.970  # Below 0.985
        fail_metrics["delta_cx_px"] = 1.2   # Exceeds 0.5px
        passed_fail, criteria_fail = evaluate_gate(fail_metrics, DEFAULT_THRESHOLDS)
        self.assertFalse(passed_fail)
        failed_criteria = [c for c in criteria_fail if not c["passed"]]
        self.assertEqual(len(failed_criteria), 2)

    def test_match_font_evaluation(self):
        """Tests typography chamfer distance and silhouette IoU matching."""
        # Create identical synthetic letterform masks
        mask1 = np.zeros((40, 60), dtype=bool)
        mask1[10:30, 20:40] = True
        mask2 = np.copy(mask1)

        iou, chamfer = compute_metrics(mask1, mask2)
        self.assertAlmostEqual(iou, 1.0, places=3)
        self.assertAlmostEqual(chamfer, 0.0, places=3)

        # Shifted mask
        mask_shifted = np.zeros((40, 60), dtype=bool)
        mask_shifted[12:32, 20:40] = True
        iou_s, chamfer_s = compute_metrics(mask1, mask_shifted)
        self.assertLess(iou_s, 1.0)
        self.assertGreater(chamfer_s, 0.0)

    def test_render_svg_headless(self):
        """Tests Playwright headless SVG rasterization."""
        svg_code = """<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 60 40">
          <rect x="5" y="5" width="50" height="30" fill="#00ffff" />
        </svg>"""
        svg_file = self.work_dir / "test.svg"
        png_file = self.work_dir / "test.png"
        svg_file.write_text(svg_code, encoding="utf-8")

        success = render_svg_to_png(svg_file, png_file, width=60, height=40)
        self.assertTrue(success)
        self.assertTrue(png_file.is_file())

        with Image.open(png_file) as im:
            self.assertEqual(im.size, (60, 40))
            self.assertEqual(im.mode, "RGBA")

    def test_tune_graphic_loss_calculation(self):
        """Tests GraphicTuner multi-objective loss calculation."""
        ref_arr = np.zeros((50, 50, 4), dtype=np.float32)
        ref_arr[15:35, 15:35] = [255, 255, 255, 255]

        tuner = GraphicTuner(
            template_svg="<svg></svg>",
            reference_arr=ref_arr,
            width=50,
            height=50,
            metric="multi",
        )

        # Identical candidate should yield zero (or near zero) loss
        loss_identical = tuner.calculate_loss(ref_arr)
        self.assertAlmostEqual(loss_identical, 0.0, places=2)

        # Candidate with mismatch should have strictly positive loss
        mismatch_arr = np.zeros((50, 50, 4), dtype=np.float32)
        mismatch_arr[20:40, 20:40] = [255, 255, 255, 255]
        loss_mismatch = tuner.calculate_loss(mismatch_arr)
        self.assertGreater(loss_mismatch, 10.0)


if __name__ == "__main__":
    unittest.main()
