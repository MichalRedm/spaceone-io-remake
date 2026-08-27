# Physics and Kinematic Simulation Model

## 1. Kinematic Equations of Motion & Timestep

The authoritative C# simulation runs a fixed-rate tick loop with **$\Delta t = 40.0\text{ ms}$** ($25\text{ ticks/s}$, $25\text{ Hz}$), matching the original Spaceone.io server.

### Authoritative Kinematic Turning Model (`Ship.cs`, `Hook.cs`)
Entity movement is governed by **bounded angular turn-rate kinematics with cruise speed clamping, dynamic turn speed dip, and 3-phase rocket boost**:

1. **Angular Steering Deviation**:
   $$\theta_{\text{target}} = \operatorname{atan2}(u_y, u_x)$$
   $$\theta_{v, t} = \operatorname{atan2}(v_{y, t}, v_{x, t})$$
   $$\Delta\theta_t = \operatorname{wrap}_{[-\pi, \pi]}(\theta_{\text{target}} - \theta_{v, t})$$

2. **Turn Rate Limit**:
   $$\Delta\theta_{\text{clamped}} = \operatorname{clamp}(\Delta\theta_t, -\omega_{\max}, +\omega_{\max})$$
   $$\theta_{v, t+1} = \theta_{v, t} + \Delta\theta_{\text{clamped}}$$
   where $\omega_{\max} = 0.1393\text{ rad/tick}$ ($\approx 7.98^\circ\text{/tick} = 199.5^\circ\text{/s}$) during cruise, and $\omega_{\max, \text{boost}} = 0.0497\text{ rad/tick}$ ($\approx 2.85^\circ\text{/tick} = 71.2^\circ\text{/s}$) during boost.

3. **Cruise Speed & Dynamic Speed Attenuation**:
   $$s_{t+1} = V_{\text{cruise}}(N) \cdot \left(1.0 - c_{\text{dip}} \cdot \frac{|\Delta\theta_t|}{\pi}\right)$$
   where $c_{\text{dip}} = 0.4036$ (max $40.4\%$ speed dip on complete $180^\circ$ U-turn).

4. **3-Phase Kinematic Boost Envelope ($T_{\text{boost}} = 25\text{ ticks} = 1000\text{ ms}$)**:
   $$V_{\text{peak}}(N) = 40.12 - 5.00 \cdot \ln(N) \quad [\text{px/tick}]$$
   $$s(t, N) = \begin{cases}
   V_{\text{cruise}}(N) + \left(V_{\text{peak}}(N) - V_{\text{cruise}}(N)\right) \cdot \left(\frac{t}{4}\right), & 0 \le t \le 4 \quad (0 - 160\text{ ms, Surge Ramp}) \\
   0.77 \cdot V_{\text{peak}}(N), & 5 \le t \le 9 \quad (200 - 360\text{ ms, Sustained Burn}) \\
   0.77 \cdot V_{\text{peak}}(N) - \left(0.77 \cdot V_{\text{peak}}(N) - 0.5 \cdot V_{\text{cruise}}(N)\right) \cdot \left(\frac{t - 9}{15}\right), & 10 \le t \le 24 \quad (400 - 1000\text{ ms, Deceleration})
   \end{cases}$$

   - **Client Visual Synchronization (`renderedObject.ts`, `ship.ts`, `emitters.json`)**:
     - *Phase 1 ($0 - 160\text{ ms}$)*: Particle sprite (`particle_ship_*`) displayed at full alpha ($1.0$), dash trail suppressed ($\alpha = 0.0$), bullet emitter idle.
     - *Phase 2 ($160 - 360\text{ ms}$)*: Steady dash trail with flame flicker, particle sprite active ($1.0$), bullet particles streamed along dash trail at lower frequency than bullets ($f = 0.08\text{ s}$ vs $0.05\text{ s}$).
     - *Phase 3 ($360 - 1000\text{ ms}$)*: Dash trail and particle sprite smoothly fade out ($1.0 \to 0.0$) over the 640ms deceleration phase, ending synchronously with the authoritative server boost.
     - *Fleet Growth & Group Synchronization*: New ships joining during boost or invulnerability inherit `groupBoostTimes`, `groupBoostEndTimes`, and `groupInvulnerableTimes` so visual phases, blinking, and overlay decays match across all fleet ships in lockstep.
     - *Invulnerability + Boost Composition*: When boosting while invulnerable, dash trails remain continuous while hull and aura pulse between full opacity and translucent phantom ($\alpha = 0.25$), with composite aura blending $\alpha = \max(\alpha_{\text{boost}}, \alpha_{\text{invuln}})$.

5. **Velocity Vector & Position Update**:
   $$\vec{v}_{t+1} = s_{t+1} \begin{bmatrix} \cos(\theta_{v, t+1}) \\ \sin(\theta_{v, t+1}) \end{bmatrix}$$
   $$\vec{p}_{t+1} = \vec{p}_t + \vec{v}_{t+1} \cdot \Delta t$$

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

