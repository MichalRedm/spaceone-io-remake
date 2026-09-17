# Codebase Map & Architectural Atlas - Spaceone.io Remake

> **Agent Directive**: Consult this atlas FIRST before executing any directory searches or reading long rule files. Jump directly to the relevant files below. When searching, always exclude `reference/`, `bin/`, `obj/`, `dist/`, and `node_modules/`.

---

## 🚫 Search Exclusions (High-Noise Directories)
Do NOT perform broad regex or grep searches across these directories; they contain massive recording CSVs, binary builds, or decompiled assets:
- `reference/space1-original/**` (Archived client wasm, gameplay recordings, CSV dumps)
- `**/bin/**` and `**/obj/**` (Compiled .NET assemblies and caches)
- `Game.Engine/wwwroot/dist/**` (Vite client build output)
- `Game.Engine/wwwroot/node_modules/**` (Frontend dependencies)

---

## 🧭 Subsystem & Symbol Index

### 1. Server Core & Physics (`Game.Engine/Core/`)
Authoritative fixed-rate game simulation loop and entity lifecycle.

| File Path | Key Classes / Types | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Engine/Core/World.cs` | `World` | Master simulation room; runs `FixedTick()`; manages `RBush<Body>` spatial trees (`RTreeDynamic`, `RTreeStatic`), player registrations, game mode detection (`GameMode`), and actor lifecycle. |
| `Game.Engine/Core/Body.cs` | `Body` : `ISpatialData` | Fundamental physics entity; position (`Position`), momentum (`Momentum`), angle, angular velocity, size, sprite ID, dirty-tracking (`IsDirty`), and spatial bounding box (`Envelope`). |
| `Game.Engine/Core/ActorBody.cs` | `ActorBody` : `Body, IActor` | Base class for interactive game actors; handles `Init(world)`, `Think()`, `Destroy()`, and spatial query collision triggers (`CausesCollisions`). |
| `Game.Engine/Core/Group.cs` | `Group` | Base logical grouping for bodies (e.g. all ships belonging to one player fleet). |
| `Game.Engine/Core/ActorGroup.cs` | `ActorGroup` : `Group, IActor` | Actor representing a group; lifecycle hooks for group-level updates. |
| `Game.Engine/Core/Player.cs` | `Player` | Player state container, authentication token, score, fleet reference, spawn management, and spectator tracking. |
| `Game.Engine/Core/Fleet.cs` | `Fleet` : `ActorGroup` | Central multi-ship fleet controller; handles shot cooldown formula (`CalculateShotCooldown`), boost timers (`BoostUntil`), fleet orientation (`FleetAngle`), aim targets, ship spawning, and weapon firing. |
| `Game.Engine/Core/Ship.cs` | `Ship` : `ActorBody, ICollide` | Individual fleet ship; manages ship health (`Health`), shield strength, thrust integration, drag, abandoned ship state, bullet sprite mapping (`BulletSprite`), and collision reactions (`Collided`). |
| `Game.Engine/Core/Food.cs` | `Food` : `ActorBody, ICollide` | Passive item entity (food/stars); spawns randomly, drifts in straight lines, decays in danger zone. |
| `Game.Engine/Core/FoodSpawner.cs` | `FoodSpawner` | Adaptive inverse-count grid stratified spawner that ensures even density distribution across dynamic arenas. |
| `Game.Engine/Core/Obstacle.cs` | `Obstacle` : `ActorBody, ICollide` | Static or drifting asteroid obstacles; collision geometry and momentum bounce response. |
| `Game.Engine/Core/Boom.cs` | `Boom` : `ActorBody` | Temporary explosion particle entity spawned when a ship dies (`FromShip`); handles drag deceleration and timed destruction. |

---

### 2. Fleet Steering & Swarm Dynamics (`Game.Engine/Core/Steering/`)
Kinematic calculations and spatial offsets for multi-ship formations.

| File Path | Key Classes / Functions | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Engine/Core/Steering/Flocking.cs` | `Flocking` | Position-based dynamics (PBD) solid-disc relaxation (`Relaxation`) preventing inter-ship penetration and preserving organic swarm layout. |
| `Game.Engine/Core/Steering/FleetMath.cs` | `FleetMath` | Fleet centroid (`FleetCenterNaive`) and average momentum (`FleetMomentum`) vector calculations. |

