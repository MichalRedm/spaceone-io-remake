# Original Spaceone.io Reference Archive

This directory contains the original assets, client code, network decoders, and recorded gameplay sessions from [Spaceone.io](https://web.archive.org/web/20180424075135/http://spaceone.io/) (preserved via the `daud-io/space1-ansible` repository).

---

## Directory Structure

```
reference/space1-original/
├── assets/
│   ├── atlas/                    # Texture atlases and JSON frame definitions (foods, icons, lasers, particles, ships)
│   ├── img/                      # Raw textures, color variations, UI assets, backgrounds, logo
│   └── css/                      # Original styles and UI layout sheets
│
├── client/
│   ├── wasm/                     # Original compiled WebAssembly client (spaceone.io_wasm.js & .wasm)
│   ├── js/                       # Client UI utilities (graphics settings, arena links, popups, carousel)
│   ├── pages/                    # Game and playback HTML interfaces (index, playback, spectate, bot, fullgame)
│   ├── inject/                   # Client-side network interceptors and packet hooks
│   └── ansibleclient/            # Ansible web client components (grid, leaderboard, spotlight, networking)
│
├── server-ansible/               # Node.js proxy, packet capture, replay servers, bots & decoders
│   ├── decoders/                 # Binary packet decoders & variable header parsers
│   ├── bots/                     # Bot implementations from original reverse engineering
│   ├── record/                   # Packet recording scripts & raw session capture streams (playback/)
│   └── *.js                      # Replay server, API server, and packet relay utilities
│
└── recordings/
    ├── complete.csv              # Parsed tabular telemetry dataset from a full gameplay session
    ├── tourney.csv               # Parsed tabular telemetry dataset from tournament matches
    └── log                       # Raw binary network capture sample
```

---

## Usage in Spaceone Rebuild

1. **Asset Pipeline**:
   - The texture atlases in `assets/atlas/` provide pixel-perfect ship geometries, laser beams, particle effects, and food orbs with exact sprite bounds and UV offsets.
2. **Kinematic & Physics Calibration**:
   - `recordings/complete.csv` and `recordings/tourney.csv` serve as the ground truth for player kinematics, bullet speeds, turning rates, drag forces, and fleet formation physics.
3. **Protocol & Replay Verification**:
   - `server-ansible/` contains packet decoders and websocket playback tools to replay original packet captures against client implementations.
