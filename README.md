# 🚀 Spaceone.io Remake

[![CI Pipeline](https://github.com/MichalRedm/spaceone-io-remake/actions/workflows/ci.yml/badge.svg)](https://github.com/MichalRedm/spaceone-io-remake/actions/workflows/ci.yml)
[![C# .NET 7.0](https://img.shields.io/badge/.NET-7.0-512BD4?logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![Pixi.js](https://img.shields.io/badge/Pixi.js-WebGL-E72264?logo=pixiv&logoColor=white)](https://pixijs.com/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%205-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebSockets](https://img.shields.io/badge/Protocol-FlatBuffers%20%2B%20WebSockets-009688)](https://flatbuffers.dev/)
[![GitHub](https://img.shields.io/badge/GitHub-MichalRedm%2Fspaceone--io--remake-blue?logo=github)](https://github.com/MichalRedm/spaceone-io-remake)

A high-performance remake of the classic multiplayer 2D fleet combat game **[Spaceone.io](https://web.archive.org/web/20180424075135/http://spaceone.io/)**, built on an authoritative C# ASP.NET Core game server engine (based on [Daud.io](https://github.com/daud-io/daud)), a hardware-accelerated Pixi.js WebGL client (bundled with Vite), and empirical ML-assisted physics calibration.

---

## 🎮 Gameplay Overview

In **Spaceone.io**, players command an expanding fleet of neon spaceships in a shared, high-speed 2D arena:
- **Grow Your Fleet**: Collect glowing energy orbs to spawn additional ships in formation.
- **Fleet Combat**: Fire synchronized laser volleys to destroy enemy fleets and steal their mass.
- **High-Speed Evasion & Boost**: Outmaneuver opponents, navigate danger zones, and break enemy formations.
- **Dominate the Leaderboard**: Climb the real-time server leaderboard and defend your crown.

---

## 🏛️ Monorepo Architecture

```
spaceone-io-remake/
├── Game.Engine/                  # Authoritative C# ASP.NET Core game server
│   ├── Core/                     # Fixed-rate tick loop, world rooms, spatial index (RBush)
│   ├── Physics/                  # Ship kinematics, drag, collision detection, and fleet cohesion
│   └── wwwroot/                  # Modern 2D WebGL web client (Pixi.js, Vite 5, SCSS, WebSockets)
│
├── Game.API.Common/              # Shared data contracts, constants, and FlatBuffers schemas
├── Game.API.Client/              # C# API and WebSocket client library
├── Game.Robots/                  # Autonomous bots, context-steering swarm AI & evolutionary breeding
├── Game.Util/                    # Management CLI, world administration, and stress-testing tools
│
├── reference/                    # Preserved historical Spaceone artifacts (daud-io/space1-ansible)
│   └── space1-original/
│       ├── assets/               # Original sprite sheets & texture atlases (ships, lasers, particles, foods)
│       ├── client/               # Original compiled WebAssembly engine & UI pages
│       ├── server-ansible/       # Protocol decoders, proxy servers, and WebSocket replay server
│       └── recordings/           # Tabular telemetry logs (complete.csv, tourney.csv)
│
├── analysis/                     # Physics calibration & kinematic optimization suite
│   ├── experiments/              # Kinematic measurement harnesses (speed, drag, angular agility)
│   └── datasets/                 # Trajectory time series, velocity profiles, and loss benchmarks
│
└── .agents/                      # AI assistant context architecture & deterministic rules (AGENTS.md)
```

---

## ✨ Key Features

- **Authoritative Simulation**: Server-authoritative physics step preventing movement desynchronization or client-side exploits.
- **Zero-Copy FlatBuffers Networking**: High-frequency binary WebSocket messaging for ultra-low latency packet transmission.
- **Pixel-Perfect Visuals**: Integrated sprite atlases and texture coordinates from original game assets.
- **Empirical Kinematic Calibration**: Physics parameters (thrust, drag, angular agility, bullet velocity) tuned against actual recorded gameplay telemetry using loss minimization.
- **Swarm AI & Context Steering**: Modular AI robots capable of evasive swarm steering and evolutionary breeding.

---

## 🚀 Quick Start

### Prerequisites
- [.NET 7.0 SDK or newer](https://dotnet.microsoft.com/download) (supports building `Game.Engine.sln`)
- [Node.js](https://nodejs.org/) (v18, v20, v22+) & npm
- *(Optional)* [Python 3.10+](https://www.python.org/) (for kinematics analysis scripts in `analysis/`)

### 1. Build the Web Client
```bash
cd Game.Engine/wwwroot
npm install
npm run build
```
> **Tip**: During frontend development, you can run `npm run dev` for instant Vite hot-module replacement (HMR).

### 2. Run the Game Server
From the repository root:
```bash
dotnet run --project Game.Engine
```

### 3. Play Locally
Open your web browser and navigate to:
```
http://localhost:5000
```

---

## 🔬 Physics Calibration & Telemetry

Original gameplay sessions are recorded in `reference/space1-original/recordings/complete.csv`. The `analysis/` workspace contains tooling to extract kinematics and calibrate the simulation:

```
[ Recorded Telemetry (CSV) ] ➔ [ Kinematic Extraction ] ➔ [ Simulation Step ] ➔ [ Loss Minimization ] ➔ [ Hook.cs Calibration ]
```

To run kinematic experiments and parameter optimization:
```bash
python -m py_compile analysis/**/*.py
```

---

## 🤖 AI Assistant Context

This repository includes a standardized `.agents/` context framework and root [`AGENTS.md`](AGENTS.md). AI coding assistants should consult [`AGENTS.md`](AGENTS.md) for the Rule Routing Matrix, 5-phase operational gates, and coding standards.

---

## 📜 Credits & Acknowledgements

- **Spaceone.io**: The original classic game created in 2017.
- **[Daud.io](https://github.com/daud-io/daud)**: Open-source C# authoritative game engine foundation.
- **[space1-ansible](https://github.com/daud-io/space1-ansible)**: Reference reverse engineering, packet decoders, and recorded gameplay logs.