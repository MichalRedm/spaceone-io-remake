# C# Coding Standards & Architecture Guide

> [!IMPORTANT]
> **Trigger Paths**: `Game.Engine/**/*.cs`, `Game.API.Common/**/*.cs`, `Game.API.Client/**/*.cs`, `Game.Robots/**/*.cs`, `Game.Registry/**/*.cs`, `Game.Util/**/*.cs`
> **When to Read**: MUST be read before authoring, modifying, or refactoring C# backend code, physics loops, network packet serializers, robot controllers, or API contracts.

This document defines the authoritative coding standards, architectural invariants, performance rules, concurrency guidelines, and style conventions for writing C# in **Spaceone.io Remake**.

---

## 1. Core Architecture & Modern C# Stack

- **Target Framework**: .NET 7+ (`net7.0` / modern LTS).
- **C# Language Version**: C# 11+ idioms (file-scoped namespaces, pattern matching, records, `readonly struct`, `Span<T>` / `ReadOnlySpan<T>`, required properties).
- **Simulation Paradigm**: Authoritative server architecture. The server has total authority over state, kinematic projection, collision resolution, lifecycle, and scoring. Clients and bots are untrusted.

---

## 2. Zero-Allocation Hot Path & Performance Engineering

In a 60/100 Hz fixed-timestep physics engine, heap allocations (`new`) in the tick loop trigger frequent Garbage Collector (GC) Generation 0/1 collections, leading to latency spikes and tick stutter.

### Rule 2.1: The Zero-Allocation Hot Path Invariant
- **Never allocate reference types on the managed heap inside `Tick()`, `Step()`, `Update()`, `Project()`, or per-packet serialization routines.**
- Prohibited in hot paths:
  - `new` object instantiation (unless pooled or lifecycle-managed once).
  - Dynamic delegate or closure allocation (`x => x.Property`).
  - String formatting, interpolation, or concatenation (`$"{a}_{b}"`, `.ToString()`).
  - Array allocations (`new byte[...]`, `new float[...]`).

### Rule 2.2: Prohibition of LINQ in Hot Paths
- **Do NOT use LINQ (`System.Linq`) inside per-tick or per-frame methods.**
- LINQ operations (`.Where()`, `.Select()`, `.Any()`, `.ToList()`, `.OrderBy()`, `.Count()`) allocate enumerator state machines, wrapper delegates, and intermediate heap arrays.
- **Golden Pattern**: Use indexed `for` loops, direct `foreach` over concrete collections, or pre-allocated reusable buffers.

```csharp
// ❌ AVOID: LINQ allocation on every tick for every ship/entity
public void Think()
{
    if (WeaponStack.Any(w => w.IsOffense)) { ... }
    var activeShips = Ships.Where(s => !s.PendingDestruction).ToList();
}

// ✅ RECOMMENDED: Zero-allocation loop with local or cached state
public void Think()
{
    bool hasOffense = false;
    foreach (var weapon in WeaponStack)
    {
        if (weapon.IsOffense)
        {
            hasOffense = true;
            break;
        }
    }
}
```

### Rule 2.3: Memory Slicing & Buffer Pooling
- Use `Span<T>` and `ReadOnlySpan<T>` for slicing contiguous memory without heap allocations.
- Use `ArrayPool<T>.Shared` or `MemoryPool<T>.Shared` for transient high-volume buffers (e.g. WebSocket packet encoding/decoding). Always return rented arrays in a `try ... finally` block.
- For small fixed buffers ($< 1 \text{ KB}$), prefer `stackalloc`.

```csharp
// ✅ RECOMMENDED: Rented buffer pattern with deterministic return
byte[] rentedBuffer = ArrayPool<byte>.Shared.Rent(payloadSize);
try
{
    int bytesWritten = SerializeToBuffer(rentedBuffer.AsSpan(0, payloadSize));
    await socket.SendAsync(rentedBuffer.AsMemory(0, bytesWritten), WebSocketMessageType.Binary, true, cancellationToken);
}
finally
{
    ArrayPool<byte>.Shared.Return(rentedBuffer);
}
```

