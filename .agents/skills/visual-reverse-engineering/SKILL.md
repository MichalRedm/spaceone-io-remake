---
name: visual-reverse-engineering
description: Graphic-agnostic empirical reverse-engineering, loss-driven parametric calibration, and automated human-indistinguishability validation gating for 2D sprites, HUD graphics, and vector assets.
---

# Visual Reverse-Engineering Skill

This skill defines the rigorous, graphic-agnostic empirical workflow for reverse-engineering raster game sprites and HUD graphics into pixel-perfect parametric SVG vector replicas.

---

## 🎯 Scope & Core Distinction

- **Forward Creative Design** (`vector-graphics-engineering`): Authoring new assets from scratch, thematic styling, and general asset pipeline integration.
- **Empirical Reverse-Engineering** (`visual-reverse-engineering`): Deconstructing existing ground-truth reference images, extracting structural properties, fitting typographic/geometric parameters via loss optimization, and enforcing quantitative human-indistinguishability validation gates.

This skill is **graphic-agnostic**: it operates identically on directional arrows, projectiles, ships, asteroids, UI badges, or HUD indicators.

---

## 🛑 Mandatory Agent Stopping Rule

> [!IMPORTANT]
> **NO REPLICA IS COMPLETE UNTIL THE AUTOMATED GATE PASSES WITH EXIT CODE 0.**
> 
> An agent MUST NOT conclude a reverse-engineering task, declare success, or submit a pull request without running `verify_replica.py` and obtaining a clean **`[PASS] Parity verification succeeded!`** (exit code `0`).
> Visual inspection or qualitative impressions alone are strictly prohibited as completion criteria.

---

## 📐 Quantitative Indistinguishability Standards

To be perceptually indistinguishable to a human observer at native and scaled resolutions, a vector replica must satisfy all of the following thresholds simultaneously:

| Metric | Threshold | Target Dimension / Error Type |
| :--- | :--- | :--- |
| **Core Structural Similarity (SSIM)** | $\ge 0.985$ | Luminance structure of core shape & typography |
| **Core Silhouette IoU** | $\ge 96.0\%$ ($0.960$) | Foreground stroke widths, apexes, corner joins |
| **Sobel Edge Contour IoU** | $\ge 94.0\%$ ($0.940$) | Sharpness vs rounded edges, bevels, miter joins |
| **Global PSNR** | $\ge 30.0\text{ dB}$ | Overall reconstruction signal quality |
| **Centroid Shift ($|\Delta cx|, |\Delta cy|$)** | $\le 0.5\text{px}$ | Spatial center of mass alignment |
| **Bounding Box Delta ($|\Delta w|, |\Delta h|$)** | $\le 2\text{px}$ | Outer alpha envelope boundary matching |
| **Overlap Color RMSE** | $\le 8.0$ | Chroma and luminance fidelity across overlapping pixels |

---

## 🔄 The 5-Step Empirical Convergence Protocol

```
[ Phase 1: Structural Probing ] ➔ [ Phase 2: Typography Matching ] ➔ [ Phase 3: Parametric SVG Template ] ➔ [ Phase 4: Loss Optimization ] ➔ [ Phase 5: Verification Gate ]
```

### Phase 1: Ground Truth Extraction & Structural Probing
Before drafting SVG code, extract mathematical and structural invariants from the target image:
```bash
python .agents/skills/visual-reverse-engineering/scripts/probe_graphic.py \
  -i <reference_png> \
  -o probe_report.json \
  --annotated probe_annotated.png
```
**Outputs analyzed:**
- Exact canvas dimensions $(W, H)$ and alpha bounding box
- Symmetries: Horizontal reflection, vertical reflection, $N$-fold rotational symmetry
- Foreground segmentation: Core mask ($A > 180, I > 180$) vs diffuse glow halo
- Connected components decomposition
- Radial glow intensity profile $I(r)$ and estimated Gaussian $\sigma$ stages
- Typography detection: checks for horizontal text bands and cap heights

### Phase 2: Typography Identification & Parameter Fitting (If Text Present)
If `probe_graphic` identifies typography, automatically discover the font family, weight, size, letter spacing, and baseline position:
```bash
python .agents/skills/visual-reverse-engineering/scripts/match_font.py \
  -i <reference_png> \
  -t "<EXPECTED_TEXT>" \
  -o font_match.json
```
- Performs multi-stage catalog search across common system/web fonts (`Trebuchet MS`, `Arial`, `Roboto`, `Segoe UI`, `Impact`, etc.).
- Evaluates candidates using glyph silhouette IoU and Euclidean distance transform Chamfer distance.
- Outputs exact SVG attributes: `font-family`, `font-weight`, `font-size`, `letter-spacing`, and baseline coordinate `y`.

### Phase 3: Parametric SVG Template Drafting
Create a parametric SVG template `<name>_template.svg` with placeholder variables `{param_name}` for uncalibrated dimensions.
- **Apex & Join Invariant**: If the target has sharp corners, specify `stroke-linejoin="miter"` or explicit polygonal vertices. Never use rounded joins where the probe or edge diff shows sharp bevels.
- **Glow Architecture**: Use multi-pass SVG filters (`feGaussianBlur` + `feMerge`) matching the sigmas extracted in Phase 1.
- **Typography**: Embed the font family and styling parameters discovered in Phase 2.

