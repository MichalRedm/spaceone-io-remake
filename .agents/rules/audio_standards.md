# Audio Design & Web Audio Engineering Standards

> [!IMPORTANT]
> **Trigger Paths**: `Game.Engine/wwwroot/src/audio/**`, `Game.Engine/wwwroot/audio/**`, `tools/sfx/**`
> **When to Read**: MUST be read before generating, tuning, replacing, or wiring any sound effect asset, Web Audio mixing parameter, or UI sound control.

This document formalizes the **Source of Truth** for procedural sound effect synthesis, mix architecture, concurrency control, and verification in **Spaceone.io Remake**. Every law below was empirically derived and validated through iterative solo and multi-voice combat stress-mix auditions.

---

## 1. Six Core Sound Design Laws (Empirical Invariants)

1. **Harmonic Partitioning (Anti-Cacophony Law)**:
   - **Rule**: Frequent combat, damage, and fleet-progression cues (`laser_fire`, `bullet_hit`, `ship_explode`, `ship_gain`, `kill_confirm`, `boost`) MUST NEVER carry sustained chromatic chords, transposed chord variants across `1..N`, or ringing modal bell overtones. Overlapping multiple pitched voices during skirmishes produces atonal cluster cacophony.
   - **Implementation**:
     - Frequent combat cues use **unpitched kinetic sub-bass percussion**, rapid non-stationary downward plasma sweeps (no stationary held pitch), or understated single-pulse low docking thumps.
     - Consonant **single-key harmony** (`E minor pentatonic` / `D-A-E-B` open fifths and major-9ths) is reserved strictly for light own-player pickups (`food_collect`) and rare lifecycle/event stingers (`player_spawn`, `player_death`, `ctf_event`, `ctf_victory`).
2. **Anticipation Contrast for Heavy Destruction (`ship_explode`, `player_death`)**:
   - **Rule**: High-impact destruction cues win perceived weight through time-domain contrast rather than clipping distortion: precede the seismic sub-bass drop with a **34–52 ms vacuum inhale** (rising stereo air + inward low-pressure pull) and a **~14 ms near-silent gap**.
3. **Zero-Latency Tactile Onset for Frequent Actions (`laser_fire`, `bullet_hit`, `food_collect`, `ui_click`)**:
   - **Rule**: High-frequency player actions and pickups MUST have an immediate onset (`< 3 ms` attack, zero pre-delay inhale) so firing and maneuvering feel instantaneous and responsive.
4. **Bass-First Warmth & Open Full-Spectrum Hi-Fi (Zero "Covered Speaker" Veil)**:
   - **Rule**: Anchor explosions, boosts, and kinetic impacts in phase-continuous `28–160 Hz` sub-bass plus warm 2nd/3rd harmonics (`clean_sub_punch`) so weight translates on both subwoofers and small laptop speakers. `boost` MUST sit firmly in the low cosmic warp register (`36→78→36 Hz` + low `D2-A2-D3` fifth), avoiding bright high-mid glare.
   - **Prohibition**: Never use noise-based impulse-response convolution reverb, IIR Butterworth multiband crossovers, or heavy master `tanh` saturation—together they impart a phase-smeared, muffled "covered speaker" blanket.
5. **Pure Algorithmic Space & Un-Truncated Natural Tails**:
   - **Rule**: Synthesize spatial depth with the pure algorithmic 4-stage Schroeder allpass + **8-channel Orthogonal Hadamard FDN Reverb** (`studio_fdn_reverb`), keeping reverb sends high-passed (`hp_hz = 260–480 Hz`) so sub-bass remains dry, punchy, and mud-free.
   - **Full Timeline Rendering**: Every `.mp3` MUST span its complete dry transient plus `> 1.2× RT60` natural decay (`0.55–3.00 s`) and a `120–300 ms` cosine boundary fade-out (`TailEnd <= -48 dBFS`), eliminating abrupt cutoff sensations.
6. **Zero-Phase Mastering & Transparent Encoding**:
   - **Rule**: Master exclusively with zero-phase FFT Mastering EQ (`linear_phase_master_eq`: `-3.5 dB` de-mud @ `310 Hz`, `+1.5 dB` presence @ `4.8 kHz`, `+3.0 dB` air `> 8.5 kHz`), 5 ms lookahead peak limiting (`transparent_limiter`), and **LAME V0** (`-q:a 0`, `44.1 kHz`) so high-frequency air never suffers MP3 pre-echo or low-pass dulling.

---

## 2. Runtime Web Audio Architecture & Mixing Rules

- **Zero-Dependency Native Web Audio Engine (`Game.Engine/wwwroot/src/audio/`)**:
  - Maintain submix topology: `weapons` / `explosions` / `gameplay` / `ui` `GainNode`s -> master `DynamicsCompressorNode` (`-14 dBFS` threshold, `6:1` ratio) -> `masterGain` -> `destination`.
  - **Gesture-Only Context Unlock**: Instantiate and `resume()` `AudioContext` strictly inside user gesture listeners (`pointerdown`, `keydown`, `touchstart`, `click`); prefetch raw assets lazily without blocking page load.
- **Zero-Detune Harmonic Pitch Lock (`soundManifest.ts`)**:
  - All harmonic/melodic cues (`food_collect`, `boost`, `ship_gain`, `kill_confirm`) MUST lock `pitchJitter: 0.0` so overlapping notes never drift out of key.
  - Only unpitched percussive combat cues (`laser_fire`, `bullet_hit`, `ship_explode`) may use micro-pitch jitter (`0.04–0.05`) alongside non-repeating variant selection.
