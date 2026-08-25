"""
Kinematics & Discrete Physics Utilities for Spaceone.io Analysis.
Implements C# server step emulation, trajectory loss formulations, and finite difference profilers.
"""

from typing import Tuple, Optional
import numpy as np


def simulate_discrete_step(
    pos: np.ndarray,
    vel: np.ndarray,
    thrust: np.ndarray,
    drag: float,
    dt_ms: float = 40.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Exact discrete simulation step from Game.Engine/Core/Ship.cs:
    v_{t+1} = (v_t + thrust) * drag
    p_{t+1} = p_t + v_{t+1} * dt
    """
    new_vel = (vel + thrust) * drag
    new_pos = pos + new_vel * dt_ms
    return new_pos, new_vel


def compute_trajectory_loss(
    sim_positions: np.ndarray,
    true_positions: np.ndarray,
    weights: Optional[np.ndarray] = None,
) -> float:
    """
    Mean Squared Error across trajectory positions.
    """
    diffs = sim_positions - true_positions
    squared_errors = np.sum(diffs**2, axis=-1)
    if weights is not None:
        return float(np.average(squared_errors, weights=weights))
    return float(np.mean(squared_errors))


def compute_trajectory_rmse(
    sim_positions: np.ndarray, true_positions: np.ndarray
) -> float:
    """
    Root Mean Squared Error (RMSE) in world units.
    """
    return float(np.sqrt(compute_trajectory_loss(sim_positions, true_positions)))
