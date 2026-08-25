# Physics Analysis, Kinematics & Reverse Engineering Framework

This directory contains research scripts, binary telemetry decoders, simulation test harnesses, and automated calibration routines to reverse-engineer and match the **Spaceone.io Remake** C# simulation against authentic gameplay session recordings (`reference/space1-original/server-ansible/record/playback/`).

---

## 📂 Architecture & Tooling

```
analysis/
├── core/                                        # Reusable telemetry parsers & math library
│   ├── binary_reader.py                         # Endian & vbyte stream decoder
│   ├── packet_parser.py                         # WorldUpdate, Fleet, Cell & Borders schema decoders
│   ├── session_loader.py                        # Multi-file playback session iterators & batch loaders
│   └── kinematics.py                            # C# step simulation, trajectory RMSE & loss formulation
├── experiments/                                 # Phase-aligned reverse-engineering experiment suites
│   ├── 01_invariants/                           # Phase 1: Physical constants & absolute time invariants
│   │   └── bullet_lifetimes/
│   │       ├── measure_lifetimes.py             # 41-session empirical bullet lifetime extraction pipeline
│   │       ├── fit_models.py                    # Regressions (Linear vs Power vs Log) & C# table generator
│   │       └── validate_viewport.py             # AOI boundary & camera distance validation
│   └── 02_movement_models/                      # Phase 2: Single-ship motion models & trajectory tracking
│       ├── kinematic_calibration.py             # Speed profiler across fleet sizes (cruise vs dash)
│       ├── compare_trajectories.py              # Discrete C# simulation vs ground truth RMSE benchmark
│       └── generate_comparison_report.py       # Interactive Plotly visualizer (paths & speed curves)
├── datasets/                                    # Persisted datasets, metrics & HTML reports
│   ├── bullet_lifetime_experiment_results.json  # 41-session empirical bullet lifetime dataset (27k full shots)
│   ├── kinematic_calibration_results.json       # Empirical speeds & candidate physics presets
│   ├── recording_vs_simulation_comparison.json  # 291-track trajectory tracking loss metrics
│   └── kinematic_comparison_report.html         # Interactive Plotly visualizer (paths & speeds)
└── README.md                                    # This documentation & reverse-engineering guide
```

---

## 📦 Binary Playback Protocol & Dataset Specification

The authentic recordings in `reference/space1-original/server-ansible/record/playback/*` are raw WebSocket network capture streams recorded directly on the original game server.

### 1. Frame Structure
Each frame in a `.playback` file consists of a 12-byte header followed by a variable-length binary payload:
```
[ High Timestamp (uint32) | Low Timestamp (uint32) | Payload Length (uint32) ]
[ Payload (N bytes) ... ]
```

### 2. Variable Header & Message Types
The payload begins with a variable-length vbyte header:
- Header bytes containing message sequence markers.
- `0x10`: **World Update** (primary game state packet containing fleets, cells, projectiles, and food).
- `0x11`: **Ping / Heartbeat**.
- `0x12`: **Leaderboard / Scoreboard Update**.

### 3. World Update (0x10) Schema
- `shouldRenderLeader` (uint8) & `(leader_x, leader_y)` (float32).
- `numValidBoids` (uint16), `isDangerZone` (uint8), `cooldownPerc` (float64), `foodForNextBoid` (uint8).
- `numFleets` (uint32) $\to$ List of Fleets:
  - `id` (uint32), `fleetSizeOnServer` (uint16), `(bcx, bcy)` (int32 centroid), `flags` (isDashing bitmask), `selectedSet` (ship skin).
  - List of Cells (Ships and Bullets):
    - `id` (uint32), `x, y` (int32), `velX, velY` (int16), `size` (uint8), `isBullet` (bool).
- `numOtherCells` (uint32) $\to$ List of Food Orbs (`id, x, y, size, color`).
- `borders` $\to$ Arena bounds (`minX, minY, maxX, maxY, deadMinX, deadMinY, deadMaxX, deadMaxY`).

---

## 📊 Empirical Telemetry Ground Truth (Spaceone.io)

Extracted from over **3.8M ship frames**, **413k food orbs**, and **112k laser snapshots** across 41 authentic server sessions:

### 1. Coordinate Space & Arena Geometry
- **Server Tick Interval**: $\Delta t = 40.0\text{ ms}$ ($25\text{ ticks/s}$, $25\text{ Hz}$).
- **Arena Boundaries**: Square domain $[-6324.56, +6324.56]$ (total width/height $= 12,649.11\text{ units} \approx 4000\sqrt{10}$).
- **Danger Zone / Decay Zone**: Starts at $|X|, |Y| \ge 5574.56$ ($750.0\text{ unit}$ safe-to-death margin).

### 2. Physical Hitbox Radiuses
- **Ship Hitbox Radius**: $r_{\text{ship}} = 20\text{ units}$ (Diameter $= 40\text{ units}$).
- **Bullet / Laser Hitbox Radius**: $r_{\text{bullet}} = 30\text{ units}$ (Diameter $= 60\text{ units}$).
- **Food / Fish Radius**: $r_{\text{food}} = 10\text{ units}$ (Diameter $= 20\text{ units}$).

### 3. Empirical Kinematic Lookup Tables

