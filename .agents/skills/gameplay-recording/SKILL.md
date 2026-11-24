---
name: gameplay-recording
description: Record live Spaceone.io Remake gameplay to lossless .s1rec streams, inspect/export telemetry trajectories, and render deterministic player-accurate MP4 videos with spatial SFX for human playback or multimodal AI analysis.
---

# Gameplay Recording & Replay Toolkit

Use this skill whenever you need to capture gameplay videos or binary telemetry sessions, evaluate `HumanoidBot` / `ContextRobot` behavior visually, inspect physics/flocking/VFX/audio behavior via multimodal `read_file`, or produce human-watchable gameplay clips.

---

## 1. Environment & Prerequisites

The toolkit lives in `tools/recorder/` and manages its own isolated Python environment via `uv`:

```powershell
# First-time setup (creates tools/recorder/.venv and installs Playwright Chromium if missing)
uv sync --project tools/recorder
uv run --project tools/recorder playwright install chromium

# Required once whenever client TypeScript/SCSS changes (renderer serves dist/ offline)
cd Game.Engine/wwwroot && npm run build && cd ../..
```

All commands below assume execution from the repository root using:
```powershell
uv run --project tools/recorder python -m tools.recorder <subcommand> ...
```

---

## 2. Two-Stage Architecture (`.s1rec` -> `.mp4`)

1. **Capture (`.s1rec` / `.s1rec.gz`)**: Connects via WebSocket (`/api/v1/connect?world=...&observer=1`) as a passive zero-overhead observer (does not count toward `PlayerCount` or `SpectatorCount` and never switches targets on death). Writes timestamped `NetQuantum` FlatBuffer packets + JSON metadata header.
2. **Offline Render (`.mp4` / PNG frames)**: Launches headless Playwright Chromium with `?replay=1`, injects `.s1rec` packets into the **real PixiJS WebGL client + DOM HUD + `AudioManager` (`OfflineAudioContext`)** on a deterministic virtual clock, and muxes frames + sample-accurate stereo SFX via `ffmpeg`. **No running game server is required during `render` or `frames`.**

---

## 3. Command Reference

### Discover Worlds & Active Players/Bots
```powershell
# List worlds/arenas
uv run --project tools/recorder python -m tools.recorder worlds --server http://localhost:5000

# List active players & bots with PlayerID, FleetID, score, ship count, color
uv run --project tools/recorder python -m tools.recorder players --server http://localhost:5000 --world default

# Alternative C# CLI discovery
dotnet run --project Game.Util -- --server http://localhost:5000 server connections --world default
```

### Record Live Gameplay (`record`)
- **Tracking targets**:
  - `--player-id <idPrefix>` / `--player-name <name>` / `--fleet-id <id>`: Track a specific player/bot (defaults to **POV mode** `--pov`, locking onto their `PlayerID` across deaths/respawns and mirroring HUD cooldowns, fleet size, own name, tracking arrows, and kill banners; pass `--no-pov` for detached spectator view).
  - `--leader`: Dynamically follow the #1 arena leader (with 3s hysteresis).
  - `--auto`: Classic spectator auto-follow.
  - `--point X,Y`: Fixed world camera coordinate.
  - `--top N` / `--all-players`: Record multiple fleets concurrently in one command (`--output-dir recordings/`).
  - `--wait-for-target <sec>`: Poll until a bot/player connects before starting.
- **Termination triggers**:
  - `--duration <sec>`: Fixed duration (`0` = indefinite until Ctrl+C / `stop`).
  - `--wait-for-spawn`: Start the recording timer once the target spawns alive.
  - `--stop-on-death` + `--post-death-delay 1.5`: Stop automatically after the tracked player dies (capturing trailing explosion/death audio).
  - `--stop-on-disconnect`: Stop if the tracked player disconnects.
  - `--background --session <name>`: Run capture detached in the background; stop cleanly later with `stop`.
- **Output & Render flags**:
  - `-o <path.s1rec|path.s1rec.gz|path.mp4>`: Saving to `.s1rec` skips MP4 rendering for ultra-fast capture; saving to `.mp4` captures `.s1rec` and renders `.mp4` automatically (use `--no-keep-replay` to discard intermediate `.s1rec`).
  - `--profile agent` (`960x540`, 30fps, CRF 24), `--profile human` (`1280x720`, 30fps, CRF 20), `--profile hd` (`1920x1080`, 60fps, CRF 18).
  - `--viewport WxH`, `--fps`, `--crf`, `--no-audio`, `--audio-volume 0..100`, `--graphics high|medium|low`, `--zoom <worldUnits>`.
  - `--ui-preset player|spectator|clean|none` + `--ui-show` / `--ui-hide` over all 15 keys: `leaderboard, arenaRecord, names, ownName, fleetSize, cooldown, autofire, trackingArrows, killBanner, scorePopups, dangerZone, ctfHud, fpsHud, vignette, deathMenu`.
  - `--overlay-info`: Burn a compact developer telemetry bar (timestamp, server tick, fleet ID, ship count, camera coords).