### Rule 2.4: Value Types & Struct Semantics
- Use `readonly struct` for small immutable mathematical or coordinate objects (e.g., vectors, envelopes, spatial bounds, kinematic deltas).
- Pass structs larger than 16 bytes using `in` or `ref readonly` to avoid value-copy overhead on function call stacks.

---

## 3. Concurrency, Async/Await & Thread Safety

### Rule 3.1: Strict Prohibition of Sync-Over-Async
- **Never call `.Wait()`, `.Result`, or `.GetAwaiter().GetResult()` on asynchronous `Task` objects.**
- Sync-over-async blocks ThreadPool worker threads, causing thread pool starvation, high scheduling latency, and catastrophic deadlocks.
- All asynchronous call chains must be `async`/`await` end-to-end.

```csharp
// ❌ CRITICAL HAZARD: Sync-over-async in timer callback
private void PingEntry(object state)
{
    Task.Run(async () => await SendPingAsync()).Wait(); // Starvation & deadlock risk!
}

// ✅ RECOMMENDED: Asynchronous timer / periodic timer loop
private async Task RunPingLoopAsync(CancellationToken cancellationToken)
{
    using var periodicTimer = new PeriodicTimer(TimeSpan.FromSeconds(1));
    while (await periodicTimer.WaitForNextTickAsync(cancellationToken))
    {
        if (Socket?.State == WebSocketState.Open)
            await SendPingAsync(cancellationToken);
    }
}
```

### Rule 3.2: Lock Hygiene & Target Isolation
- **Never lock on `this`, `typeof(...)`, or string literals.**
- Always lock on a dedicated `private readonly object _syncLock = new object();`.
- Locking on `Type` instances (e.g. `lock (typeof(Player))`) creates global cross-domain bottlenecks and deadlock hazards.
- Do NOT hold locks across `await` statements, network I/O, or long-running database/registry calls.
- Use `ConcurrentDictionary<TKey, TValue>`, `Channel<T>`, or `ReaderWriterLockSlim` for concurrent data structures.

```csharp
// ❌ ANTI-PATTERN: Locking on Type
public static List<Player> GetWorldPlayers(World world)
{
    lock (typeof(Player)) { ... }
}

// ✅ RECOMMENDED: Dedicated lock or thread-safe collection
public sealed class PlayerManager
{
    private readonly object _playersLock = new object();
    private readonly Dictionary<World, List<Player>> _worldPlayers = new();

    public List<Player> GetPlayers(World world)
    {
        lock (_playersLock)
        {
            return _worldPlayers.TryGetValue(world, out var list) ? new List<Player>(list) : new List<Player>();
        }
    }
}
```

### Rule 3.3: Resource Disposal & Synchronization Primitives
- Every class owning `IDisposable` resources (e.g. `SemaphoreSlim`, `CancellationTokenSource`, `WebSocket`, `Timer`) must implement `IDisposable` and dispose them deterministically.
- `SemaphoreSlim` instances used for throttled network transmission must be disposed when the connection terminates.

---

## 4. OOP, Modularity & SOLID Architecture

### Rule 4.1: Single Responsibility Principle (SRP)
- Keep classes focused on one single responsibility.
- View / Rendering logic must remain in `wwwroot/src/`.
- Physics and collision logic belong in `Core/`.
- Network frame encoding belongs in `Networking/`.
- Bot behavior evaluation belongs in `Game.Robots/Behaviors/`.

### Rule 4.2: Open/Closed Principle for Game Modes
- Do NOT hardcode game mode checks or string matching inside core physics classes (e.g. `if (World.Hook.Name == "Sharks and Minnows")` inside `Fleet.cs`).
- Implement game-mode-specific rules through polymorphic `SystemActor` implementations (e.g. `Sumo`, `CaptureTheFlag`, `TeamColors`, `SharksAndMinnowsActor`) or dedicated scoring / hook decorators.

