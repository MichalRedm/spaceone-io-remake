# Architecture Overview - Spaceone.io Remake

## 1. High-Level System Architecture

The Spaceone remake employs a client-server architecture designed for high tick-rate multiplayer 2D gameplay:

```
+-------------------------------------------------------------------+
|                        Game Server (.NET)                         |
|                                                                   |
|   +-------------------+     +------------------+     +--------+   |
|   | WebSocket Manager | <-> | Fixed Tick Loop  | <-> | RBush  |   |
|   |  (FlatBuffers)    |     | (Physics/Fleet)  |     | Spatial|   |
|   +-------------------+     +------------------+     +--------+   |
+-------------------------------------------------------------------+
             ^                                     ^
             | Binary WebSocket Frames             | In-Process / Remote
             v                                     v
+------------------------+             +------------------------+
|   WebGL Client         |             |   Game.Robots (AI)     |
|   (Pixi.js / Canvas)   |             |   (Context Steering)   |
+------------------------+             +------------------------+
```

## 2. Project Breakdown

- **`Game.Engine`**: Core server hosting the ASP.NET Core WebSocket listener, game rooms (`World`), game loop, fleet management, and collision mechanics.
- **`Game.Engine/wwwroot`**: Web client using Pixi.js for 2D hardware-accelerated rendering, camera management, asset preloading, and user input capture.
- **`Game.API.Common`**: Shared data types, constants, and FlatBuffers schemas.
- **`Game.API.Client`**: C# client library for programmatic interaction with the server.
- **`Game.Robots`**: AI bot harness implementing sensory perception, steering behaviors, and genetic algorithm optimization.
- **`reference/space1-original`**: Archive of original client WebAssembly binaries, sprite atlases, UI images, and telemetry recording CSVs.
- **`analysis`**: Experimental scientific environment (Python/NumPy/SciPy) for kinematic parameter estimation and trajectory loss minimization.
