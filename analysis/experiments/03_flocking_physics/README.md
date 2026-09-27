# Fleet Flocking & Formation Physics Analysis

This directory contains empirical analysis scripts, kinematic experiments, and findings regarding the multi-ship flocking and formation dynamics of original Spaceone.io compared to the authoritative C# server remake.

---

## 1. Research Objectives & Motivation

The original Spaceone.io game featured distinct, highly organic fleet swarm mechanics:
1. Fleets moved as a coherent swarm without jittering or orbiting when the cursor hovered within the formation.
2. Ships packed slightly tighter around the cursor ("cursor compaction"), but only locally without collapsing small fleets into single-file lines.
3. When ships were abandoned (e.g., via dash/splitting), they naturally dispersed and fanned out along divergent trajectories without requiring artificial random impulse velocity bursts (`AbandonNoiseVelocity`).

---

## 2. Key Empirical Findings (From Playback Telemetry)

Data extracted from 41 binary playback sessions (`reference/space1-original/server-ansible/record/playback/*`) using the scripts in this directory:

### A. Local Cursor Compaction Curve (`tune_compaction_curve.py`, `local_compaction.py`)
- In the original game, compaction around the cursor was **subtle and localized**:
  - Baseline cruising inter-ship spacing: $\approx 34.9\text{ px}$.
  - Maximum compaction spacing at cursor ($d = 0\text{ px}$): $\approx 33.2\text{ px}$ (a maximum compression of only $\approx 5.0\%$).
  - Spatial Falloff: The compaction effect completely disappears once ships are $> 60\text{ px}$ away from the cursor.
- **Flaw in PR #23**: The earlier implementation in PR #23 applied a global `distScale` (up to 25% shrinkage over a 200px radius) across the *entire* fleet based solely on fleet centroid-to-mouse distance, causing the whole formation to unnaturally stiffen and crush together.

### B. In-Flock Velocity Variance & Micro-Movement (`measure_in_flock_velocity_variance.py`)
- In cruising fleets ($N \ge 10$, mouse $> 150\text{ px}$ away), individual ship velocity headings within the same fleet exhibit:
  - **Mean Heading Standard Deviation**: $\mathbf{5.46^\circ}$ ($\approx 0.095\text{ rad}$).
  - **95th Percentile Deviation**: $\mathbf{14.14^\circ}$ ($\approx 0.247\text{ rad}$).
- **Significance**: Ships in the original game did **not** travel with mathematically identical, perfectly parallel velocity vectors. Due to force-based (or momentum-integrated) flocking dynamics, ships possessed authentic in-flock lateral momentum.
- **Explaining Abandoned Ship Dispersion**: When ships are abandoned, flocking constraints are removed, but each ship retains its instantaneous momentum vector. Because the outer ships naturally hold outward-tilted velocity vectors ($\approx 5.5^\circ$), they naturally fan out upon abandonment. The parameter `Hook.AbandonNoiseVelocity` was previously introduced as a synthetic stopgap because the remake's ships moved with zero internal velocity variance.

---

## 3. Current Engine Architecture & Calibration

### A. Localized PBD Spatial Pull & Local Scale (`Flocking.cs`)
- In `Game.Engine/Core/Steering/Flocking.cs`:
  - Solid-disc Position-Based Dynamics (PBD) relaxation applies a localized pairwise scale factor:
    $$\text{localScale} = 0.95 + 0.05 \cdot \mathrm{clamp}\left(\frac{d_{\text{mouse}}}{60.0}, 0.0, 1.0\right)$$
  - Ships within $60\text{ px}$ of the cursor receive a gentle physical spatial pull (up to $0.4\text{ px}$ per tick at the center), pulling them into the relaxed $0.95\times$ solid bounds.
  - Because this is a 2D spatial pull rather than a directional heading alteration, small fleets (3–5 ships) maintain their natural 2D formation (triangle/circle) and do not collapse into single-file lines.

### B. Proximity-Faded Steering (`Fleet.cs`)
- In `Game.Engine/Core/Fleet.cs`:
  - When the cursor is distant, ships bias their heading towards the target ray (up to $\omega_{\max} = 0.08\text{ rad} \approx 4.5^\circ$).
  - As a ship approaches the cursor ($< 100\text{ px}$), this angular convergence smoothly fades to zero:
    $$\omega_{\text{conv}} = 0.08 \cdot \mathrm{clamp}\left(\frac{d_{\text{mouse}}}{100.0}, 0.0, 1.0\right)$$
  - Fading to zero prevents ships from crossing the cursor axis, eliminating tornado orbits and high-frequency heading chatter.

---

## 4. Evaluated Hypotheses & Failure Modes

### Naive PBD-Kinematic Coupling (Jitter Inducer)
- **Concept**: To recreate the $5.5^\circ$ heading variance and eliminate `AbandonNoiseVelocity`, the net PBD displacement vector (`FlockPush`) was directly coupled to `ship.AngleMovement` via a proportional outward bias.
- **Observed Failure**: Discrete PBD non-penetration pushes oscillate tick-by-tick as ship pairs alternate between overlapping and resolving. Coupling these discrete, unsmoothed displacements into continuous kinematic steering resulted in severe high-frequency heading jitter and visual vibration.
- **Resolution**: Reverted to preserve smooth, stable flight until a more sophisticated, continuous formulation is developed.

---

## 5. Directives for Future Research & Advanced Model Refinement

When deeper modeling and optimization are undertaken with more advanced AI models, the following problems and avenues must be investigated:

1. **Continuous Multi-Body Motion Formulation**:
   - Investigate whether original Spaceone used continuous spring-damper penalty forces (e.g. Hooke's law with velocity damping) or velocity-level impulse constraints rather than pure position projection (PBD).
   - If retaining PBD, design a low-pass filtered or momentum-integrated coupling that smoothly absorbs non-penetration impulses into momentum over time without tick-to-tick chatter.
2. **Empirical Parameter Optimization**:
   - Utilize automatic differentiation or ML curve fitting on extracted telemetry state-sequences to simultaneously calibrate:
     - Separation stiffness vs. damping.
     - Cohesion attraction profile.
     - Turn-rate coupling vs. fleet size $N$.
3. **Elimination of `AbandonNoiseVelocity`**:
   - Once authentic in-flock momentum variance ($\sigma \approx 5.5^\circ$) is achieved organically without visual jitter, verify that abandoned ship dispersion matches empirical distributions ($15\%$ speed dispersion, $11.7^\circ$ spread) and retire `AbandonNoiseVelocity`.

---

## 6. Scripts Inventory

| Script | Purpose |
| :--- | :--- |
| `measure_in_flock_velocity_variance.py` | Extracts intra-fleet heading standard deviation and 95th percentile from cruising replays. |
| `tune_compaction_curve.py` | Measures mean neighbor distance as a function of cursor distance (identifying the 5% / 60px curve). |
| `local_compaction.py` | Compares neighbor spacing near the cursor vs. distant fleet regions. |
| `measure_cursor_compaction.py` | Telemetry extraction of cursor proximity metrics across multi-ship fleets. |
| `measure_fleet_radius.py` | Analyzes fleet spatial radius scaling as a function of ship count $N$. |
| `check_orbit.py` | Evaluates angular velocity and heading changes for ships near the cursor. |
| `custom_benchmark.py` | Benchmarks simulated flocking metrics against recorded ground-truth telemetry. |
| `sim_steering_fade.py` | Kinematic simulation of ship steering trajectories with various fade parameters. |
| `sim_compaction.py` | Evaluates spatial compression dynamics under PBD relaxation. |
| `true_radius.py` | Measures effective collision packing radius per ship from replay data. |
