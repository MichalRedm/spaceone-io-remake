"""Unit and integration tests for original Spaceone.io replay conversion and time parsing."""

from __future__ import annotations

import csv
import json
import struct
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageStat

from tools.recorder.cli import (
    _default_original_output_path,
    _detect_original_target,
    build_original_render_options,
    build_parser,
    build_render_options,
)
from tools.recorder.format import ReplayWriter, is_s1rec_file
from tools.recorder.original_exporter import export_original_trajectories
from tools.recorder.original_format import (
    DEFAULT_ORIGINAL_PLAYBACK_DIR,
    inspect_original_recording,
    is_original_playback_file,
    list_original_recordings,
    slice_original_stream,
)
from tools.recorder.original_renderer import (
    OriginalRenderOptions,
    extract_original_frames,
    render_original_to_mp4,
)
from tools.recorder.timeparse import format_timestamp, parse_timestamp_sec


def _pack_original_frame(ts_ms: int, payload: bytes) -> bytes:
    high = (ts_ms >> 32) & 0xFFFFFFFF
    low = ts_ms & 0xFFFFFFFF
    return struct.pack("<III", high, low, len(payload)) + payload


def _wrap_server_packet(opcode: int, body: bytes) -> bytes:
    # Matches parse_variable_header(extra=False):
    # 1x (3 bytes + vbyte(0)), uint16(0), vbyte(1), uint8(0), vbyte(0), opcode, body
    header = bytes([0x08, 0x01, 0x12, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, opcode])
    return header + body


def _build_synthetic_borders_payload() -> bytes:
    body = struct.pack("<8d", -5000.0, -5000.0, 5000.0, 5000.0, -4500.0, -4500.0, 4500.0, 4500.0)
    return _wrap_server_packet(0x40, body)


def _build_synthetic_announcement_payload(victim: str, points: int) -> bytes:
    body = victim.encode("utf-8") + b"\x00" + struct.pack("<i", points)
    return _wrap_server_packet(0x50, body)


def _build_synthetic_world_update_payload(
    fleet_id: int = 100,
    fleet_name: str = "OrigPilot",
    x: int = 120,
    y: int = -45,
    vx: int = 18,
    vy: int = -6,
    is_dashing: bool = False,
) -> bytes:
    buf = bytearray()
    buf.append(0)  # shouldRenderLeader
    buf.extend(b"1.0\x00")  # version
    buf.append(1)  # drawStarfield
    buf.append(1)  # isInterpolating
    buf.extend(struct.pack("<H", 1))  # numValidBoids
    buf.append(0)  # isDangerZone
    buf.extend(struct.pack("<d", 1.0))  # cooldownPerc
    buf.extend(bytes([1, 3]))  # currentFoodForNextBoid, foodForNextBoid

    # numFleets = 1
    buf.extend(struct.pack("<I", 1))
    buf.extend(struct.pack("<I", 1))  # cell count for fleet 0
    buf.extend(struct.pack("<IHii", fleet_id, 1, x, y))
    buf.extend(struct.pack("<ddii", 1.0, 0.0, x + 50, y))
    buf.extend(struct.pack("<ii", 2, 1))  # foodsEaten, boidsDestroyed
    flags = 1 | 2 | (4 if is_dashing else 0)  # hasColor | hasName | isDashing
    buf.extend(struct.pack("<HB", flags, 0))  # flags, isSpawnProtected
    buf.extend(bytes([0, 255, 255]))  # RGB color
    buf.append(1)  # selectedSet
    if is_dashing:
        buf.extend(struct.pack("<i", 10))
    buf.extend(fleet_name.encode("utf-8") + b"\x00")
    buf.extend(struct.pack("<IIB", 1, 250, 1))  # leaderboardPos, score, isMyFleet

    # Cell
    buf.extend(struct.pack("<IiiiidBhh", 5001, x, y, vx, vy, 1.0, 0, 20, 0))

    # numOtherCells = 1 (food)
    buf.extend(struct.pack("<I", 1))
    buf.extend(struct.pack("<IiiiidBhh", 9001, 300, 400, 0, 0, 1.0, 0, 8, 1))

    # numDeleted = 0
    buf.extend(struct.pack("<H", 0))
    return _wrap_server_packet(0x10, bytes(buf))


