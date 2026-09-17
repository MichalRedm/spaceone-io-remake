# Reference: Custom Pickups & Weapon Upgrades Pattern

This document serves as an architectural pattern guide if temporary or permanent weapon pickups, power-ups, or fleet upgrades are reintroduced in the future.

## Core Abstractions

The engine cleanly separates fleet-level weapon orchestration from individual ship projectiles using generic interfaces in `Game.Engine/Core/Weapons/`:

1. **`IShipWeapon`** (`Game.Engine/Core/Weapons/IShipWeapon.cs`):
   Defines how an individual projectile or laser beam fires from a single ship:
   ```csharp
   public interface IShipWeapon
   {
       void FireFrom(Ship ship, ActorGroup group);
       bool Active { get; }
   }
   ```

2. **`IFleetWeapon`** (`Game.Engine/Core/Weapons/IShipWeapon.cs`):
   Defines fleet-level weapon activation (firing in volley across all ships in the fleet):
   ```csharp
   public interface IFleetWeapon
   {
       void FireFrom(Fleet fleet);
       bool IsOffense { get; }
       bool IsDefense { get; }
   }
   ```

3. **`FleetWeaponGeneric<T>`** (`Game.Engine/Core/Weapons/FleetWeaponGeneric.cs`):
   Fires a `ShipWeaponVolley<T>` containing a collection of `IShipWeapon` instances instantiated across all ships in `fleet.Ships`:
   ```csharp
   public class FleetWeaponGeneric<T> : IFleetWeapon
       where T : IShipWeapon, new()
   {
       public bool IsOffense { get; set; } = true;
       public bool IsDefense { get; set; } = false;

       public void FireFrom(Fleet fleet)
       {
           ShipWeaponVolley<T>.FireFrom(fleet);
       }
   }
   ```

---

## Pattern: Adding a New Pickup

To create a collectible upgrade item in the arena:

### 1. Define the World Pickup Entity
Create a class deriving from `ActorBody` and implementing `ICollide`:
```csharp
namespace Game.Engine.Core.Pickups
{
    using Game.API.Common;
    using System;
    using System.Numerics;

    public class CustomPickup : ActorBody, ICollide
    {
        public override void Init(World world)
        {
            World = world;
            Position = world.RandomPosition();
            Sprite = Sprites.your_pickup_sprite;
            Size = 50;
            base.Init(world);
        }

        public bool IsCollision(Body projectedBody)
        {
            if (projectedBody is Ship ship)
            {
                return Vector2.Distance(this.Position, ship.Position) < (this.Size + ship.Size);
            }
            return false;
        }

        public void CollisionExecute(Body projectedBody)
        {
            if (projectedBody is Ship ship && ship.Fleet != null)
            {
                ApplyUpgrade(ship.Fleet);
                this.PendingDestruction = true;
            }
        }

        private void ApplyUpgrade(Fleet fleet)
        {
            // E.g., equip a special weapon, grant momentary invulnerability, or spawn escort ships
            fleet.Owner.SetInvulnerability(5000);
        }
    }
}
```

### 2. Spawning via System Actor
Register a spawner or periodic tender in `Game.Engine/Core/SystemActors/ObstacleTender.cs`:
```csharp
Flock.Add(new GenericTender<CustomPickup>(() => World.Hook.CustomPickupCount));
```
