"""Unit tests for the Spaceone.io Remake gameplay recording toolkit."""

from __future__ import annotations

import csv
import struct
import tempfile
import unittest
from pathlib import Path

from tools.recorder.cli import build_parser, build_render_options
from tools.recorder.discovery import build_target_spec, find_matching_player
from tools.recorder.exporter import export_trajectories
from tools.recorder.flatbuffers_wire import (
    _NET_BODY_STRUCT,
    AllMessages,
    MiniFlatBufferBuilder,
    _TableReader,
    build_net_control_input,
    build_net_ping,
    decode_world_view_full,
    peek_quantum,
)
from tools.recorder.format import ReplayWriter, inspect_replay, read_replay
from tools.recorder.renderer import parse_ui_overrides, parse_viewport


def _build_synthetic_world_view(
    server_time: int,
    fleet_id: int,
    is_alive: bool,
    cam_x: float,
    cam_y: float,
    bodies: list[tuple[int, int, float, float, float, float, float, float, int, int, int, int]],
    deletes: list[int] | None = None,
    group_caption: str | None = None,
) -> bytes:
    """Builds a real FlatBuffers `NetQuantum(NetWorldView)` packet matching `game.fbs`."""
    b = MiniFlatBufferBuilder(512)

    groups_vec = 0
    if group_caption is not None and fleet_id > 0:
        cap_off = b.create_string(group_caption)
        col_off = b.create_string("cyan")
        b.start_object(7)
        b.add_offset(5, col_off, 0)
        b.add_offset(2, cap_off, 0)
        b.add_uint8(1, 1, 0)
        b.add_uint32(0, fleet_id, 0)
        g_off = b.end_object()
        b._prep(4, 4)
        b.put_uoffset(g_off)
        b.put_uint32(1)
        groups_vec = b.offset()

    deletes_vec = 0
    if deletes:
        b._prep(4, 4 * len(deletes))
        for d in reversed(deletes):
            b.put_uint32(d)
        b.put_uint32(len(deletes))
        deletes_vec = b.offset()

    updates_vec = 0
    if bodies:
        b._prep(4, 44 * len(bodies))
        for item in reversed(bodies):
            b._place_bytes(_NET_BODY_STRUCT.pack(*item))
        b.put_uint32(len(bodies))
        updates_vec = b.offset()

    b.start_object(15)
    b.add_uint32(9, 4, 0)  # playerCount
    if groups_vec:
        b.add_offset(6, groups_vec, 0)
    if deletes_vec:
        b.add_offset(5, deletes_vec, 0)
    if updates_vec:
        b.add_offset(4, updates_vec, 0)
    b.add_bool(3, is_alive, True)
    b.add_uint32(2, fleet_id, 0)

    # Inline Camera NetBody struct at field 1
    b._prep(4, 44)
    b._place_bytes(
        _NET_BODY_STRUCT.pack(0, server_time, cam_x, cam_y, 0.1, 0.0, 0.0, 0.0, 0, 0, 0, 0)
    )
    b._slot(1)

    b.add_uint32(0, server_time, 0)
    wv_off = b.end_object()

    b.start_object(2)
    b.add_offset(1, wv_off, 0)
    b.add_uint8(0, int(AllMessages.NetWorldView), 0)
    q_off = b.end_object()
    return b.finish(q_off)


