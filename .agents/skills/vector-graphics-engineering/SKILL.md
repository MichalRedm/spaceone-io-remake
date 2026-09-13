---
name: vector-graphics-engineering
description: Parametric vector graphics design, headless SVG rasterization, and visual reverse-engineering comparison tooling for Spaceone.io retro-neon game and HUD assets.
---

# Vector Graphics Engineering & Reverse-Engineering

This skill guides AI agents and developers in authoring high-fidelity vector graphics (SVG), rendering them headlessly to transparent game-ready PNGs, and reverse-engineering or calibrating graphics against visual references using automated perceptual difference metrics and multi-panel diagnostic artifacts.

---

## 🎨 Spaceone.io Retro-Neon Design Language

Spaceone.io features a distinctive 1980s retro-arcade vector aesthetic characterized by high-contrast geometric energy shapes glowing against pitch-black space:

1. **Color Palette**:
   - **Cyan**: `#00F0FF` / `#22FFFF` (primary player / cyan team core)
   - **Red**: `#FF2040` / `#FF2A4D` (hostile / red team core)
   - **Blue**: `#0066FF` / `#2F65FF` (deep shield / alt team)
   - **Green**: `#22FF44` (energy / health / green team)
   - **Yellow**: `#FFEE22` / `#FFD700` (apex / high score / warning)
   - **White**: `#FFFFFF` (hot energetic core for strokes and chevrons)
2. **Geometry & Contours**:
   - Clean geometric symmetry (arrows, circles, hexagons, chevrons).
   - Rounded joins and caps: always specify `stroke-linecap="round"` and `stroke-linejoin="round"` to avoid harsh pixel staircasing.
   - Hot pure-white center paths (`stroke="#ffffff"`, `stroke-width="4..8"`) layered over colored neon halo strokes (`stroke="var(--neon)"`, `stroke-width="8..16"`).
3. **Multi-Pass Glow Bloom**:
   - SVG filters simulate optical arcade monitor bloom.
   - Recommended filter template:
     ```xml
     <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
       <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="inner-blur" />
       <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="outer-blur" />
       <feMerge>
         <feMergeNode in="outer-blur" />
         <feMergeNode in="inner-blur" />
         <feMergeNode in="SourceGraphic" />
       </feMerge>
     </filter>
     ```
4. **Anti-Patterns to Avoid**:
   - ❌ Photocopied paper/grunge noise textures or distressed overlays.
   - ❌ Realistic medieval stone, brick, or fabric textures with painted cloth wrinkles.
   - ❌ Heavy black cartoon borders (`stroke="#000000"`).
   - ❌ Solid opaque non-neon fills that obscure the starfield background.

---

## 🛠️ Tooling Suite Overview

The skill includes three CLI utilities in `scripts/`:

| Script | Purpose | Key Commands |
| :--- | :--- | :--- |
| `render_svg.py` | Renders SVG files to transparent PNGs using headless Playwright Chromium with full SVG filter and font fidelity. | `python render_svg.py -i input.svg -o output.png -w 256 -H 256` |
| `compare_graphics.py` | Compares a candidate graphic against a reference graphic, computing RMSE, PSNR, Alpha IoU, centroid/bbox delta, and outputs a 4-panel diagnostic artifact. | `python compare_graphics.py -r ref.png -c cand.png -o diff.png` |
| `pack_spritesheet.py` | Stitches an ordered list of animated frames into a horizontal/vertical spritesheet strip with frame metadata. | `python pack_spritesheet.py -f frame_*.png -o sheet.png -W 128 -H 128` |

---

## 🔄 Agentic Workflows

### Workflow 1: Reverse-Engineering an Existing Graphic

When matching an existing reference graphic (e.g. creating a flag tracking arrow matching `Leader_Arrow.png`):

```
[ Step 1: Probe Reference ]
       │  • Inspect dimensions, alpha bounds, and center of mass using PIL/numpy.
       │  • Extract apex angle, stroke width, and bloom radius.
       ▼
[ Step 2: Author Vector SVG ]
       │  • Write parametric SVG file matching measured geometric properties.
       ▼
[ Step 3: Render Headless PNG ]
       │  • Run: python .agents/skills/vector-graphics-engineering/scripts/render_svg.py
       ▼
[ Step 4: Run Visual Difference Diagnostic ]
       │  • Run: python .agents/skills/vector-graphics-engineering/scripts/compare_graphics.py \
       │            -r reference.png -c candidate.png -o diagnostic.png
       │  • Inspect diagnostic.png using view_file.
       ▼
[ Step 5: Iterative Refinement ]
       │  • Adjust path coordinates, stroke widths, or blur radii based on heatmap and overlay.
       │  • Repeat Steps 3-4 until RMSE < 15.0 and Alpha IoU > 0.90 (or visual parity is reached).
       ▼
[ Step 6: Deploy & Verify in Game Engine ]
```

### Interpreting the 4-Panel Diagnostic Artifact

When `compare_graphics.py` runs with `-o diagnostic.png`, inspect it via `view_file`. It renders 4 panels:
1. **Target Reference**: The ground-truth reference image.
2. **Candidate Render**: The current vector output.
3. **Diff Heatmap**:
   - **Dark Green**: Near-zero discrepancy.
   - **Yellow/Orange**: Moderate color/alpha discrepancy.
   - **Bright Red**: Severe geometric shape mismatch or missing stroke.
4. **Alignment Overlay**:
   - Target displayed in Red channel; Candidate in Green channel.
   - **Yellow/White overlap**: Perfect spatial alignment.
   - **Red fringe**: Target has pixels missing in candidate (candidate too small/clipped).
   - **Green fringe**: Candidate extends outside target boundary (candidate too large/offset).

---

### Workflow 2: Designing Multi-Frame Animated Spritesheets

For animated entities like flags, energy rings, or thruster beacons:
1. Define a parametric SVG generator script (or separate SVG frame files `frame_0.svg` .. `frame_N.svg`).
2. Vary dynamic parameters (e.g. wave phase $\phi_k = \frac{2\pi k}{N}$, rotation angle $\theta_k = \frac{2\pi k}{N}$).
3. Render all frame SVGs to individual PNGs using `render_svg.py`.
4. Assemble into a single spritesheet strip using `pack_spritesheet.py`:
   ```bash
   python .agents/skills/vector-graphics-engineering/scripts/pack_spritesheet.py \
     -f frame_*.png -o output_sheet.png -W 128 -H 128 --orientation horizontal
   ```
5. Verify tile count and frame dimensions against the game's `textureMap_*.scss` configuration (e.g. `tile: { size: 128; count: 6; }`).

---

## 🧪 Self-Verification Checklist

Before committing vector graphics or tooling updates:
- [ ] Automated tests pass: `python .agents/skills/vector-graphics-engineering/scripts/test_graphics_tools.py`.
- [ ] Output PNGs are 32-bit RGBA with full transparent backgrounds (no black or white background square).
- [ ] Spritesheet frame counts and tile dimensions exactly match `textureMap_*.scss` tile settings.
- [ ] SVGs are committed to source control (e.g. in `Game.Engine/wwwroot/img/sources/`) so future edits remain fully reproducible.
