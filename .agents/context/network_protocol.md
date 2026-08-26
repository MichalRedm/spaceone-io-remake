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