---

### 3. Weapons & Projectiles (`Game.Engine/Core/Weapons/`)

| File Path | Key Classes / Interfaces | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Engine/Core/Weapons/IShipWeapon.cs` | `IShipWeapon` | Interface for ship weapons (`FireFrom(ship, group)`, `Active`). |
| `Game.Engine/Core/Weapons/ShipWeaponBullet.cs` | `ShipWeaponBullet` : `ActorBody, IShipWeapon` | Standard laser bullet; applies thrust, manages calibrated lifetime (`TimeDeath`), and marks consumption upon collision. |
| `Game.Engine/Core/Weapons/ShipWeaponVolley.cs` | `ShipWeaponVolley` : `IShipWeapon` | Multishot volley weapon controller. |
| `Game.Engine/Core/Weapons/FleetWeaponGeneric.cs` | `FleetWeaponGeneric` | Fleet-level weapon firing orchestrator. |

---

### 5. Game Modes & System Actors (`Game.Engine/Core/SystemActors/`)

| File Path | Key Classes | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Engine/Core/SystemActors/CTF/CaptureTheFlag.cs` | `CaptureTheFlag` : `SystemActorBase` | CTF game mode controller; tracks `Flags`, `Bases`, `Teams`, score, and custom leaderboard generation. |
| `Game.Engine/Core/SystemActors/CTF/Base.cs` | `Base` : `ActorBody` | Team CTF home base; detects flag returns and scoring events. |
| `Game.Engine/Core/SystemActors/CTF/Flag.cs` | `Flag` : `ActorBody` | CTF flag entity; handles carrying (`CarriedBy`), dropping, and return cooldowns. |
| `Game.Engine/Core/SystemActors/Leaderboard.cs` | `Leaderboard` | Leaderboard generation; aggregates top fleet scores and team standings. |
| `Game.Engine/Core/SystemActors/ObstacleTender.cs` | `ObstacleTender` | Maintains ambient obstacle density across the world arena. |
| `Game.Engine/Core/SystemActors/RobotTender.cs` | `RobotTender` | Spawns and manages autonomous AI bot populations in the arena. |
| `Game.Engine/Core/SystemActors/WorldResizer.cs` | `WorldResizer` | Dynamically expands or shrinks `WorldSize` based on active player count. |

---

### 6. Shared API, Models & Constants (`Game.API.Common/`)

| File Path | Key Classes / Enums | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.API.Common/Models/Hook.cs` | `Hook` | **The central server configuration and physics tuning hub**. Holds `BaseThrust`, `Drag`, `BulletLifeTable`, `StepTime`, `ShotCooldownTimeM/B`, `TurnRate`, `SpeedDip`, `WorldSize`, and game mode switches. |
| `Game.API.Common/Models/Sprites.cs` | `Sprites` (enum) | Enumeration of all server/client sprite IDs (`ship_cyan`, `bullet_cyan`, `boom`, `seeker_pickup`, etc.). |
| `Game.API.Common/Models/Leaderboard.cs` | `Leaderboard`, `Entry` | Leaderboard data contracts and score serializations. |
| `Game.API.Common/Models/BroadcastEvent.cs` | `BroadcastEvent` | Events broadcast to clients (kills, captures, announcements). |

---

### 7. Networking & Wire Serialization (`Game.Engine/Networking/`)

| File Path | Key Classes | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Engine/Networking/Connection.cs` | `Connection` : `IDisposable` | ASP.NET Core WebSocket connection handler. Bridges client WebSockets to `Player`/`World`, receives client inputs (`NetControlInput`), and encodes `NetWorldView` packets via FlatBuffers. |
| `Game.Engine/Networking/BodyCache.cs` | `BodyCache` | Delta compression tracker; computes body appearance/update/deletion sets sent to each client. |
| `Game.Engine.Networking.FlatBuffers/game.fbs` | FlatBuffers Schema | The binary wire protocol definition: `NetWorldView`, `NetControlInput`, `NetSpawn`, `NetPing`, `NetLeaderboard`, `NetEvent`. |

