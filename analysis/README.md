# Physics Analysis, Kinematics & ML Tuning

This directory contains research scripts, experiment harnesses, telemetry extractors, and parameter optimization routines to calibrate the **Spaceone.io Remake** C# simulation against original gameplay session recordings (`reference/space1-original/server-ansible/record/playback/`).

---

## 📂 Architecture & Workflow

```
analysis/
├── datasets/                 # Extracted trajectory features, velocity profiles, time series
├── experiments/              # Kinematic experiment scripts & telemetry extractors
│   └── extract_telemetry.py  # Binary playback decoder & statistical kinematic profiler
└── optimization/             # Loss functions & ML parameter fitting algorithms
```

---

## 📊 Empirical Telemetry Ground Truth (Spaceone.io)

Extracted from over **3.8M ship frames**, **413k food orbs**, and **95k laser snapshots** from authentic server recordings:

### 1. Coordinate Space & Arena Geometry
- **Server Tick Interval**: $\Delta t = 40.0\text{ ms}$ ($25\text{ ticks/s}$, $25\text{ Hz}$).
- **Arena Boundaries**: Square domain $[-6324.56, +6324.56]$ (total width/height $= 12,649.11\text{ units} \approx 4000\sqrt{10}$).
- **Danger Zone / Decay Zone**: Starts at $|X|, |Y| \ge 5574.56$ ($750.0\text{ unit}$ safe-to-death margin).

### 2. Collision Radiuses & Geometry
- **Ship Radius**: $r_{\text{ship}} = 20\text{ units}$ (Diameter $= 40\text{ units}$).
- **Bullet / Laser Radius**: $r_{\text{bullet}} = 30\text{ units}$ (Diameter $= 60\text{ units}$).
- **Food / Fish Radius**: $r_{\text{food}} = 10\text{ units}$ (Diameter $= 20\text{ units}$).

### 3. Kinematic Unit Translation & Tables
The original server tables (`BaseThrust` and `ShotThrust`) specify displacement per **$40\text{ ms}$ tick**.
To convert to continuous velocity in units/second:
$$v_{\text{world/s}} = v_{\text{telemetry}} \times 25.0$$

In the C# simulation tick loop ($t$ in milliseconds):
$$v_{\text{momentum}} = \text{Thrust} \times \text{Converter} = \text{Thrust} \times 0.025\text{ ms}^{-1}$$

#### Empirical Speed Benchmarks:
| Fleet Size ($N$) | Telemetry Cruise ($px/\text{tick}$) | World Speed ($px/\text{s}$) | `BaseThrust[N]` Table Value |
| :--- | :--- | :--- | :--- |
| **1** | $13.42$ | $335.4$ | $13.600$ |
| **2** | $13.00$ | $325.0$ | $11.799$ |
| **3** | $12.17$ | $304.1$ | $10.857$ |
| **5** | $11.18$ | $279.5$ | $9.778$ |
| **10** | $9.22$ | $230.5$ | $8.483$ |
| **20** | $8.06$ | $201.6$ | $7.359$ |
| **30** | $7.21$ | $180.3$ | $6.772$ |

#### Laser Velocity Benchmarks:
| Fleet Size ($N$) | Laser Velocity ($px/\text{tick}$) | World Speed ($px/\text{s}$) | `ShotThrust[N]` Table Value |
| :--- | :--- | :--- | :--- |
| **1** | $25.94$ | $648.6$ | $41.000$ |
| **2** | $35.00$ | $875.0$ | $34.167$ |
| **3** | $31.14$ | $778.6$ | $30.711$ |
| **5** | $26.25$ | $656.2$ | $26.851$ |
| **10** | $21.21$ | $530.3$ | $22.376$ |

---

## 🛠️ Telemetry Extraction CLI

Run the extraction tool across reference playback streams:
```bash
python analysis/experiments/extract_telemetry.py --playback-dir reference/space1-original/server-ansible/record/playback
```

---

## 🔬 Next Calibration Milestones

1. **Continuous Drag $\gamma$ & Acceleration Step Response**: Fit exponential acceleration profiles $v(t) = v_{\max}(1 - e^{-\gamma t})$ on recorded dash/boost and rest-to-cruise transitions.
2. **Follower Flocking & Fleet Cohesion**: Optimize separation, cohesion, and leader-follow steering heuristics in `Game.Engine/Core/Steering/FleetMath.cs`.
3. **Rotational Agility & Turret Tracking**: Characterize maximum angular rate $\omega_{\max}$ and angular damping $\alpha$ from mouse-turn telemetry sequences.