### Manage & Stop Background Captures (`sessions` / `stop`)
```powershell
# List active & stale background sessions (--prune cleans dead session metadata)
uv run --project tools/recorder python -m tools.recorder sessions --prune

uv run --project tools/recorder python -m tools.recorder stop --session my_match
uv run --project tools/recorder python -m tools.recorder stop --all
```

### Offline Conversion, Keyframes, Inspection & Trajectory Export
```powershell
# Re-render .s1rec offline at any viewport, speed, trim window, or UI preset
uv run --project tools/recorder python -m tools.recorder render recordings/match.s1rec -o recordings/fight_slowmo.mp4 --profile agent --start 12 --end 18 --speed 0.5 --overlay-info

# Inspect metadata, duration, alive spans, fleet IDs, and kill announcements
uv run --project tools/recorder python -m tools.recorder inspect recordings/match.s1rec

# Export reconstructed per-tick entity kinematics to CSV or JSONL for analysis/
uv run --project tools/recorder python -m tools.recorder export recordings/match.s1rec -o recordings/traj.csv --tracked-only --ships-only

# Extract crisp PNG frames or a tiled contact sheet for rapid visual review
uv run --project tools/recorder python -m tools.recorder frames recordings/match.s1rec -o recordings/frames --interval 2.0 --contact-sheet
```

---

## 4. Multimodal AI Clip Guidelines

When recording clips for the AI agent to watch via `read_file`:
- **Optimal Clip Length**: Keep clips between **15 and 25 seconds** (`--duration 20`). Longer videos bloat token budgets; split long sessions into multiple focused `.mp4` renders via `--start` / `--end`.
- **Optimal Preset**: Always prefer **`--profile agent`** (`960x540 @ 30fps`, CRF `24`, ~2–4 MB per 20s clip) for routine multimodal reviews, and use **`--speed 0.5 --overlay-info`** on a trimmed 4–6s slice when inspecting fast micro-mechanics (bullet spawn muzzle offset, ship separation bounce, turn curvature).
- **Pair Video + Data**: Keep the `.s1rec` file! Watch the `.mp4` with `read_file` to spot behavioral/visual issues, then run `export` on the exact same `.s1rec` to inspect exact numeric coordinates/velocities in Python.

---

## 5. Agentic Playbooks

### Playbook A: Physics Tuning & Visual Parity
1. Start the game server (`dotnet run --project Game.Engine`) in the background.
2. Spawn test bots (e.g. `HumanoidBot` or a scripted calibration bot):
   ```powershell
   dotnet run --project Game.Util -- --server http://localhost:5000 player robots --world default --type-name Game.Robots.Framework.HumanoidBot --replicas 4 --name PhysBot
   ```
3. Record the top 2–3 fleets concurrently for 20s:
   ```powershell
   uv run --project tools/recorder python -m tools.recorder record --top 3 --duration 20 --profile agent --ui-preset clean --overlay-info --output-dir recordings/phys_run1
   ```
4. Inspect each `.mp4` via multimodal `read_file` alongside `export ... --ships-only` CSV trajectories against `reference/space1-original/recordings/` (`analysis/`).
5. Re-render interesting 5-second maneuvers at `0.5x` slow motion (`render ... --start 8 --end 13 --speed 0.5`).

### Playbook B: Bot AI Behavior Evaluation (`HumanoidBot` / `ContextRobot`)
1. Spawn bots with targeted parameters (`--level`, `--playstyle`, or `--bot-params`):
   ```powershell
   dotnet run --project Game.Util -- --server http://localhost:5000 player robots --world default --type-name Game.Robots.Framework.HumanoidBot --name EvalPro --level 0.9 --playstyle Aggressive
   ```
2. Record waiting automatically for the bot to connect and spawn, stopping cleanly if it dies:
   ```powershell
   uv run --project tools/recorder python -m tools.recorder record --player-name EvalPro --wait-for-target 15 --wait-for-spawn --stop-on-death --duration 25 --profile agent --overlay-info -o recordings/eval_pro.mp4
   ```
3. Watch `recordings/eval_pro.mp4` via `read_file` to verify aiming lead, bullet dodging, danger-zone avoidance, and boost split timing.

### Playbook C: Rendering, Viewport, UI & Spatial Audio Verification
Render one `.s1rec` across multiple viewports and UI settings without restarting the game:
```powershell
uv run --project tools/recorder python -m tools.recorder render recordings/match.s1rec -o recordings/hd.mp4 --profile hd
uv run --project tools/recorder python -m tools.recorder render recordings/match.s1rec -o recordings/clean_1000x500.mp4 --viewport 1000x500 --ui-preset clean --no-audio
```
Open the `.mp4` with `read_file` to verify PixiJS glow/particles, DOM HUD scaling, and spatialized stereo Web Audio SFX timing.

### Playbook D: Reproducible Bug Capture & PR Evidence
1. Reproduce the bug while recording `--duration 15` (or `--background --session repro` followed by `stop`).
2. Render a crisp `--profile agent` or `human` MP4 slice trimming directly around the anomaly (`--start ... --end ...`), inspect via `read_file`, and embed/reference results in your walkthrough.
