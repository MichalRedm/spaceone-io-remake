# Game Engine & Backend C# Standards

> [!IMPORTANT]
> **Trigger Paths**: `Game.Engine/**`, `Game.API.Common/**`, `Game.API.Client/**`, `Game.Engine.Networking.FlatBuffers/**`
> **When to Read**: MUST be read before creating or modifying game server code, physics loops, world management, or network contracts.

## 1. Core Principles & Stack
- **Framework**: C# .NET Core, ASP.NET Core WebSocket server.
- **Authoritative Simulation**: All physics, collision detection, health calculations, fleet tracking, and projectile resolutions happen strictly on the server.
- **Fixed-Timestep Tick Loop**: Simulation progresses in discrete ticks (e.g. `World.Step()`). All entity kinematics must use `delta-time` scaling or fixed step multipliers.
- **Spatial Indexing**: Use `RBush` (2D R-Tree) for broadphase collision and proximity queries. Never iterate $O(N^2)$ over all world entities.
- **Zero-Allocation Critical Path**: Avoid allocating reference objects (`new ...`) inside high-frequency `Tick()` methods. Prefer struct pooling or reusable buffers.

## 2. Declarative Code Standards (Golden Patterns)

```csharp
// Vector operations using System.Numerics.Vectors
public void UpdatePosition(float dt)
{
    Velocity = Vector2.Clamp(Velocity + Acceleration * dt, -MaxSpeed, MaxSpeed);
    Position += Velocity * dt;
}

// Spatial query pattern using RBush
var candidates = World.SpatialIndex.Search(new Envelope(minX, minY, maxX, maxY));
foreach (var body in candidates)
{
    if (body.Intersects(this))
        HandleCollision(body);
}
```

---

## 3. Anti-Pattern & Pitfall Traps

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Direct UI/Client state reliance** | Clients are untrusted; trusting client coordinates enables teleportation hacks. | Calculate all positions and collisions strictly on the authoritative server. |
| **Allocating objects in `Tick()`** | Triggers frequent .NET Garbage Collection pauses, causing stutter/lag spikes. | Reuse structs, pre-allocated pools, or stack variables during the physics step. |
| **$O(N^2)$ distance checks** | Severely degrades server tick rate as player/ship count scales. | Query `RBush` spatial index bounds before executing narrow-phase distance math. |
| **Floating point non-determinism** | Unclamped `NaN` / infinity velocities corrupt physics state and crash simulation. | Validate and clamp position/velocity vectors at the end of each tick. |