### Rule 4.3: Interface Segregation & Golden Contracts
- Do NOT define empty, vestigial, or dummy interfaces (e.g. delete any typos like `IEnumberable.cs`).
- Prefix interface names with `I` (e.g. `IActor`, `ICollide`, `IFleetWeapon`, `ISecurityContext`).
- Keep interfaces focused and granular (`IActor`, `ICollide`, `ILifeCycle`).

---

## 5. File Organization, Naming & Clean Code

### Rule 5.1: Single-Type Per File
- **Every public class, struct, interface, enum, or record must reside in its own dedicated `.cs` file matching the type name exactly.**
- Prohibited: Defining multiple top-level classes or enums inside unrelated files.

### Rule 5.2: Directory & Namespace Parity
- Namespaces must strictly mirror the physical folder hierarchy.
  - `Game.Engine/Core/Weapons/ShipWeaponBullet.cs` $\rightarrow$ `namespace Game.Engine.Core.Weapons;`
  - `Game.Robots/Behaviors/Dodge.cs` $\rightarrow$ `namespace Game.Robots.Behaviors;`
- Prefer **file-scoped namespaces** (`namespace Game.Engine.Core;`) in modern C# code to reduce indentation nesting.

### Rule 5.3: Standard C# Naming Conventions
| Identifier Type | Convention | Example |
| :--- | :--- | :--- |
| **Classes, Structs, Records** | PascalCase | `ActorBody`, `FleetWeaponGeneric` |
| **Interfaces** | IPascalCase | `IActor`, `IFleetWeapon` |
| **Methods & Properties** | PascalCase | `CalculateShotCooldown`, `FleetCenter` |
| **Private Fields** | `_camelCase` | `_lastObjectID`, `_syncLock` |
| **Constants & Static Readonly** | PascalCase | `MaxBufferCapacity`, `DefaultVelocity` |
| **Local Variables & Parameters** | camelCase | `targetPosition`, `deltaTime` |

---

## 6. Encapsulation, State Mutation & Numeric Safety

### Rule 6.1: Encapsulation Over Public Fields
- Do NOT expose public mutable fields on domain objects.
- Use auto-properties `{ get; set; }`, `{ get; private set; }`, or `{ get; init; }`.
- Encapsulate collections: do not expose raw `public List<T> Items = new List<T>();`. Expose `IReadOnlyList<T>` or dedicated accessor methods (`AddItem(T item)`, `RemoveItem(T item)`).

### Rule 6.2: NaN & Infinity Floating-Point Sanitization
- Floating-point calculations can produce `float.NaN` or `float.PositiveInfinity` when vectors are normalized from zero-length or divided by zero.
- **Always validate both X and Y components of vectors** before assigning to physics state:

```csharp
// ❌ BUG-PRONE: Only checking X component
set
{
    if (float.IsNaN(value.X)) throw new ArgumentException("Invalid position");
    _position = value;
}

// ✅ RECOMMENDED: Complete vector and numeric sanitization
set
{
    if (float.IsNaN(value.X) || float.IsNaN(value.Y) || float.IsInfinity(value.X) || float.IsInfinity(value.Y))
    {
        _position = Vector2.Zero;
        return;
    }
    _position = value;
}
```

---

## 7. Security, Input Validation & Defensive Networking

### Rule 7.1: Zero-Trust Client WebSocket Input
- All data received over WebSockets (`NetControlInput`, `NetSpawn`, custom payloads) is untrusted.
- **Never deserialize client payloads directly into server domain models.**
  - **PROHIBITED**: `JsonConvert.PopulateObject(customData, this)` on `Player` or `Fleet` instances.
  - This allows malicious players to overwrite server-authoritative properties (`Score`, `IsInvulnerable`, `Roles`, `IsShielded`).
