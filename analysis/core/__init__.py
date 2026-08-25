"""
Spaceone.io Telemetry, Kinematics & Playback Analysis Core Library.
"""

from .binary_reader import BinaryReader
from .packet_parser import (
    parse_variable_header,
    parse_cell,
    parse_fleet,
    parse_borders,
    parse_world_update,
)
from .session_loader import (
    get_playback_files,
    iterate_session_packets,
    iterate_world_updates,
)
from .kinematics import (
    simulate_discrete_step,
    compute_trajectory_loss,
    compute_trajectory_rmse,
)

__all__ = [
    "BinaryReader",
    "parse_variable_header",
    "parse_cell",
    "parse_fleet",
    "parse_borders",
    "parse_world_update",
    "get_playback_files",
    "iterate_session_packets",
    "iterate_world_updates",
    "simulate_discrete_step",
    "compute_trajectory_loss",
    "compute_trajectory_rmse",
]