---

### 8. Web Client Architecture (`Game.Engine/wwwroot/src/`)
Pixi.js WebGL client application.

| File Path | Key Classes / Modules | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Engine/wwwroot/src/core/bootstrap.ts` | Bootstrap script | Initial DOM bindings, error reporting hooks, polyfills. |
| `Game.Engine/wwwroot/src/core/game.ts` | `Game` orchestration | Main client application loop; coordinates ticker, input collection, network connection, HUD updates, and entity caching. |
| `Game.Engine/wwwroot/src/rendering/renderer.ts` | `Renderer` | PixiJS WebGL canvas setup, viewport scaling, layer containers (`pixi-layers`), and stage render passes. |
| `Game.Engine/wwwroot/src/rendering/camera.ts` | `Camera` | Smooth camera following with lag-decay interpolation and viewport scaling. |
| `Game.Engine/wwwroot/src/rendering/interpolator.ts` | `Interpolator` | Inter-tick entity kinematic interpolation and extrapolation between server network snapshots. |
| `Game.Engine/wwwroot/src/rendering/atlasLoader.ts` | `preloadAllAssets` | Headless sprite atlas and asset preloading. |
| `Game.Engine/wwwroot/src/models/cache.ts` | `Cache` | Client-side mirrored entity store (`bodies`, `groups`) indexed by ID. |
| `Game.Engine/wwwroot/src/models/textureLoader.ts` | `TextureLoader` | Pixi texture cache and sprite sheet coordinator. |
| `Game.Engine/wwwroot/src/models/textureMap.ts` | `textureMap` | Coordinate offsets and frame mappings for sprite sheet textures. |
| `Game.Engine/wwwroot/src/network/connection.ts` | `Connection` | Client WebSocket connection manager, binary FlatBuffers decoder, and heartbeat monitor. |
| `Game.Engine/wwwroot/src/ui/hud.ts` | `HUD` | In-game heads-up display: shields, boost gauge, weapon status. |
| `Game.Engine/wwwroot/src/ui/leaderboard.ts` | `Leaderboard` | High-score table, player rankings, and CTF team score displays. |
| `Game.Engine/wwwroot/src/ui/minimap.ts` | `Minimap` | Radar minimap rendering (friendly fleets, flags, bases, world bounds). |
| `Game.Engine/wwwroot/src/ui/controls.ts` | `Controls` | Mouse and keyboard input aggregator (thrust, boost, aim angle, fire). |

---

### 9. Autonomous Bot AI (`Game.Robots/`)
Autonomous context-steering bot framework and genetic evolution controllers.

| File Path | Key Classes | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Robots/Robot.cs` | `Robot` | Base bot agent; connects to game server via WebSocket, consumes world snapshots, and transmits control inputs. |
| `Game.Robots/ContextRobot.cs` | `ContextRobot` : `Robot` | Context-steering bot; maps environment threats/desires to a radial `ContextRing` and blends steering behaviors. |
| `Game.Robots/Framework/HumanoidBot.cs` | `HumanoidBot` : `Robot` | High-fidelity human-mimicking bot utilizing utility-based strategy swapping and simulated cursor movement. |
| `Game.Robots/Framework/BotParameters.cs` | `BotParameters` | Configuration POCO for bot traits, reaction times, and personality parameters. |
| `Game.Robots/Strategies/` | `IStrategy`, `EngageStrategy`, `CruisingStrategy` | Utility-scored strategy implementations driving `HumanoidBot` execution phases. |
| `Game.Robots/Behaviors/` | `ContextBehavior`, `Advance`, `Dodge`, `Separation`, `StayInBounds` | Modular steering components calculating directional weights and danger vectors. |
| `Game.Robots/Breeding/` | `RobotEvolutionController`, `RobotChromosome`, `RobotFitness` | Genetic algorithm tournament harness for evolving bot behavior weights. |
| `Game.Robots/Senses/` | `SensorFleets`, `SensorFlock`, `SensorWeapons` | Spatial sensory perception layers filtering local radar targets. |

