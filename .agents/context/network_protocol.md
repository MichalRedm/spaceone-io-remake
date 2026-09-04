# Network Protocol and FlatBuffers Schema

## 1. Transport Layer
- **Protocol**: Binary WebSocket (`ws://` / `wss://`).
- **Framing**: Binary payloads serialized via Google FlatBuffers for zero-copy deserialization in both C# and JavaScript.

## 2. Packet Flow

```
Client                                  Server
  |                                       |
  | -------- Handshake / Join ----------> | (Authenticate, allocate player slot)
  | <------- World Initialization ------ | (Map bounds, rules, spawn coordinates)
  | <------- NetEvent ("hook") ---------- | (Dynamic World Hook SSOT JSON broadcast)
  |                                       |
  | [ Game Loop ~60Hz ]                   | [ Server Loop ~60Hz ]
  | -------- Control Input -------------> | (Heading vector, boost, fire triggers)
  | <------- World Snapshot Update ----- | (Visible entities, leaderboard, health)
  |                                       |
```

## 3. World Configuration Synchronization (SSOT)

To avoid hardcoded duplicated physics/kinematic constants on the client:
- **Server Single Source of Truth (`Hook.cs`)**: Server authoritative parameters (`ShotThrust`, `BulletLifeTable`, `ShotThrustConverter`, `BoostDuration`, `SpawnInvulnerabilityTime`, `InvulnerabilityBlinkPeriod`) are stored in `Hook.cs`.
- **In-Band WebSocket Broadcast**: Upon client connection or dynamic hook updates on the server, `Connection.cs` broadcasts a `NetEvent` with `type = "hook"` containing the JSON-serialized `Hook` state.
- **REST Endpoint**: Anonymous `GET /api/v1/world/hook?worldName=...` exposes the active world hook for pre-connection lobby inspection and tooling.
- **Client Configuration Store (`worldConfig.ts`)**: Manages active world settings with defaults, updating dynamically whenever `"hook"` events arrive.

## 4. Telemetry Log Structure (`complete.csv` / `tourney.csv`)

Original recorded telemetry captures tabular states:
- `time`: Unix millisecond timestamp.
- `fleet_id` / `player_name`: Entity identifier.
- `x`, `y`: World coordinates.
- `angle`: Heading in radians.
- `ship_count`: Size of player fleet.
- `score` / `rank`: Game stats and leaderboard standing.

## 5. Arena Links & World Routing Architecture

- **World vs. Game Mode Separation**:
  - **Server / Region**: Host address (`localhost:5000`, `us.spaceone.io`, `eu.spaceone.io`).
  - **Game Mode**: Gameplay ruleset (`ffa`, `ctf`, `team`, `robo`, `duel`, `sumo`).
  - **World Key**: Stable canonical identifier (`default`, `ctf`, `team`, `robo`, `duel`).
  - **Arena ID**: 6-character random alphanumeric ephemeral session token (e.g. `xK92Lp`).
- **URL Addressing Rules**:
  - Normal visits leave the browser address bar clean (`/` or `/#robo`), persisting preferences in `localStorage`.
  - Shareable clipboard links format as `https://spaceone.io/#<worldKey>:<arenaID>` (e.g. `/#robo:xK92Lp`).
- **Resilient Fallback Hierarchy**:
  1. Exact `ArenaID` match connects to the specific room instance.
  2. If the instance is expired (server restart / room reset), the server and client resolve the `<worldKey>` prefix, auto-joining the active room for that game mode and displaying a friendly notice rather than an error modal.
  3. Private or unknown links trigger dedicated status dialogs without dropping blindly to default FFA.
