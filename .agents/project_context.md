# Project Context - Spaceone.io Remake

## Master Entry Point
See [AGENTS.md](../AGENTS.md) at the repository root for immediate orientation and the Rule Routing Matrix.

## Current Goal
Rebuild and launch a high-fidelity remake of the multiplayer 2D fleet shooter **Spaceone.io**, recreating its original visual aesthetics using reference sprite atlases and calibrating server kinematics to match original recorded gameplay physics.

## Implementation Details
- **Architecture**: Authoritative Server Monorepo. High-frequency tick loop simulation in C# ASP.NET Core with WebSockets, binary FlatBuffers serialization, and an optimized 2D WebGL/Pixi.js client.
- **Backend Stack**: C# .NET 7.0, ASP.NET Core, `Microsoft.AspNetCore.WebSockets`, `KdSoft.FlatBuffers`, `RBush` (2D spatial R-Tree index), `System.Numerics.Vectors`.
- **Frontend Stack**: JavaScript / TypeScript, Pixi.js (`pixi.js`, `pixi-layers`, `pixi-particles`), WebGL Canvas, HTML5 WebSockets, SCSS, Vite bundler.
- **AI & Automation Stack**: Context steering behaviors (`Game.Robots`), genetic algorithm chromosome controllers, tournament harness.
- **Research & Physics Tuning Stack**: Python / NumPy / SciPy in `analysis/` executing kinematic regressions and trajectory loss minimization against `reference/space1-original/recordings/complete.csv`.

## Repository Status
- [x] Initial repository setup and branch checkout from `daud-io/daud (spaceone-rebuild)`.
- [x] Public GitHub repository published at `MichalRedm/spaceone-io-remake`.
- [x] Reference assets, original wasm client, decoders, and gameplay recordings imported into `reference/space1-original/`.
- [x] Agentic context framework and rule routing matrices initialized in `.agents/` and `AGENTS.md`.
- [x] Upgrade/modernize client build toolchain to Vite with Node 20/22+ support.
- [x] Upgrade/modernize backend solution to .NET 7.0 with 0 build warnings/errors.
- [x] Ingest authentic binary playback recordings and build telemetry extraction CLI (`extract_telemetry.py`).
- [x] Build simulation benchmark harness and interactive trajectory visualizer (`analysis/experiments/`).
- [ ] **Phase 1 (Reverse-Engineering)**: Measure and calibrate absolute invariants:
  - [x] **Bullet Lifetimes**: Calibrated discrete sublinear table `Hook.BulletLifeTable[N]` ($1560\text{ ms} - 3040\text{ ms}$) across 27,127 verified full shots.
  - [ ] **Firing Cooldowns**: Reload intervals per fleet size ($\tau_{\text{cooldown}} = 450\text{ ms} + 36\text{ ms} \cdot N$).
- [ ] **Phase 2 (Reverse-Engineering)**: Identify single-ship ($N=1$) core movement equation (discrete drag vs. kinematic heading velocity).
- [ ] **Phase 3 (Reverse-Engineering)**: Calibrate multi-ship fleet swarm dynamics (follower separation radius and spring cohesion).
- [ ] **Phase 4 (Visual Calibration)**: Harmonize camera FOV, viewport proportions, and visual scale.

## Critical Requirements & Developer Guidelines
1. **Local Setup & Prerequisites**:
   - .NET SDK (supports building `Game.Engine.sln`).
   - Node.js (>= 18 recommended) for building `Game.Engine/wwwroot`.
   - Python 3.10+ (for `analysis/` physics tuning and ML fitting scripts).
2. **Deterministic Physics Invariants**:
   - The game server runs an authoritative fixed-rate tick loop. Never introduce non-deterministic or thread-unsafe state mutations into the physics step.
3. **Quality & Verification**:
   - Always run `dotnet build Game.Engine.sln` and client bundle tests before committing or pushing changes.
4. **Self-Maintenance**:
   - Update `.agents/project_context.md` and related rules upon completing features or tuning physics constants.
