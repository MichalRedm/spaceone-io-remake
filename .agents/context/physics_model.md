# Physics and Kinematic Simulation Model

## 1. Kinematic Equations of Motion & Timestep

The authoritative C# simulation runs a fixed-rate tick loop with **$\Delta t = 40.0\text{ ms}$** ($25\text{ ticks/s}$, $25\text{ Hz}$), matching the original Spaceone.io server.

Entity movement in `Body.cs` and `Ship.cs` is evaluated over discrete tick intervals:

$$\vec{v}_{t+1} = (\vec{v}_t + \vec{a}_{\text{thrust}} \cdot \Delta t) \cdot \text{Drag}$$
$$\vec{r}_{t+1} = \vec{r}_t + \vec{v}_{t+1} \cdot \Delta t$$

where:
- $\vec{r}_t$: Entity 2D position vector $(x, y)$ in world units.
- $\vec{v}_t$: Entity velocity / momentum vector in world units per millisecond.
- $\vec{a}_{\text{thrust}}$: Applied thrust vector pointing towards cursor/heading angle $\theta$.
- Converter factor: $\text{BaseThrustConverter} = 0.025\text{ ms}^{-1} = \frac{1}{40\text{ ms}}$.
- For steady-state cruise:
  $$v_{\text{world/s}} = \text{BaseThrust}[N] \times 25.0$$
  $$v_{\text{momentum}} = \text{BaseThrust}[N] \times 0.025\text{ ms}^{-1}$$

---

## 2. World Coordinate Space & Arena Geometry

- **Arena Size**: $12,650\text{ units}$ span (coordinates $X, Y \in [-6325, +6325]$).
- **Danger Zone**: Outer boundary begins at $|X|, |Y| \ge 5575$ ($750\text{ unit}$ decay buffer before boundary death).
- **Camera Viewport**: Default camera distance $= 3600.0\text{ units}$ (`camera.ts`), providing proportional visual field of view across the $12,650\text{ px}$ arena.

---

## 3. Hitboxes & Spatial Dimensions

- **Ship**: Radius $r_{\text{ship}} = 20\text{ units}$ (Diameter $= 40\text{ units}$).
- **Laser / Bullet**: Radius $r_{\text{bullet}} = 30\text{ units}$ (Diameter $= 60\text{ units}$).
- **Food / Fish**: Radius $r_{\text{food}} = 10\text{ units}$ (Diameter $= 20\text{ units}$).

---

## 4. Empirical Speed Lookup Tables

### Ship Cruise Speed vs. Fleet Size ($N$)
| Fleet Size $N$ | Table `BaseThrust[N]` | Telemetry Cruise ($px/\text{tick}$) | World Speed ($px/\text{s}$) |
| :--- | :--- | :--- | :--- |
| **1** | $13.600$ | $13.42$ | $335.4$ |
| **2** | $11.799$ | $13.00$ | $325.0$ |
| **3** | $10.857$ | $12.17$ | $304.1$ |
| **5** | $9.778$ | $11.18$ | $279.5$ |
| **10** | $8.483$ | $9.22$ | $230.5$ |
| **20** | $7.359$ | $8.06$ | $201.6$ |
| **30** | $6.772$ | $7.21$ | $180.3$ |

### Bullet Velocity vs. Fleet Size ($N$)
| Fleet Size $N$ | Table `ShotThrust[N]` | Telemetry Speed ($px/\text{tick}$) | World Speed ($px/\text{s}$) |
| :--- | :--- | :--- | :--- |
| **1** | $41.000$ | $25.94$ | $648.6$ |
| **2** | $34.167$ | $35.00$ | $875.0$ |
| **3** | $30.711$ | $31.14$ | $778.6$ |
| **5** | $26.851$ | $26.25$ | $656.2$ |
| **10** | $22.376$ | $21.21$ | $530.3$ |

---

## 5. Fleet Swarm & Follower Dynamics

- **Leader Heading**: Rotates toward mouse cursor with maximum angular velocity $\omega_{\max}$.
- **Follower Cohesion & Separation**: Follower ships experience an attractive spring force towards the fleet centroid and a repulsive separation force from neighboring ships to avoid overlap.
- **Thrust Modulation**: Followers match the leader's forward thrust while maintaining formation geometry.

---

## 6. Projectile Kinematics

- **Laser Projectiles**: Fired forward with initial muzzle velocity $\vec{v}_{\text{laser}} = \vec{v}_{\text{ship}} + v_{\text{muzzle}} \cdot \hat{u}_\theta$.
- **Lifespan**: Bullet lifetime is dynamic based on fleet size:
  $$\tau_{\text{life}} = \text{BulletLifeB} + \text{BulletLifeM} \cdot N = 1800\text{ ms} + 35\text{ ms} \cdot N$$
- **Cooldown**: Reload cooldown is dynamic based on fleet size:
  $$\tau_{\text{cooldown}} = \text{ShotCooldownTimeB} + \text{ShotCooldownTimeM} \cdot N = 450\text{ ms} + 36\text{ ms} \cdot N$$