class OriginalRecorderTests(unittest.TestCase):
    def test_timestamp_parsing_and_formatting(self) -> None:
        self.assertAlmostEqual(parse_timestamp_sec(0), 0.0)
        self.assertAlmostEqual(parse_timestamp_sec("90"), 90.0)
        self.assertAlmostEqual(parse_timestamp_sec("12.5"), 12.5)
        self.assertAlmostEqual(parse_timestamp_sec("02:15"), 135.0)
        self.assertAlmostEqual(parse_timestamp_sec("12:30.5"), 750.5)
        self.assertAlmostEqual(parse_timestamp_sec("1:02:03.25"), 3723.25)

        self.assertEqual(format_timestamp(135.5), "02:15.50")
        self.assertEqual(format_timestamp(3723.25), "1:02:03.25")

        for bad in ("", "-5", "1:60", "0:00:61", "1:2:3:4", "abc", "nan"):
            with self.assertRaises(ValueError):
                parse_timestamp_sec(bad)

    def test_original_binary_format_inspection_slicing_and_export(self) -> None:
        base_ts = 1514621142000
        pkt_b = _build_synthetic_borders_payload()
        pkt_wu1 = _build_synthetic_world_update_payload(x=100, y=200, is_dashing=False)
        pkt_wu2 = _build_synthetic_world_update_payload(x=140, y=190, is_dashing=True)
        pkt_ann = _build_synthetic_announcement_payload("EnemyBot", 42)

        raw_stream = (
            _pack_original_frame(base_ts, pkt_b)
            + _pack_original_frame(base_ts + 40, pkt_wu1)
            + _pack_original_frame(base_ts + 1040, pkt_wu2)
            + _pack_original_frame(base_ts + 2040, pkt_ann)
        )

        with tempfile.TemporaryDirectory() as tmp:
            rec_path = Path(tmp) / "SYNTH1~A"
            # Append truncated tail frame to verify crash resilience
            rec_path.write_bytes(raw_stream + b"\x10\x00\x00\x00\x00\x00\x00\x00\x40\x00\x00\x00partial")

            self.assertTrue(is_original_playback_file(rec_path))
            self.assertFalse(is_s1rec_file(rec_path))

            s1rec_path = Path(tmp) / "remake.s1rec"
            with ReplayWriter(s1rec_path, {"worldKey": "default"}) as w:
                w.write_frame(0, b"dummy")
            self.assertTrue(is_s1rec_file(s1rec_path))
            self.assertFalse(is_original_playback_file(s1rec_path))

            info = inspect_original_recording(rec_path)
            self.assertTrue(info["playable"])
            self.assertEqual(info["world_update_count"], 2)
            self.assertEqual(info["duration_ms"], 2040)
            self.assertEqual(info["player_names"], ["OrigPilot"])
            self.assertEqual(info["my_fleet_ids"], [100])
            self.assertEqual(info["dash_events_count"], 1)
            self.assertEqual(len(info["alive_segments"]), 1)
            self.assertEqual(info["announcements"][0]["victim_name"], "EnemyBot")
            self.assertIsNotNone(info["borders"])

            sliced, total_ms, count = slice_original_stream(rec_path, max_elapsed_ms=1100)
            self.assertEqual(total_ms, 2040)
            self.assertEqual(count, 3)
            self.assertLess(len(sliced), len(raw_stream))

            csv_path = Path(tmp) / "orig.csv"
            exp_res = export_original_trajectories(
                rec_path,
                csv_path,
                start_sec=0.5,
                end_sec=1.5,
                tracked_only=True,
                ships_only=True,
            )
            self.assertEqual(exp_res["ticks_exported"], 1)
            self.assertEqual(exp_res["rows_written"], 1)
            with open(csv_path, encoding="utf-8") as fp:
                rows = list(csv.DictReader(fp))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["fleet_name"], "OrigPilot")
            self.assertEqual(rows[0]["entity_type"], "ship")
            self.assertEqual(rows[0]["is_dashing"], "1")

            jsonl_path = Path(tmp) / "orig.jsonl"
            exp_jsonl = export_original_trajectories(rec_path, jsonl_path)
            self.assertEqual(exp_jsonl["ticks_exported"], 2)
            lines = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(lines), 4)  # 2 ships + 2 food

    def test_cli_original_parsing_and_autodetect(self) -> None:
        parser = build_parser()
        args = parser.parse_args(
            [
                "original",
                "render",
                "2VH0FQ~1",
                "--profile",
                "agent",
                "--graphics",
                "low",
                "--start",
                "0:10",
                "--end",
                "0:20.5",
                "--speed",
                "0.5",
                "--overlay-info",
                "--no-fadeout",
            ]
        )
        opts = build_original_render_options(args)
        self.assertEqual((opts.width, opts.height), (960, 540))
        self.assertEqual(opts.graphics, "low")
        self.assertAlmostEqual(opts.start_sec, 10.0)
        self.assertAlmostEqual(opts.end_sec or 0.0, 20.5)
        self.assertAlmostEqual(opts.speed, 0.5)
        self.assertTrue(opts.overlay_info)
        self.assertTrue(opts.no_fadeout)

        remake_args = parser.parse_args(
            ["render", "match.s1rec", "--start", "1:05", "--end", "1:25"]
        )
        remake_opts = build_render_options(remake_args)
        self.assertAlmostEqual(remake_opts.start_sec, 65.0)
        self.assertAlmostEqual(remake_opts.end_sec or 0.0, 85.0)

        # Output path must never write directly inside reference/
        ref_target = DEFAULT_ORIGINAL_PLAYBACK_DIR / "2LTLT1~F"
        default_out = _default_original_output_path(ref_target)
        self.assertEqual(default_out.name, "2LTLT1~F.mp4")
        self.assertNotIn("reference", str(default_out).lower())

        if ref_target.is_file():
            self.assertEqual(_detect_original_target("2LTLT1~F"), ref_target)

    @unittest.skipUnless(
        (DEFAULT_ORIGINAL_PLAYBACK_DIR / "2VH0FQ~1").is_file(),
        "Archived original Spaceone.io recordings not present on disk.",
    )
    def test_real_archive_listing_inspection_and_wasm_render(self) -> None:
        playable = list_original_recordings(include_empty=False)
        all_files = list_original_recordings(include_empty=True)
        self.assertGreaterEqual(len(playable), 20)
        self.assertGreater(len(all_files), len(playable))

        sample_id = "2VH0FQ~1"
        info = inspect_original_recording(sample_id)
        self.assertTrue(info["playable"])
        self.assertGreater(info["duration_sec"], 30.0)
        self.assertIsNotNone(info["borders"])
        self.assertTrue(info["alive_segments"])

        seg = info["alive_segments"][0]
        clip_start = max(0.0, seg["start_ms"] / 1000.0 + 2.0)
        clip_end = min(info["duration_sec"], clip_start + 3.0)

        with tempfile.TemporaryDirectory() as tmp:
            out_mp4 = Path(tmp) / "orig_clip.mp4"
            res = render_original_to_mp4(
                sample_id,
                out_mp4,
                OriginalRenderOptions(
                    width=960,
                    height=540,
                    fps=30,
                    crf=24,
                    graphics="high",
                    overlay_info=True,
                    start_sec=clip_start,
                    end_sec=clip_end,
                    lossless_frames=False,
                ),
            )
            self.assertTrue(out_mp4.is_file())
            self.assertGreater(res["size_bytes"], 10_000)
            vstreams = [
                s for s in res["probe"].get("streams", []) if s.get("codec_type") == "video"
            ]
            self.assertEqual(len(vstreams), 1)
            self.assertEqual(vstreams[0]["codec_name"], "h264")
            self.assertEqual((vstreams[0]["width"], vstreams[0]["height"]), (960, 540))

            frames_dir = Path(tmp) / "frames"
            frm_res = extract_original_frames(
                sample_id,
                frames_dir,
                interval_sec=1.5,
                contact_sheet=True,
                columns=2,
                options=OriginalRenderOptions(
                    width=960,
                    height=540,
                    graphics="high",
                    start_sec=clip_start,
                    end_sec=clip_end,
                ),
            )
            self.assertTrue(frm_res["frames"])
            sheet_path = Path(frm_res["contact_sheet"])
            self.assertTrue(sheet_path.is_file())

            # Verify WASM actually drew non-blank gameplay content (mean & stddev > 0)
            first_png = Path(frm_res["frames"][0])
            with Image.open(first_png) as img:
                stat = ImageStat.Stat(img.convert("RGB"))
                self.assertGreater(sum(stat.stddev) / 3.0, 3.0)


if __name__ == "__main__":
    unittest.main()