class RecorderTests(unittest.TestCase):
    def test_net_ping_and_control_wire_encoding(self) -> None:
        ping_bytes = build_net_ping(bandwidth_throttle=1000, time=42)
        root_pos = struct.unpack_from("<I", ping_bytes, 0)[0]
        q = _TableReader(ping_bytes, root_pos)
        self.assertEqual(q.get_uint8(4, 0), int(AllMessages.NetPing))
        ping_tbl = q.get_indirect_table(6)
        self.assertIsNotNone(ping_tbl)
        assert ping_tbl is not None
        self.assertEqual(ping_tbl.get_uint32(4, 0), 42)
        self.assertEqual(ping_tbl.get_uint32(18, 0), 1000)

        ctrl_bytes = build_net_control_input("observe:name:TestBot;pov=1;radius=2500")
        ctrl_root = struct.unpack_from("<I", ctrl_bytes, 0)[0]
        q2 = _TableReader(ctrl_bytes, ctrl_root)
        self.assertEqual(q2.get_uint8(4, 0), int(AllMessages.NetControlInput))
        ctrl_tbl = q2.get_indirect_table(6)
        self.assertIsNotNone(ctrl_tbl)
        assert ctrl_tbl is not None
        self.assertEqual(
            ctrl_tbl.get_string(14), "observe:name:TestBot;pov=1;radius=2500"
        )

    def test_s1rec_roundtrip_gzip_and_truncated_recovery(self) -> None:
        pkt1 = _build_synthetic_world_view(
            1000,
            7,
            True,
            100.0,
            200.0,
            [(10, 1000, 100.0, 200.0, 0.2, 0.0, 0.5, 0.0, 2, 1, 0, 7)],
            group_caption="Alpha",
        )
        pkt2 = _build_synthetic_world_view(
            1040,
            7,
            False,
            108.0,
            200.0,
            [],
            deletes=[10],
        )

        with tempfile.TemporaryDirectory() as tmp:
            raw_path = Path(tmp) / "test.s1rec"
            gz_path = Path(tmp) / "test.s1rec.gz"

            for path, comp in ((raw_path, False), (gz_path, True)):
                with ReplayWriter(path, {"worldKey": "default", "tracking": {"mode": "name", "pov": True}}, compress=comp) as w:
                    w.write_frame(0, pkt1)
                    w.write_frame(40, pkt2)

                arch = read_replay(path)
                self.assertEqual(len(arch.frames), 2)
                self.assertEqual(arch.duration_ms, 40)
                self.assertEqual(arch.header["worldKey"], "default")

                summary = inspect_replay(path)
                self.assertEqual(summary["world_view_frames"], 2)
                self.assertEqual(summary["fleet_ids_observed"], [7])
                self.assertEqual(summary["alive_segments"], [{"start_ms": 0, "end_ms": 40}])

            # Truncated tail recovery
            data = raw_path.read_bytes() + b"\x28\x00\x00\x00\x64\x00\x00\x00partial"
            trunc_path = Path(tmp) / "trunc.s1rec"
            trunc_path.write_bytes(data)
            arch_trunc = read_replay(trunc_path)
            self.assertEqual(len(arch_trunc.frames), 2)

    def test_export_trajectories_delta_reconstruction(self) -> None:
        pkt1 = _build_synthetic_world_view(
            1000,
            5,
            True,
            10.0,
            20.0,
            [
                (101, 1000, 10.0, 20.0, 0.5, 0.0, 0.0, 0.0, 2, 1, 0, 5),
                (202, 1000, 50.0, 60.0, 0.0, 0.0, 0.0, 0.0, 1, 26, 0, 0),
            ],
            group_caption="BotA",
        )
        pkt2 = _build_synthetic_world_view(
            1040,
            5,
            True,
            30.0,
            20.0,
            [],
            deletes=[202],
        )

        with tempfile.TemporaryDirectory() as tmp:
            rec_path = Path(tmp) / "traj.s1rec"
            csv_path = Path(tmp) / "traj.csv"
            with ReplayWriter(rec_path, {"worldKey": "default"}) as w:
                w.write_frame(0, pkt1)
                w.write_frame(40, pkt2)

            stats = export_trajectories(rec_path, csv_path, tracked_only=True, ships_only=True)
            self.assertEqual(stats["ticks_exported"], 2)
            self.assertEqual(stats["rows_written"], 2)

            with open(csv_path, encoding="utf-8") as fp:
                rows = list(csv.DictReader(fp))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["group_name"], "BotA")
            # At t=1040, def_time=1000, vx=0.5 -> projected x = 10 + 0.5 * 40 = 30.0
            self.assertAlmostEqual(float(rows[1]["x"]), 30.0, places=2)

    def test_discovery_matching_and_observe_command(self) -> None:
        players = [
            {"playerID": "abcd1234", "name": "Bot Alpha", "fleetID": 3, "isAlive": False, "score": 50},
            {"playerID": "efgh5678", "name": "Bot Alpha", "fleetID": 9, "isAlive": True, "score": 120},
        ]
        matched = find_matching_player(players, "name", "bot alpha")
        self.assertIsNotNone(matched)
        assert matched is not None
        self.assertEqual(matched["playerID"], "efgh5678")

        spec = build_target_spec("name", "Bot Alpha", pov=True, viewport_radius=2400, matched_player=matched)
        self.assertEqual(spec.observe_control, "observe:name:Bot%20Alpha;pov=1;radius=2400")

    def test_cli_validation_profiles_and_ui_overrides(self) -> None:
        self.assertEqual(parse_viewport("1280x720"), (1280, 720))
        with self.assertRaises(ValueError):
            parse_viewport("1281x720")
        with self.assertRaises(ValueError):
            parse_viewport("100x100")

        overrides = parse_ui_overrides(["fpsHud,autofire"], ["leaderboard"])
        self.assertEqual(overrides, {"fpsHud": True, "autofire": True, "leaderboard": False})
        with self.assertRaises(ValueError):
            parse_ui_overrides(["nonexistentWidget"], None)

        parser = build_parser()
        args = parser.parse_args(["render", "in.s1rec", "--profile", "agent", "--no-audio", "--speed", "0.5"])
        opts = build_render_options(args)
        self.assertEqual((opts.width, opts.height), (960, 540))
        self.assertEqual(opts.fps, 30)
        self.assertFalse(opts.enable_audio)
        self.assertEqual(opts.speed, 0.5)


if __name__ == "__main__":
    unittest.main()
