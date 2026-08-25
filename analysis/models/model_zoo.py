#!/usr/bin/env python3
"""
Movement Model Zoo for Spaceone.io Reverse Engineering.

Defines 8 distinct mathematical movement paradigms with a unified interface:
1. LinearDragNewtonianModel (Baseline Daud.io / Classic linear drag)
2. FrictionlessClampedModel (Zero-G clamped velocity)
3. ReynoldsSteeringModel (Craig Reynolds steering force with max acceleration clamp)
4. VelocityLerpModel (Velocity interpolation / exponential responsiveness)
5. KinematicTurningModel (Speed cruise with angular rate limit)
6. ThrustSlewLagModel (Thrust direction slew / lag + Newtonian momentum)
7. AnisotropicDragModel (Longitudinal vs Lateral independent drag coefficients)
8. QuadraticDragModel (Aerodynamic / fluid speed-squared damping)
"""

import math
from abc import ABC, abstractmethod
from typing import Dict, List, Tuple, Any, Optional
import numpy as np


def wrap_angle(angle: float) -> float:
    """Wraps angle into [-pi, pi]."""
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


class BaseMovementModel(ABC):
    def __init__(self, name: str, params: Optional[Dict[str, float]] = None):
        self.name = name
        self.params: Dict[str, float] = params or {}

    @property
    @abstractmethod
    def param_names(self) -> List[str]:
        pass

    @property
    @abstractmethod
    def param_bounds(self) -> List[Tuple[float, float]]:
        pass

    @abstractmethod
    def get_initial_params(self) -> List[float]:
        pass

    def set_params_from_array(self, param_values: List[float]):
        for name, val in zip(self.param_names, param_values):
            self.params[name] = float(val)

    def get_params_array(self) -> List[float]:
        return [self.params[name] for name in self.param_names]

    @abstractmethod
    def simulate_step(
        self,
        pos: np.ndarray,
        vel: np.ndarray,
        target_heading: np.ndarray,
        state: Optional[Dict[str, Any]] = None,
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        """
        Executes one discrete simulation tick (40 ms).
        Returns (new_pos, new_vel, new_state).
        """
        pass

    def simulate_trajectory(
        self,
        initial_pos: np.ndarray,
        initial_vel: np.ndarray,
        target_headings: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Simulates trajectory over N steps given initial state and sequence of target headings.
        target_headings shape: (N, 2)
        Returns: (positions: (N+1, 2), velocities: (N+1, 2))
        """
        n_steps = len(target_headings)
        positions = np.zeros((n_steps + 1, 2), dtype=np.float64)
        velocities = np.zeros((n_steps + 1, 2), dtype=np.float64)

        positions[0] = initial_pos
        velocities[0] = initial_vel
        state: Dict[str, Any] = {}

        curr_pos = np.copy(initial_pos)
        curr_vel = np.copy(initial_vel)

        for t in range(n_steps):
            u_t = target_headings[t]
            curr_pos, curr_vel, state = self.simulate_step(curr_pos, curr_vel, u_t, state)
            positions[t + 1] = curr_pos
            velocities[t + 1] = curr_vel

        return positions, velocities


# --------------------------------------------------------------------------
# Model 1: Classical Newtonian with Linear Drag
# --------------------------------------------------------------------------
class LinearDragNewtonianModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__("Linear Drag Newtonian", params or {"thrust": 1.6, "drag": 0.88})

    @property
    def param_names(self) -> List[str]:
        return ["thrust", "drag"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(0.01, 10.0), (0.50, 0.999)]

    def get_initial_params(self) -> List[float]:
        return [self.params.get("thrust", 1.6), self.params.get("drag", 0.88)]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        T = self.params["thrust"]
        d = self.params["drag"]
        new_vel = (vel + T * target_heading) * d
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 2: Frictionless Newtonian with Velocity Clamping
# --------------------------------------------------------------------------
class FrictionlessClampedModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__("Frictionless Clamped", params or {"accel": 1.2, "v_max": 13.5})

    @property
    def param_names(self) -> List[str]:
        return ["accel", "v_max"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(0.01, 10.0), (1.0, 35.0)]

    def get_initial_params(self) -> List[float]:
        return [self.params.get("accel", 1.2), self.params.get("v_max", 13.5)]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        a = self.params["accel"]
        v_max = self.params["v_max"]
        v_temp = vel + a * target_heading
        speed = math.hypot(v_temp[0], v_temp[1])
        if speed > v_max:
            new_vel = v_temp * (v_max / (speed + 1e-9))
        else:
            new_vel = v_temp
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 3: Craig Reynolds Steering Force (Classic Boids)
# --------------------------------------------------------------------------
class ReynoldsSteeringModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__("Reynolds Steering Force", params or {"v_max": 13.5, "max_force": 1.6})

    @property
    def param_names(self) -> List[str]:
        return ["v_max", "max_force"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(1.0, 35.0), (0.01, 10.0)]

    def get_initial_params(self) -> List[float]:
        return [self.params.get("v_max", 13.5), self.params.get("max_force", 1.6)]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        v_max = self.params["v_max"]
        max_force = self.params["max_force"]
        v_desired = v_max * target_heading
        f_steer = v_desired - vel
        f_mag = math.hypot(f_steer[0], f_steer[1])
        if f_mag > max_force:
            f_applied = f_steer * (max_force / (f_mag + 1e-9))
        else:
            f_applied = f_steer
        new_vel = vel + f_applied
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 4: Velocity Lerp / Exponential Smoothing
# --------------------------------------------------------------------------
class VelocityLerpModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__("Velocity Lerp Interpolation", params or {"v_max": 13.5, "alpha": 0.12})

    @property
    def param_names(self) -> List[str]:
        return ["v_max", "alpha"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(1.0, 35.0), (0.001, 0.999)]

    def get_initial_params(self) -> List[float]:
        return [self.params.get("v_max", 13.5), self.params.get("alpha", 0.12)]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        v_max = self.params["v_max"]
        alpha = self.params["alpha"]
        v_desired = v_max * target_heading
        new_vel = vel + alpha * (v_desired - vel)
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 5: Kinematic Turning with Angular Rate Limit
# --------------------------------------------------------------------------
class KinematicTurningModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__("Kinematic Turning Limited", params or {"v_max": 13.5, "max_turn_rate": 0.15})

    @property
    def param_names(self) -> List[str]:
        return ["v_max", "max_turn_rate"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(1.0, 35.0), (0.01, 3.1415)]

    def get_initial_params(self) -> List[float]:
        return [self.params.get("v_max", 13.5), self.params.get("max_turn_rate", 0.15)]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        v_max = self.params["v_max"]
        max_rate = self.params["max_turn_rate"]
        target_ang = math.atan2(target_heading[1], target_heading[0])
        speed = math.hypot(vel[0], vel[1])
        curr_ang = math.atan2(vel[1], vel[0]) if speed > 1e-3 else target_ang
        diff = wrap_angle(target_ang - curr_ang)
        diff_clamped = max(-max_rate, min(max_rate, diff))
        new_ang = curr_ang + diff_clamped
        new_vel = np.array([v_max * math.cos(new_ang), v_max * math.sin(new_ang)], dtype=np.float64)
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 6: Thrust Direction Slew (Angular Lag) + Newtonian Momentum
# --------------------------------------------------------------------------
class ThrustSlewLagModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__("Thrust Slew Lag + Momentum", params or {"thrust": 1.6, "drag": 0.88, "slew_rate": 0.25})

    @property
    def param_names(self) -> List[str]:
        return ["thrust", "drag", "slew_rate"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(0.01, 10.0), (0.50, 0.999), (0.01, 3.1415)]

    def get_initial_params(self) -> List[float]:
        return [self.params.get("thrust", 1.6), self.params.get("drag", 0.88), self.params.get("slew_rate", 0.25)]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        T = self.params["thrust"]
        d = self.params["drag"]
        slew_rate = self.params["slew_rate"]
        st = state or {}

        target_ang = math.atan2(target_heading[1], target_heading[0])
        thrust_ang = st.get("thrust_ang", target_ang)

        diff = wrap_angle(target_ang - thrust_ang)
        diff_clamped = max(-slew_rate, min(slew_rate, diff))
        new_thrust_ang = thrust_ang + diff_clamped

        thrust_vec = np.array([math.cos(new_thrust_ang), math.sin(new_thrust_ang)]) * T
        new_vel = (vel + thrust_vec) * d
        new_pos = pos + new_vel

        new_state = {"thrust_ang": new_thrust_ang}
        return new_pos, new_vel, new_state


# --------------------------------------------------------------------------
# Model 7: Anisotropic Drag (Longitudinal vs Lateral Friction)
# --------------------------------------------------------------------------
class AnisotropicDragModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__(
            "Anisotropic Drag (Normal/Lateral)",
            params or {"thrust": 1.6, "drag_long": 0.88, "drag_lat": 0.80},
        )

    @property
    def param_names(self) -> List[str]:
        return ["thrust", "drag_long", "drag_lat"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(0.01, 10.0), (0.50, 0.999), (0.30, 0.999)]

    def get_initial_params(self) -> List[float]:
        return [
            self.params.get("thrust", 1.6),
            self.params.get("drag_long", 0.88),
            self.params.get("drag_lat", 0.80),
        ]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        T = self.params["thrust"]
        d_long = self.params["drag_long"]
        d_lat = self.params["drag_lat"]

        u_long = target_heading
        u_lat = np.array([-target_heading[1], target_heading[0]])

        # Decompose velocity along heading and normal
        v_long = float(np.dot(vel, u_long))
        v_lat = float(np.dot(vel, u_lat))

        # Update components
        new_v_long = (v_long + T) * d_long
        new_v_lat = v_lat * d_lat

        new_vel = new_v_long * u_long + new_v_lat * u_lat
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 8: Aerodynamic / Quadratic Drag
# --------------------------------------------------------------------------
class QuadraticDragModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__("Quadratic (Aerodynamic) Drag", params or {"thrust": 1.8, "c_drag": 0.009})

    @property
    def param_names(self) -> List[str]:
        return ["thrust", "c_drag"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(0.01, 15.0), (0.0001, 0.10)]

    def get_initial_params(self) -> List[float]:
        return [self.params.get("thrust", 1.8), self.params.get("c_drag", 0.009)]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        T = self.params["thrust"]
        c_d = self.params["c_drag"]
        speed = math.hypot(vel[0], vel[1])
        # dv = T * u - c_d * |v| * v
        drag_force = c_d * speed * vel
        new_vel = vel + T * target_heading - drag_force
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 9: Turn Rate Limited with Dynamic Speed Dip
# --------------------------------------------------------------------------
class TurnRateWithSpeedDipModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__(
            "Turn Rate Limited + Speed Dip",
            params or {"v_max": 14.3, "max_turn_rate": 0.14, "speed_dip": 0.25},
        )

    @property
    def param_names(self) -> List[str]:
        return ["v_max", "max_turn_rate", "speed_dip"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(1.0, 35.0), (0.01, 3.1415), (0.0, 0.90)]

    def get_initial_params(self) -> List[float]:
        return [
            self.params.get("v_max", 14.3),
            self.params.get("max_turn_rate", 0.14),
            self.params.get("speed_dip", 0.25),
        ]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        v_max = self.params["v_max"]
        max_rate = self.params["max_turn_rate"]
        dip = self.params["speed_dip"]

        target_ang = math.atan2(target_heading[1], target_heading[0])
        speed = math.hypot(vel[0], vel[1])
        curr_ang = math.atan2(vel[1], vel[0]) if speed > 1e-3 else target_ang
        diff = wrap_angle(target_ang - curr_ang)
        diff_clamped = max(-max_rate, min(max_rate, diff))
        new_ang = curr_ang + diff_clamped

        # Speed decreases with the magnitude of angular steering deviation
        effective_speed = v_max * (1.0 - dip * (abs(diff) / math.pi))
        new_vel = np.array(
            [effective_speed * math.cos(new_ang), effective_speed * math.sin(new_ang)],
            dtype=np.float64,
        )
        new_pos = pos + new_vel
        return new_pos, new_vel, state or {}


# --------------------------------------------------------------------------
# Model 10: Heading Lag + Clamped Newtonian (Bounded Turn Force)
# --------------------------------------------------------------------------
class HeadingLagClampedNewtonianModel(BaseMovementModel):
    def __init__(self, params: Optional[Dict[str, float]] = None):
        super().__init__(
            "Heading Lag + Clamped Newtonian",
            params or {"v_max": 14.3, "accel": 2.5, "turn_rate": 0.18},
        )

    @property
    def param_names(self) -> List[str]:
        return ["v_max", "accel", "turn_rate"]

    @property
    def param_bounds(self) -> List[Tuple[float, float]]:
        return [(1.0, 35.0), (0.01, 10.0), (0.01, 3.1415)]

    def get_initial_params(self) -> List[float]:
        return [
            self.params.get("v_max", 14.3),
            self.params.get("accel", 2.5),
            self.params.get("turn_rate", 0.18),
        ]

    def simulate_step(
        self, pos: np.ndarray, vel: np.ndarray, target_heading: np.ndarray, state: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
        v_max = self.params["v_max"]
        accel = self.params["accel"]
        turn_rate = self.params["turn_rate"]
        st = state or {}

        target_ang = math.atan2(target_heading[1], target_heading[0])
        thrust_ang = st.get("thrust_ang", target_ang)

        diff = wrap_angle(target_ang - thrust_ang)
        diff_clamped = max(-turn_rate, min(turn_rate, diff))
        new_thrust_ang = thrust_ang + diff_clamped

        thrust_vec = np.array([math.cos(new_thrust_ang), math.sin(new_thrust_ang)]) * accel
        v_temp = vel + thrust_vec
        speed = math.hypot(v_temp[0], v_temp[1])
        if speed > v_max:
            new_vel = v_temp * (v_max / (speed + 1e-9))
        else:
            new_vel = v_temp
        new_pos = pos + new_vel

        new_state = {"thrust_ang": new_thrust_ang}
        return new_pos, new_vel, new_state


def get_all_models() -> List[BaseMovementModel]:
    return [
        LinearDragNewtonianModel(),
        FrictionlessClampedModel(),
        ReynoldsSteeringModel(),
        VelocityLerpModel(),
        KinematicTurningModel(),
        ThrustSlewLagModel(),
        AnisotropicDragModel(),
        QuadraticDragModel(),
        TurnRateWithSpeedDipModel(),
        HeadingLagClampedNewtonianModel(),
    ]

