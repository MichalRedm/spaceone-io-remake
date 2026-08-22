# Physics Analysis, Kinematics & ML Tuning

This directory contains research scripts, experiment harnesses, and automated parameter optimization routines to match the Spaceone remake simulation against original gameplay recordings (`reference/space1-original/recordings/`).

---

## Architecture & Workflow

```
analysis/
├── datasets/                 # Extracted trajectory features, velocity profiles, time series
├── experiments/              # Kinematic experiment scripts (linear drag, angular agility, bullet velocity)
└── optimization/             # Loss functions & ML parameter fitting algorithms
```

---

## Planned Calibration Methodology

1. **Telemetry Parsing (`complete.csv` & `tourney.csv`)**:
   - Extract continuous player fleet coordinate streams \((x_t, y_t)\), orientations \(\theta_t\), ship counts \(N_t\), and firing events.
   - Differentiate positions to compute instantaneous velocity vectors \(\vec{v}_t = \frac{d\vec{r}}{dt}\) and acceleration vectors \(\vec{a}_t = \frac{d\vec{v}}{dt}\).

2. **Kinematic Parameter Estimation**:
   - **Maximum Velocity (\(v_{\max}\))**: Steady-state forward movement velocities across various fleet sizes.
   - **Thrust Acceleration (\(a_{\text{thrust}}\)) & Drag (\(\gamma\))**: Step-response curve fitting from stationary state to top speed (\(v(t) = v_{\max}(1 - e^{-\gamma t})\)).
   - **Angular Agility (\(\omega_{\max}, \alpha\))**: Rotational responsiveness and damping when tracking mouse heading.
   - **Bullet Kinematics**: Initial muzzle velocity, deceleration/lifespan, spread cone angle, and fire rate cooldown.
   - **Fleet Formation Physics**: Spring/flocking constants for followers (cohesion, separation, drag matching).

3. **Automated Simulation Optimization (ML / Loss Minimization)**:
   - Run candidate C# / Python physics simulation steps given initial state \(S_0\) and recorded control inputs.
   - Evaluate trajectory discrepancy loss:
     $$\mathcal{L}(\theta) = \sum_{t=1}^{T} \|\vec{r}_{\text{sim}}(t, \theta) - \vec{r}_{\text{ground\_truth}}(t)\|^2 + \lambda \|\theta_{\text{sim}}(t, \theta) - \theta_{\text{ground\_truth}}(t)\|^2$$
   - Optimize parameter vector \(\theta^* = \arg\min_\theta \mathcal{L}(\theta)\) using Nelder-Mead / L-BFGS-B / Bayesian Optimization.