- Explicitly map client input fields into strictly validated DTOs.

### Rule 7.2: Information Disclosure Prevention
- Do NOT serialize raw exception stack traces (`exception.StackTrace`) or internal directory structures to public API responses.
- In production, return normalized error envelopes with generic error messages and correlation IDs.

---

## 8. Error Handling & Exception Standards

### Rule 8.1: Specific Exception Types
- **Never throw generic `System.Exception`.**
- Throw standard framework exceptions (`ArgumentNullException`, `ArgumentOutOfRangeException`, `InvalidOperationException`) or strongly-typed custom exceptions (`GameSimulationException`).

### Rule 8.2: Prohibition of Empty Exception Swallowing
- **Never write empty `catch (Exception) { }` blocks.**
- If an exception is expected and benign, log it at `Debug` or `Trace` level with an explanatory comment:

```csharp
// ❌ AVOID: Silent swallowed crash
try { connection.Dispose(); } catch (Exception) { }

// ✅ RECOMMENDED: Logged cleanup
try
{
    connection.Dispose();
}
catch (Exception ex)
{
    _logger.LogDebug(ex, "Non-critical error during connection teardown.");
}
```

---

## 9. Code Documentation & XML Comments

### Rule 9.1: Proximity & Intent Principle
- All public types, public methods, and domain contracts must include standard XML documentation comments (`/// <summary>`).
- Explain **Why** and **How** rather than repeating the signature name.

### Rule 9.2: Document Invariants & Coordinate Models
- **Units**: State explicitly whether time is in milliseconds (`ms`), seconds, or simulation ticks.
- **Coordinates**: Disambiguate world space $(x, y)$ vs screen/viewport space vs spatial index envelopes.
- **Angles**: Document radians vs degrees and rotation orientation (clockwise vs counter-clockwise).
- **Thread-Safety**: State whether methods are thread-safe or must be invoked within the world tick lock.

---

## 10. Anti-Pattern & Pitfall Traps Matrix

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **LINQ in `Tick()` / `Step()`** | Generates constant heap allocations and triggers GC pause stutter. | Use indexed `for` loops or cached arrays in simulation hot paths. |
| **Sync-Over-Async (`.Wait()`)** | Blocks ThreadPool threads and causes deadlocks in WebSocket/Timer loops. | Use `async`/`await` end-to-end with `PeriodicTimer` or `Channel<T>`. |
| **Locking on `typeof(...)` or `this`** | Creates cross-component lock contention and deadlocks. | Lock on a dedicated `private readonly object _syncLock = new();`. |
| **`JsonConvert.PopulateObject` on Server State** | Allows clients to inject arbitrary property values (god mode, admin roles). | Parse into strict input DTOs and validate explicitly. |
| **Hardcoding Game Modes in `Fleet.cs`** | Violates Open/Closed Principle; bloats core physics with mode quirks. | Encapsulate game rules in modular `SystemActor` or GameMode classes. |
| **Ternary Operator Precedence in Delta Calc** | `+` binds tighter than `?:`, ignoring angle/size errors during sync. | Wrap expressions with explicit parentheses: `(cond ? a : b) + c`. |
| **Public Mutable Collection Fields** | Destroys encapsulation and leads to unsynchronized list mutations. | Expose `IReadOnlyList<T>` and control mutations via methods. |
| **Checking Only `Vector2.X` for `NaN`** | Allows `NaN` on Y component to corrupt simulation and spatial indices. | Check both `float.IsNaN(v.X) \|\| float.IsNaN(v.Y)`. |
| **Allocating `new Random()` in Loops** | Seeds collision and heap garbage in high-frequency methods. | Use modern `Random.Shared` (.NET 6+) or thread-local RNG. |
| **Dead / Typo Interfaces (`IEnumberable.cs`)** | Clutters codebase and confuses developers/analyzers. | Remove unused or mistyped interfaces immediately. |
