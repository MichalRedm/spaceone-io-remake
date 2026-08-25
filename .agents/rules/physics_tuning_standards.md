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
