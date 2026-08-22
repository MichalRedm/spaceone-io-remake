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
  |                                       |
  | [ Game Loop ~60Hz ]                   | [ Server Loop ~60Hz ]
  | -------- Control Input -------------> | (Heading vector, boost, fire triggers)
  | <------- World Snapshot Update ----- | (Visible entities, leaderboard, health)
  |                                       |
```

## 3. Telemetry Log Structure (`complete.csv` / `tourney.csv`)

Original recorded telemetry captures tabular states:
- `time`: Unix millisecond timestamp.
- `fleet_id` / `player_name`: Entity identifier.
- `x`, `y`: World coordinates.
- `angle`: Heading in radians.
- `ship_count`: Size of player fleet.
- `score` / `rank`: Game stats and leaderboard standing.
