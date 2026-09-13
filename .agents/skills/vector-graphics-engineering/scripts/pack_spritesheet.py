#!/usr/bin/env python3
"""
Spritesheet assembly utility for animated game sprites.

Stitches a sequence of frame images (or rendered SVGs) into a horizontal strip,
vertical strip, or grid atlas with exact tile sizing and transparency.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image


def pack_frames(
    frame_paths: List[str | Path],
    output_png_path: str | Path,
    tile_width: Optional[int] = None,
    tile_height: Optional[int] = None,
    orientation: str = "horizontal",
    metadata_json_path: Optional[str | Path] = None,
) -> Path:
    """
    Assembles multiple frame images into a single spritesheet strip or grid.

    :param frame_paths: Ordered list of frame image paths.
    :param output_png_path: Output PNG spritesheet path.
    :param tile_width: Explicit tile width in pixels (or auto-detected from first frame).
    :param tile_height: Explicit tile height in pixels (or auto-detected from first frame).
    :param orientation: 'horizontal' or 'vertical'. Defaults to 'horizontal'.
    :param metadata_json_path: Optional path to write frame coordinate JSON metadata.
    :return: Resolved Path of the output spritesheet PNG.
    """
    if not frame_paths:
        raise ValueError("No frame paths provided for packing.")

    frames: List[Image.Image] = []
    for fp in frame_paths:
        p = Path(fp).resolve()
        if not p.is_file():
            raise FileNotFoundError(f"Frame file not found: {p}")
        frames.append(Image.open(p).convert("RGBA"))

    first = frames[0]
    t_w = tile_width if tile_width and tile_width > 0 else first.width
    t_h = tile_height if tile_height and tile_height > 0 else first.height

    num_frames = len(frames)
    if orientation == "horizontal":
        sheet_w = t_w * num_frames
        sheet_h = t_h
    elif orientation == "vertical":
        sheet_w = t_w
        sheet_h = t_h * num_frames
    else:
        raise ValueError(f"Unsupported orientation: {orientation}. Use 'horizontal' or 'vertical'.")

    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    metadata_frames = {}

    for idx, f in enumerate(frames):
        # Resize frame if dimensions don't match tile size
        if f.width != t_w or f.height != t_h:
            f = f.resize((t_w, t_h), Image.Resampling.LANCZOS)

        if orientation == "horizontal":
            x = idx * t_w
            y = 0
        else:
            x = 0
            y = idx * t_h

        sheet.paste(f, (x, y), f)

        metadata_frames[f"frame_{idx}"] = {
            "frame": {"x": x, "y": y, "w": t_w, "h": t_h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": t_w, "h": t_h},
            "sourceSize": {"w": t_w, "h": t_h},
        }

    out_file = Path(output_png_path).resolve()
    out_file.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_file)
    print(f"[pack_spritesheet] Assembled {num_frames} frames ({t_w}x{t_h}) into {out_file} ({sheet_w}x{sheet_h})")

    if metadata_json_path:
        meta_file = Path(metadata_json_path).resolve()
        meta_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "frames": metadata_frames,
            "meta": {
                "size": {"w": sheet_w, "h": sheet_h},
                "tile": {"size": t_w, "count": num_frames},
            },
        }
        meta_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"[pack_spritesheet] Exported frame metadata: {meta_file}")

    return out_file


def main() -> int:
    parser = argparse.ArgumentParser(description="Spritesheet strip packer for animated game sprites.")
    parser.add_argument("-f", "--frames", nargs="+", required=True, help="List of frame image files or glob expressions")
    parser.add_argument("-o", "--output", required=True, help="Output spritesheet PNG path")
    parser.add_argument("-W", "--tile-width", type=int, default=None, help="Tile pixel width (default: auto from first frame)")
    parser.add_argument("-H", "--tile-height", type=int, default=None, help="Tile pixel height (default: auto from first frame)")
    parser.add_argument("--orientation", choices=["horizontal", "vertical"], default="horizontal", help="Packing strip direction")
    parser.add_argument("-m", "--metadata", default=None, help="Optional output JSON metadata path")

    args = parser.parse_args()

    # Expand any glob expressions in frames list
    resolved_paths: List[str] = []
    for item in args.frames:
        matches = sorted(glob.glob(item))
        if matches:
            resolved_paths.extend(matches)
        else:
            resolved_paths.append(item)

    try:
        pack_frames(
            frame_paths=resolved_paths,
            output_png_path=args.output,
            tile_width=args.tile_width,
            tile_height=args.tile_height,
            orientation=args.orientation,
            metadata_json_path=args.metadata,
        )
        return 0
    except Exception as exc:
        print(f"[pack_spritesheet] Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