### Projectile Velocity, Lifespan & Cooldown
- **Empirical Velocity Scaling**: Bullets follow a power-law relationship $V_{\text{bullet}}(N) = 41.00 \cdot N^{-0.2633}\text{ px/tick}$ ($1025.0 \cdot N^{-0.2633}\text{ px/s}$ at $25\text{ Hz}$).
- **Speed Ratio Model**: $R(N) = \frac{V_{\text{bullet}}(N)}{V_{\text{ship}}(N)} = 3.015 \cdot N^{-0.0561}$ (ranges from $3.015\times$ at $N=1$ down to $2.30\times$ at $N=100$, median $\approx 2.33\times$).
- **Scale Factor Invariant**: `Hook.ShotThrustConverter = 0.00156f` guarantees $\text{ShotThrustConverter} \times 10 = \text{BaseThrustConverter} \times \text{MaxMomentumCoefficient} = 0.0156$, preserving exact $100.0\%$ authentic bullet-to-ship velocity ratios across all fleet sizes.
- **Lifespan**: Empirical sublinear table `Hook.BulletLifeTable[N]` ($N=1: 1560\text{ ms}, N=3: 1840\text{ ms}, N=10: 2240\text{ ms}, N=20: 2640\text{ ms}, N=45: 3040\text{ ms}$), with linear regression fallback $\tau_{\text{life}} = \text{BulletLifeB} + \text{BulletLifeM} \cdot N = 1985\text{ ms} + 25\text{ ms} \cdot N$.
- **Cooldown**: Exact empirical discrete closed-form formula $K(N) = 13 + N - \lfloor \frac{N+4}{10} \rfloor \text{ ticks}$ ($\tau_{\text{cooldown}} = K(N) \cdot 40\text{ ms}$), verified across 4,467 cooldown cycles and 36,389 step frames (100.00% exact match). ($N=1: 560\text{ ms}, N=3: 640\text{ ms}, N=5,6: 720\text{ ms}, N=10: 880\text{ ms}, N=20: 1240\text{ ms}, N=50: 2320\text{ ms}$).

### Abandoned Ships & Fleet Splitting (`Hook.AbandonedShipLifespan`, `Hook.DragAbandoned`)
- **Empirical Invariant**: Extracted across 3,147 split ship trajectories (`analysis/datasets/abandoned_ship_experiment_results.json`).
- **Persistence Model**: When a fleet dashes/splits (opcode `0x19`), abandoned ships (`isSplitting`, flag 8) lose active engine thrust and drift with low linear damping (`DragAbandoned = 0.98`).
- **Expiration Dynamics**:
  - Abandoned ships do **not** automatically expire after a fixed timeout in the original game; undisturbed instances survived continuously for $67+\text{ s}$ and several minutes as long as the owner was alive.
  - Destruction triggers: (1) Creator fleet / owner death ($100\%$ immediate deletion), (2) projectile collision damage, or (3) active viewport de-synchronization.
- **Remake Setting**: `Hook.AbandonedShipLifespan = 0` (in milliseconds; `0` indicates infinite lifespan matching original game behavior, while positive values enable an optional timeout).

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
3. **Phase 3: Fleet Swarm & Formation Dynamics (Completed)**:
   - **Model**: Kinematic Target Ray Convergence + Pairwise Solid-Disc Position-Based Dynamics (PBD) Relaxation.
   - **Solid Diameter ($D_{\text{solid}}$)**: [DONE] $25.0\text{ px}$ ($r \approx 12.5\text{ px}$, matching the core ship sprite bounds), verified across 80k+ multi-ship frames (`analysis/datasets/flocking_experiment_results.json`).
   - **Push Stiffness ($\alpha_{\text{push}}$)**: $0.60$ with $2$ relaxation iterations per tick.
   - **Ray Convergence & Elongation**: Each ship steers towards mouse ray $\vec{T}_i = \text{AimTarget} + (\text{FleetCenter} - \vec{p}_i)$, generating inward lateral compression that stretches the fleet longitudinally ($L/W$ ratio $1.1\times - 3.5\times$) while solid discs prevent overlap. Fades smoothly within cursor deadzone ($< 30\text{ px}$) to prevent radial divergence during cursor passes.
   - **Unified Turn Direction Synchronization**: Authoritative fleet turn sign ($\text{sign}(\Delta\theta_{\text{fleet}})$) enforces uniform angular sweep on sharp / near-$180^\circ$ U-turns ($|\Delta\theta| > 150^\circ$), completely preventing symmetry-breaking fleet splitting.
   - **Straggler Cohesion ($D_{\text{coh}}, w_{\text{coh}}$)**: Soft inward pull for ships separated beyond $D_{\text{coh}} = 80.0\text{ px}$ with $w_{\text{coh}} = 0.0056$.
   - **Collision Rate**: Reduced from $66.9\%$ (baseline) and $29.0\%$ (angular Boids) down to $3.2\%$ in 25-step turning rollouts (`analysis/datasets/flocking_model_benchmark_results.json`).
4. **Phase 4: Global Game Pacing & Viewport Alignment (Completed)**:
   - **Historical Measurement Baseline**: A previous playback measurement treated $1920.0 \times 1080.0\text{ units}$ ($16:9$) and $V_{\text{bullet, orig}} = 1025.0\text{ px/s}$ as the reference, yielding `Hook.BaseThrustConverter = 0.002f` and `Hook.ShotThrustConverter = 0.0013f`. This calibration is now superseded as an implementation setting, but remains the comparison point for future measurement work.
   - **Current Video-Observed Rescaling (`Hook.cs`)**: Visual comparison against original-game recordings indicates that the previous values are too slow. The remake now uses `Hook.BaseThrustConverter = 0.0024f` and `Hook.ShotThrustConverter = 0.00156f` (a uniform $1.2\times$ increase), preserving the velocity-ratio invariant $\text{ShotThrustConverter} \times 10 = \text{BaseThrustConverter} \times 6.5 = 0.0156$.
   - **Measurement Follow-up (Required)**: The discrepancy between the earlier playback-derived values and the higher video-observed speeds has not yet been explained. Re-run the velocity measurement with a validated coordinate-space, frame-timing, and viewport-scaling pipeline before treating either calibration as authoritative ground truth.