- **Own-Fleet & Snapshot Coalescing (`cache.ts`, `gameAudio.ts`)**:
  - Suppress initial server snapshots (`INITIAL_SNAPSHOT_SUPPRESS_COUNT = 2`) on arena join/reset and gate world triggers while `document.hidden || window.Game?.isBackgrounded`.
  - Deduplicate laser volleys per group per tick (prioritizing own-fleet proximity) and coalesce `bullet_hit` when a ship explosion or pellet pickup occurs at the same coordinates.
  - Gate `food_collect` emissions to **own-fleet proximity (`260` world units)** when alive (capped at `<= 1` chime per snapshot tick) so enemy/bot pellet consumption never spams combat audio.
- **Smooth Voice Stealing**: Enforce global polyphony cap (`16`) and per-cue `maxConcurrent` limits with priority ordering and **`VOICE_STEAL_FADE_SEC >= 0.035`** (`35 ms` anti-click crossfade) so clipped long tails never pop.
- **UI Minimalism**: Keep menu controls compact beside `Graphics` in `view-state--menu` (`#settings-toggle` + `#sound-toggle`, synced with `#settings-sound-enabled` and `#settings-sound-volume` in `localStorage` key `spaceone_settings`, enabled at `100%` by default), with `M` toggle bound **only while in-game** (`GameAudio.isInGame()`).

---

## 3. Mandatory Verification & Multimodal Listening Gate

Every edit to `tools/sfx/generate_sfx.py` or `Game.Engine/wwwroot/audio/*.mp3` MUST pass **all three** verification gates before committing:

1. **Automated DSP & Tail QC (`python tools/sfx/generate_sfx.py`)**:
   - All `20` expected `.mp3` files present and decoded via `ffmpeg`.
   - Peaks strictly within `[-4.5, -0.2] dBFS`, zero clipping (`peak < 0.999`), `DC offset < 1e-3`, and `TailEnd <= -48.0 dBFS` over the final `80 ms`.
   - When tuning bass-heavy low-crest cues (`boost`, `ship_gain`, `bullet_hit`), calibrate `target_rms_dbfs` in `finish_hifi()` or transient punch so peaks remain well above `-4.5 dBFS` without harsh clipping.
2. **Solo Multimodal Audition (`read_file`)**:
   - Directly listen to every newly added or modified `.mp3` using multimodal `read_file` to verify zero clicks, zero static fizz, open Hi-Fi tone, and smooth tail fade-outs.
3. **Dense Multi-Voice Stress-Mix Audition**:
   - Mix overlapping rapid `laser_fire`, `bullet_hit`, `ship_explode`, `kill_confirm`, `food_collect`, `ship_gain`, and `boost` events at exact runtime manifest gains into a scratch `.mp3` and listen via `read_file` to confirm zero cacophony, zero low-end mud, and clean hierarchy before committing.

---

## 4. Anti-Pattern & Pitfall Traps Table

| Anti-Pattern Trap | Why It Fails | Golden Pattern |
| :--- | :--- | :--- |
| **Transposed Chords & Ringing Bells on Frequent Combat SFX** | Overlapping 3–4 explosions or rapid lasers in pitched chords/bells (`G2`/`A2`/`B2` + `440 Hz+`) collides into atonal cacophony during fights. | Use unpitched seismic sub-bass percussion (`126→28 Hz`), non-stationary downward plasma whips, and `hp_hz = 280–480 Hz` reverb sends on combat SFX. |
| **Applying Random `pitchJitter` to Melodic Cues** | Continuous pitch randomization (`±3–6%`) detunes consecutive notes of `food_collect` or `boost`, sounding out of key when overlapped. | Keep `pitchJitter: 0.0` on all harmonic/melodic cues; reserve `pitchJitter` exclusively for unpitched percussive cues. |
| **Triggering `food_collect` for Every Arena Pellet Deletion** | Bot/enemy swarms eating nearby pellets spams overlapping chimes during player combat. | Coalesce to `<= 1` pickup per tick gated within `OWN_FOOD_PROXIMITY_SQ` (`260²`) of own ships while alive. |
| **Noise-IR Convolution + Butterworth Crossovers + Master `tanh`** | Acts like a dull low-pass filter blanket ("covered speaker" effect) and smears transients. | Use pure algorithmic 8-channel Orthogonal Hadamard FDN reverb + zero-phase FFT EQ + 5 ms lookahead limiting. |
| **Raw Un-Tapered Mid-High Noise Bursts Under `+3 dB` Air Shelf** | White/bandpassed noise in `750–14500 Hz` amplifies above `8.5 kHz` into drum-kit hi-hat/snare static. | Replace dry mid noise with swept sine whips (`f_zip`) or keep subtle filtered air low-passed / FDN-diffused cleanly. |
| **Default `-15.5 dBFS` RMS Target on Sustained Low-Bass Cues** | Low-crest sustained bass (`boost`) scaled to `-15.5` RMS drops below the `-4.5 dBFS` peak floor (`-4.7 dBFS`). | Pass explicit `target_rms_dbfs` (e.g. `-12.8 dBFS`) into `finish_hifi()` for bass-sustained cues to keep peaks around `-2 dBFS`. |
| **Buffer Clamping Shorter Than `1.2× RT60`** | Reverb tail gets sliced before natural decay, creating an audible abrupt gate/cutoff at file end. | Allocate full `dur >= dry + 1.2× RT60`, fade final `120–300 ms` smoothly, and enforce `TailEnd <= -48 dBFS` in `run_qc`. |
