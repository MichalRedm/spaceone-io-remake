# Physics Analysis & ML Tuning Standards

> [!IMPORTANT]
> **Trigger Paths**: `analysis/**`, `reference/space1-original/recordings/**`
> **When to Read**: MUST be read before authoring analysis scripts, kinematic benchmark harnesses, or parameter regression algorithms.

## 1. Core Principles & Stack
- **Ground Truth Integrity**: Never alter the raw recording datasets in `reference/space1-original/recordings/` (`complete.csv`, `tourney.csv`).
- **Feature Extraction**:
  - Extract timestamped coordinates \((t_i, x_i, y_i, \theta_i, N_{\text{ships}})\).
  - Filter noise and compute velocity / acceleration profiles using central finite differences.
- **Loss Function Formulation**:
  - Formulate simulation objective functions using trajectory Mean Squared Error (MSE), velocity matching error, and angular deviation penalty.
- **Reproducibility**: Parameter fitting routines must save estimated parameters, convergence metrics, and comparison plots into `analysis/datasets/`.

## 2. Declarative Code Standards (Golden Patterns)

```python
# Standard imports and trajectory loss formulation
import numpy as np
from analysis.core import simulate_discrete_step, compute_trajectory_loss, compute_trajectory_rmse
```

---

## 3. Anti-Pattern & Pitfall Traps

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Overfitting to single short trajectory** | Yields physics parameters that fail under different fleet sizes or turning angles. | Calibrate against diverse gameplay segments (straight cruise, boost, sharp turn, split). |
| **Ignoring server tick granularity** | Continuous time equations diverge from discrete fixed-timestep server calculations. | Evaluate loss using the exact fixed timestep ($\Delta t$) of the C# server engine. |
| **Hardcoding tuned constants in multiple places** | Leads to parameter drift between physics engine, bot prediction, and client interpolation. | Centralize tuned constants in `Hook.cs` / configuration presets. |

---

## 4. Multimodal Visual & Trajectory Verification Loop

Pair quantitative trajectory loss fitting in `analysis/` with direct multimodal video inspection of **both original Spaceone.io captures and remake gameplay** using the [`.agents/skills/gameplay-recording/SKILL.md`](../skills/gameplay-recording/SKILL.md) toolkit:

1. **Original Ground-Truth Visual Inspection**:
   - Use `uv run --project tools/recorder python -m tools.recorder original list` and `original inspect <id>` to find clean segments in `reference/space1-original/server-ansible/record/playback/` (single-ship cruise, sharp turn, dash/split burst, large-fleet flocking, danger-zone decay).
   - Render `10–20s` clips via `original render <id> --profile agent --start MM:SS --end MM:SS --overlay-info` (plus `--speed 0.5` for micro-mechanics or `--graphics low` for clean hull silhouettes) and watch them directly with `read_file` to observe authentic original physics behavior visually before/alongside fitting equations.
   - Export numeric ground truth from the exact same slice via `original export <id> -o <out.csv> --start MM:SS --end MM:SS --tracked-only --ships-only` or `analysis/core/` scripts.
2. **Controlled Remake Fleet Capture**: Spawn multiple `HumanoidBot` instances (or dedicated test bots) via `Game.Util` and capture `15–25s` recordings of 2–3 distinct fleets concurrently using `--profile agent` (`960x540 @ 30fps`) so clips stay compact and clear for multimodal `read_file`.
3. **Side-by-Side Visual & Kinematic Cross-Check**:
   - Inspect both original and remake `.mp4` clips directly with `read_file` to compare ship turn responsiveness, boost split acceleration, flocking compaction, bullet travel, and out-of-bounds decay in real gameplay context.
   - Export the remake `.s1rec` archive via `python -m tools.recorder export ... --ships-only` into CSV trajectories for direct numeric comparison against `reference/space1-original/recordings/` and `original export` CSVs.
4. **Slow-Motion Micro-Inspection**: Re-render anomalous moments offline at `0.5x` speed with developer telemetry (`render ... --start <t1> --end <t2> --speed 0.5 --overlay-info` for either `.s1rec` or original captures) without re-running the live match.
