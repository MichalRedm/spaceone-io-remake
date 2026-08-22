# Physics and Kinematic Simulation Model

## 1. Kinematic Equations of Motion

Entity movement is evaluated over discrete server ticks ($\Delta t$):

$$\vec{v}_{t+1} = (\vec{v}_t + \vec{a}_{\text{thrust}} \cdot \Delta t) \cdot (1 - \gamma \cdot \Delta t)$$
$$\vec{r}_{t+1} = \vec{r}_t + \vec{v}_{t+1} \cdot \Delta t$$

where:
- $\vec{r}_t$: Entity 2D position vector $(x, y)$.
- $\vec{v}_t$: Entity velocity vector $(v_x, v_y)$.
- $\vec{a}_{\text{thrust}}$: Applied thrust vector pointing towards cursor/heading angle $\theta$.
- $\gamma$: Linear drag / damping coefficient.
- $v_{\max} = \frac{\|\vec{a}_{\text{thrust}}\|}{\gamma}$: Terminal forward velocity.

## 2. Fleet Swarm & Follower Dynamics

In Spaceone.io, a player's fleet consists of a leader ship and follower ships:
- **Leader Heading**: Rotates toward mouse cursor with maximum angular velocity $\omega_{\max}$.
- **Follower Cohesion & Separation**: Follower ships experience an attractive spring force towards the fleet centroid and a repulsive separation force from neighboring ships to avoid overlap.
- **Thrust Modulation**: Followers match the leader's forward thrust while maintaining formation geometry.

## 3. Projectile Kinematics

- **Laser Projectiles**: Fired forward with initial muzzle velocity $\vec{v}_{\text{laser}} = \vec{v}_{\text{ship}} + v_{\text{muzzle}} \cdot \hat{u}_\theta$.
- **Lifespan & Range**: Projectiles travel for a calibrated duration $\tau_{\text{lifespan}}$ or until intersecting an enemy ship/obstacle.
- **Spread Pattern**: Multi-ship fleets fire in parallel or slightly convergent trajectories based on fleet width.