#### Ship Cruise & Dash Speeds vs. Fleet Size ($N$):
| Fleet Size ($N$) | Empirical Cruise ($px/\text{tick}$) | World Speed ($px/\text{s}$) | Dash Speed ($px/\text{s}$) | `BaseThrust[N]` Table Value |
| :--- | :--- | :--- | :--- | :--- |
| **1** | $13.60$ | $340.0$ | $642.7$ | $13.600$ |
| **2** | $13.04$ | $326.0$ | $549.4$ | $11.799$ |
| **3** | $12.04$ | $301.0$ | $509.9$ | $10.857$ |
| **5** | $11.31$ | $282.8$ | $500.0$ | $9.778$ |
| **10** | $10.00$ | $250.0$ | $403.1$ | $8.483$ |
| **20** | $9.22$ | $230.5$ | $325.0$ | $7.359$ |

#### Projectile Lifespan & Velocity Benchmarks:
- **Median Bullet Speed**: $19.31\text{ px/tick}$ ($482.8\text{ px/s}$).
- **Cruise Ratio**: $v_{\text{bullet}} / v_{\text{ship}} \approx 2.0\times - 2.5\times$.
- **Bullet Lifespan ($\tau_{\text{life}}$)**: Sublinear table `Hook.BulletLifeTable[N]` ($N=1: 1560\text{ ms}, N=3: 1840\text{ ms}, N=10: 2240\text{ ms}, N=20: 2640\text{ ms}, N=45: 3040\text{ ms}$), with continuous fallback $\tau = 1985 + 25 \cdot N\text{ ms}$.
- **Shot Cooldown ($\tau_{\text{cooldown}}$)**: Discrete formula $K(N) = 13 + N - \lfloor \frac{N+4}{10} \rfloor\text{ ticks}$ ($\tau = K(N) \cdot 40\text{ ms}$), verified across 4,467 cooldown cycles and 36,389 frames (100.00% exact match). ($N=1: 560\text{ ms}, N=3: 640\text{ ms}, N=5,6: 720\text{ ms}, N=10: 880\text{ ms}, N=20: 1240\text{ ms}, N=50: 2320\text{ ms}$).

---

## 🧠 Key Findings & Architectural Conclusions

### Why Simultaneous Macro-Rescaling Failed
1. **Coupled Physics & Drag Mechanics**:
   In Daud.io-based engines, a ship's velocity is not set directly; it is the steady-state equilibrium of thrust and continuous drag:
   $$v_{\text{terminal}} = \frac{T \cdot \text{Drag}}{1 - \text{Drag}}$$
   When attempting to rescale world coordinates, zoom, sprite sizes, and speed simultaneously, modifying thrust multipliers or drag constants produced compounding side-effects:
   - Increasing drag made turn arcs too sharp and snapped heading unnaturally.
   - Adjusting converters without accounting for camera FOV distorted visual speed across screen pixels.
   - Bullets (which set velocity directly) became disconnected from ship momentum, causing boosted ships to outrun their own fire or triggering premature mid-air explosion animations.

2. **The Movement Physics Might Not Be Pure Drag**:
   Original Spaceone was built in Rust/C++ compiled to WebAssembly. The actual server movement model may be a direct step-integrated velocity with turning rate limits or constant-speed kinematics, rather than continuous exponential drag damping.

---

## 🎯 Step-by-Step Reverse Engineering Roadmap

To systematically build an authentic remake without compounding errors, future physics work will proceed in strict isolated stages:

```
[ Phase 1: Absolute Invariants ] ➔ [ Phase 2: Core Movement Model ] ➔ [ Phase 3: Fleet & Follower Dynamics ] ➔ [ Phase 4: Viewport & Pacing ]
```

### Phase 1: Absolute Invariants (Easiest, Absolute Units)
- **Bullet Lifespan & Range**: [DONE] Calibrated to discrete empirical table `Hook.BulletLifeTable[N]` ($1560\text{ ms} - 3040\text{ ms}$) verified across 27,127 full shots (`analysis/datasets/bullet_lifetime_experiment_results.json`).
- **Cooldown Times**: [DONE] Calibrated to exact discrete formula $K(N) = 13 + N - \lfloor \frac{N+4}{10} \rfloor\text{ ticks}$ ($\tau = K(N) \cdot 40\text{ ms}$) verified across 4,467 cooldown events (`analysis/datasets/shot_cooldown_experiment_results.json`).
- **Tick Frequency**: Fixed 25Hz ($40\text{ ms}$) protocol synchronization.

### Phase 2: Reverse-Engineering the Core Movement Model
- Isolate single-ship ($N=1$) straight flight and turn trajectories from playback recordings.
- Test candidate motion models against empirical trajectories:
  - Model A: Discrete drag damping ($\vec{v}_{t+1} = (\vec{v}_t + \vec{a}) \cdot d$).
  - Model B: Heading-oriented kinematic velocity ($\vec{v} = v_{\text{target}}(\cos\theta, \sin\theta)$ with max angular speed $\omega$).
  - Model C: Acceleration-clamped momentum.
- Select the model with minimum trajectory RMSE before touching any multi-ship parameters.

### Phase 3: Fleet Swarm & Follower Dynamics
- Extract follower ship offsets relative to the leader during steady cruise, acceleration, and sharp turns.
- Calibrate separation distance, cohesion springs, and trailing alignment independently from single-ship kinematics.

### Phase 4: Viewport, Camera & Visual Pacing
- Harmonize client camera FOV, rendering scale, and sprite proportions only after the underlying movement and swarm mechanics are verified.
