# Robot AI & Behavior Standards

> [!IMPORTANT]
> **Trigger Paths**: `Game.Robots/**`, `Samples/Robots/**`
> **When to Read**: MUST be read before implementing new bot behaviors, context steering algorithms, sensors, or genetic evolution controllers.

## 1. Core Principles & Stack
- **Context Steering**: Bots evaluate dynamic environmental danger and interest maps across discrete angle rays (e.g. 16 or 32 directions).
- **Flocking & Swarm Mechanics**: Maintain cohesive fleet formations while steering around obstacles, boundaries, and enemy fire.
- **Sensor Modularity**: Separate sensory perception (`ISense`, `SensorBullets`, `SensorFleets`) from motor actuation and targeting decisions (`TargetingBase`).
- **Deterministic Evolution**: Genetic breeding configurations (`RobotEvolutionConfiguration`, `BitStringChromosome`) must evaluate fitness reliably over scenario runs.

## 2. Declarative Code Standards (Golden Patterns)

```csharp
// Context steering ray projection
public Vector2 ComputeSteeringHeading(ContextMap context)
{
    var bestDirection = Vector2.Zero;
    float maxScore = float.MinValue;
    for (int i = 0; i < context.Rays.Length; i++)
    {
        float score = context.Interests[i] - context.Dangers[i];
        if (score > maxScore) { maxScore = score; bestDirection = context.Rays[i]; }
    }
    return bestDirection;
}
```

---

## 3. Anti-Pattern & Pitfall Traps

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Monolithic bot logic inside `Tick()`** | Unmaintainable, difficult to unit test, and impossible to breed with genetic algorithms. | Decompose behaviors into modular sensory components, context maps, and targeting rules. |
| **Instantaneous direction changes** | Makes bot movement look robotic and unrealistic compared to human fleet physics. | Apply turn-rate limits and angular acceleration smoothing to bot target vectors. |
| **Unbounded sensory search radius** | Causes performance bottlenecks when hundreds of bots query the entire map. | Bound sensor visibility to practical field-of-view and spatial index envelopes. |
