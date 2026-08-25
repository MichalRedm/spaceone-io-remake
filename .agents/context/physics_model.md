# Physics and Kinematic Simulation Model

## 1. Kinematic Equations of Motion & Timestep

The authoritative C# simulation runs a fixed-rate tick loop with **$\Delta t = 40.0\text{ ms}$** ($25\text{ ticks/s}$, $25\text{ Hz}$), matching the original Spaceone.io server.

Entity movement in `Body.cs` and `Ship.cs` is currently evaluated over discrete tick intervals using a momentum/drag loop:

$$\vec{v}_{t+1} = (\vec{v}_t + \vec{a}_{\text{thrust}} \cdot \Delta t) \cdot \text{Drag}$$
$$\vec{r}_{t+1} = \vec{r}_t + \vec{v}_{t+1} \cdot \Delta t$$

where:
- $\vec{r}_t$: Entity 2D position vector $(x, y)$ in world units.
- $\vec{v}_t$: Entity velocity / momentum vector in world units per millisecond.
- $\vec{a}_{\text{thrust}}$: Applied thrust vector pointing towards heading angle $\theta$.

---

## 2. Empirical Ground-Truth Findings (From 41 Binary Playback Sessions)

Extracted from over **3.8M ship frames**, **413k food orbs**, and **112k laser snapshots** (`reference/space1-original/server-ansible/record/playback/*`):

### Coordinate Space & Arena Geometry
- **Domain**: Square domain $[-6324.56, +6324.56]$ (total width/height $= 12,649.11\text{ units} \approx 4000\sqrt{10}$).
- **Danger Buffer**: Starts at $|X|, |Y| \ge 5574.56$ ($750.0\text{ unit}$ margin to outer boundary).
- **Physical Radiuses**: Ship hitbox radius $r_{\text{ship}} = 20\text{ units}$, Bullet radius $r_{\text{bullet}} = 30\text{ units}$, Food radius $r_{\text{food}} = 10\text{ units}$.

### Measured Velocity Profile vs. Fleet Size ($N$)
| Fleet Size $N$ | Empirical Cruise ($px/\text{tick}$) | World Speed ($px/\text{s}$) | Dash Speed ($px/\text{s}$) | `BaseThrust[N]` Table Value |
| :--- | :--- | :--- | :--- | :--- |
| **1** | $13.60$ | $340.0$ | $642.7$ | $13.600$ |
| **2** | $13.04$ | $326.0$ | $549.4$ | $11.799$ |
| **3** | $12.04$ | $301.0$ | $509.9$ | $10.857$ |
| **5** | $11.31$ | $282.8$ | $500.0$ | $9.778$ |
| **10** | $10.00$ | $250.0$ | $403.1$ | $8.483$ |
| **20** | $9.22$ | $230.5$ | $325.0$ | $7.359$ |

### Projectile Velocity & Lifespan
- **Median Bullet Speed**: $19.31\text{ px/tick}$ ($482.8\text{ px/s}$).
- **Velocity Differential**: Bullet-to-cruise speed ratio $\approx 2.0\times - 2.5\times$.
- **Lifespan**: Empirical sublinear table `Hook.BulletLifeTable[N]` ($N=1: 1560\text{ ms}, N=3: 1840\text{ ms}, N=10: 2240\text{ ms}, N=20: 2640\text{ ms}, N=45: 3040\text{ ms}$), with linear regression fallback $\tau_{\text{life}} = \text{BulletLifeB} + \text{BulletLifeM} \cdot N = 1985\text{ ms} + 25\text{ ms} \cdot N$.
- **Cooldown**: Exact empirical discrete closed-form formula $K(N) = 13 + N - \lfloor \frac{N+4}{10} \rfloor \text{ ticks}$ ($\tau_{\text{cooldown}} = K(N) \cdot 40\text{ ms}$), verified across 4,467 cooldown cycles and 36,389 step frames (100.00% exact match). ($N=1: 560\text{ ms}, N=3: 640\text{ ms}, N=5,6: 720\text{ ms}, N=10: 880\text{ ms}, N=20: 1240\text{ ms}, N=50: 2320\text{ ms}$).

---

## 3. Reverse-Engineering Insights & Architectural Decisions

### Why Macro-Rescaling & Drag Tuning Were Reverted
1. **Coupling Dilemma in Continuous Drag**:
   In continuous drag systems, velocity is governed by $v_{\text{terminal}} = \frac{T \cdot \text{Drag}}{1 - \text{Drag}}$. Modifying `Drag` to tune turn radius simultaneously alters top speed, acceleration time, and follower spring dynamics. Attempting to tune drag, thrust, camera FOV, and sprite dimensions simultaneously created uncontrollable side-effects and broke visual proportions.
2. **Underlying Physics May Not Be Pure Drag**:
   Original Spaceone was compiled from Rust/C++ to WebAssembly. The true motion model may be a direct kinematic step (constant speed with bounded angular turning rates) rather than exponential drag damping.

---

## 4. Step-by-Step Reverse-Engineering Strategy

Future physics tuning will follow a modular, isolated sequence:

1. **Phase 1: Absolute Invariants (Completed)**:
   - **Bullet Lifetimes ($\tau_{\text{life}}$)**: [DONE] Fully calibrated to discrete empirical table `Hook.BulletLifeTable[N]` ($1560\text{ ms} \dots 3040\text{ ms}$) verified across 27,127 full trajectories from 41 playback sessions.
   - **Firing Cooldowns ($\tau_{\text{cooldown}}$)**: [DONE] Fully calibrated to exact discrete integer formula $K(N) = 13 + N - \lfloor \frac{N+4}{10} \rfloor \text{ ticks}$ ($\tau = K(N) \cdot 40\text{ ms}$) verified across 36,389 step frames from 41 playback sessions.
   - **Server Timestep ($\Delta t$)**: Authoritative fixed 25Hz ($40.0\text{ ms}$).
2. **Phase 2: Single-Ship Motion Model Identification**:
   - Isolate single-ship ($N=1$) turn and straight trajectories from playback data.
   - Benchmark discrete drag vs. kinematic heading velocity models to determine the true underlying motion equation before tuning multi-ship parameters.
3. **Phase 3: Fleet Swarm & Formation Dynamics**:
   - Calibrate flocking separation, cohesion springs, and trailing alignment independently.
4. **Phase 4: Global Game Pacing & Viewport Alignment**:
   - Harmonize camera FOV and visual rendering scales only after core simulation mechanics achieve minimal trajectory RMSE.