---

### 10. CLI Administration & Testing (`Game.Util/`)

| File Path | Key Classes | Responsibilities & Invariants |
| :--- | :--- | :--- |
| `Game.Util/Program.cs` | `Program` | CLI entry point for server maintenance and stress tooling. |
| `Game.Util/Commands/ServerCommand.cs` | `ServerCommand` | Server status queries, configuration pushes, and world inspection. |
| `Game.Util/Commands/PlayerCommand.cs` | `PlayerCommand` | Player moderation, token issuance, and remote management. |
| `Game.Util/Commands/WorldCommand.cs` | `WorldCommand` | Dynamic world creation, hook adjustment, and reset triggers. |

---

### 11. Physics Calibration & Analysis Tooling (`analysis/`)

| File Path | Purpose & Responsibilities |
| :--- | :--- |
| `analysis/core/binary_reader.py` | Low-level binary decoding of original Spaceone `.bin` telemetry captures. |
| `analysis/core/dataset_extractor.py` | Ingestion of raw recordings into structured kinematic trajectory datasets. |
| `analysis/core/kinematics.py` | Velocity, acceleration, drag, and curvature calculations from telemetry. |
| `analysis/experiments/01_invariants/` | Ground-truth measurement scripts: bullet lifetimes, bullet speeds, and shot cooldown formulas. |
| `analysis/experiments/02_movement_models/` | Trajectory loss comparison and kinematic model parameter fitting. |

---

## 🔄 Core Architectural Data Flows

### A. Client Input to Server Kinematics
```
[User Input (Mouse/Keys)]
    │
    ▼
Game.Engine/wwwroot/src/ui/controls.ts (Captures angle, boost, shoot)
    │
    ▼
Game.Engine/wwwroot/src/network/connection.ts (Encodes NetControlInput FlatBuffer)
    │  (WebSocket Binary Frame)
    ▼
Game.Engine/Networking/Connection.cs (OnControlInput parses packet)
    │
    ▼
Game.Engine/Core/Fleet.cs (Applies AimTarget, BoostRequested, ShootRequested)
    │
    ▼
Game.Engine/Core/Ship.cs (Calculates thrust, drag, angle in FixedTick)
    │
    ▼
Game.Engine/Core/World.cs (Integrates positions, rebuilds RBush spatial index)
```

### B. World State Synchronization to WebGL Canvas
```
Game.Engine/Core/World.cs (FixedTick updates bodies)
    │
    ▼
Game.Engine/Networking/BodyCache.cs (Calculates appearance/update/deletion delta)
    │
    ▼
Game.Engine/Networking/Connection.cs (Serializes NetWorldView FlatBuffer)
    │  (WebSocket Binary Frame)
    ▼
Game.Engine/wwwroot/src/network/connection.ts (Decodes NetWorldView)
    │
    ▼
Game.Engine/wwwroot/src/models/cache.ts (Stores incoming body snapshots)
    │
    ▼
Game.Engine/wwwroot/src/rendering/interpolator.ts (Computes smooth 60fps lerp)
    │
    ▼
Game.Engine/wwwroot/src/rendering/renderer.ts (Draws Pixi.js sprites on WebGL canvas)
```