### Phase 4: Component-Separated Loss Optimization
Tune continuous geometric and filter parameters against the reference image using headless Chromium rendering:
```bash
python .agents/skills/visual-reverse-engineering/scripts/tune_graphic.py \
  -t <template_svg> \
  -r <reference_png> \
  -p "blur_sigma=4.0:1.0:10.0" \
  -p "stroke_width=6.0:3.0:12.0" \
  -f "font_size=16.9" \
  -m multi \
  -o optimized.svg \
  --output-png optimized.png \
  --output-diff tuning_diff.png
```
- **Component-Separated Loss Formula**:
  $$L = 50.0 (1 - \text{SSIM}_{\text{core}}) + 40.0 (1 - \text{IoU}_{\text{edge}}) + 30.0 (1 - \text{IoU}_{\alpha}) + 1.0 \text{RMSE}_{\text{color}} + 0.5 \text{RMSE}_{\text{glow}}$$
  Separating the core shape from diffuse glow prevents broad ambient blur from overpowering subtle geometric errors.

### Phase 5: Verification & Automated Parity Gate
Run the automated validation gate:
```bash
python .agents/skills/visual-reverse-engineering/scripts/verify_replica.py \
  -r <reference_png> \
  -c <candidate_svg_or_png> \
  --diff-output diff_diagnostic.png
```
- Generates a 5-panel diagnostic image: `[ Reference ] [ Candidate ] [ 8x Zoom Inset ] [ Edge Diff ] [ Alignment Overlay ]`.
- Prints a detailed tabular compliance report across all 7 criteria.
- **Exit code `0`**: All criteria satisfied. Replica is mathematically and perceptually verified.
- **Exit code `1`**: One or more criteria failed. The agent must inspect the failure report and 8x zoom diff, adjust parameters/geometry, and re-run.

---

## 🛠️ Script Reference & CLI Usage

All tools reside in `.agents/skills/visual-reverse-engineering/scripts/`:

### 1. `probe_graphic.py`
```
probe_graphic.py [-h] -i IMAGE [-o OUTPUT_JSON] [--annotated ANNOTATED] [-a ALPHA_THRESHOLD]
```
- `-i, --image`: Path to reference image (PNG/RGBA).
- `-o, --output-json`: Path to save structural analysis JSON.
- `--annotated`: Path to save visual debug annotation map.

### 2. `match_font.py`
```
match_font.py [-h] -i IMAGE -t TEXT [-o OUTPUT_JSON] [--crop X0,Y0,X1,Y1]
```
- `-i, --image`: Path to reference image.
- `-t, --text`: Expected text string (e.g. `"LEADER"`, `"FLAG"`).
- `--crop`: Optional sub-box `[x0, y0, x1, y1]` containing the text.

### 3. `compare_graphics.py`
```
compare_graphics.py [-h] -r REFERENCE -c CANDIDATE [-o OUTPUT_DIFF] [-a ALPHA_THRESHOLD] [--json]
```
- `-r, --reference`: Reference PNG.
- `-c, --candidate`: Candidate PNG.
- `-o, --output-diff`: 5-panel comparison diagnostic image.
- `--json`: Output metrics as machine-readable JSON.

### 4. `tune_graphic.py`
```
tune_graphic.py [-h] -t TEMPLATE -r REFERENCE [-o OUTPUT_SVG] [--output-png OUTPUT_PNG] [--output-diff OUTPUT_DIFF] [-s SWEEP] [-p OPTIMIZE] [-f FIXED] [-m {multi,combined,rmse,ssim}] [--max-iter MAX_ITER]
```
- `-s, --sweep`: 1D sweep `param=start:stop:step`.
- `-p, --optimize`: Bounded Nelder-Mead optimization `param=init:min:max`.
- `-f, --fixed`: Fixed parameter `param=val`.
- `-m, --metric`: Default `multi` (component-separated loss).

### 5. `verify_replica.py`
```
verify_replica.py [-h] -r REFERENCE -c CANDIDATE [--diff-output DIFF_OUTPUT] [--json]
```
- Returns exit code `0` on pass, `1` on fail.

### 6. `render_svg.py`
```
render_svg.py [-h] -i INPUT_SVG -o OUTPUT_PNG [-w WIDTH] [-H HEIGHT] [--scale SCALE]
```
- Headless Playwright Chromium rasterizer with transparent background support.

---

## ⚠️ Known Invariants & Traps

1. **Zero-Alpha Normalization**: Fully transparent pixels (`A == 0`) often retain arbitrary background colors (e.g. transparent white `[255, 255, 255, 0]` vs transparent black `[0, 0, 0, 0]`). Comparison tools MUST zero-out RGB when `A == 0` before calculating difference metrics, or invisible background variations will distort global RMSE.
2. **Chromium SetContent Wait Condition**: Always use `wait_until="domcontentloaded"` in Playwright scripts for local SVG rendering. `wait_until="networkidle"` introduces an artificial 500ms sleep per iteration, slowing optimization loops by 100x.
3. **Miter vs Round Joins**: Chevron and arrowhead apexes in arcade games typically use mitered joins (`stroke-linejoin="miter"` or explicit polygonal points). Avoid `stroke-linejoin="round"` unless specifically identified by `probe_graphic`.
4. **Diffuse Halo Masking**: Never optimize raw RMSE alone on glowing assets; diffuse blur will dominate the loss function, allowing sharp corner or letterform shape errors to pass undetected. Always use `multi` metric mode.
