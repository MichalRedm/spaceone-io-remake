#!/usr/bin/env python3
"""
Procedural Ambient Sci-Fi SFX Generator & QC Verifier for Spaceone.io Remake.

Synthesizes 20 deterministic, ambient-style abstract space shooter sound effects
using NumPy/SciPy DSP and encodes them to 160 kbps LAME MP3 via ffmpeg.

Usage:
    python tools/sfx/generate_sfx.py
    python tools/sfx/generate_sfx.py --verify-only
"""

from __future__ import annotations

import argparse
import math
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import Callable, Dict, List, Tuple

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SAMPLE_RATE = 44100
TARGET_PEAK_DBFS = -1.5
EXPECTED_FILES = [
    "laser_fire_1.mp3",
    "laser_fire_2.mp3",
    "laser_fire_3.mp3",
    "bullet_hit_1.mp3",
    "bullet_hit_2.mp3",
    "food_collect_1.mp3",
    "food_collect_2.mp3",
    "food_collect_3.mp3",
    "ship_explode_1.mp3",
    "ship_explode_2.mp3",
    "ship_explode_3.mp3",
    "boost.mp3",
    "ship_gain.mp3",
    "kill_confirm.mp3",
    "player_spawn.mp3",
    "player_death.mp3",
    "danger_zone.mp3",
    "ctf_event.mp3",
    "ctf_victory.mp3",
    "ui_click.mp3",
]


def find_ffmpeg() -> str:
    """Resolve the ffmpeg executable path."""
    which = shutil.which("ffmpeg")
    if which:
        return which
    win_default = Path(r"C:\Tools\ffmpeg.exe")
    if win_default.exists():
        return str(win_default)
    raise FileNotFoundError("ffmpeg executable not found on PATH or at C:\\Tools\\ffmpeg.exe")


def ensure_stereo(audio: np.ndarray) -> np.ndarray:
    """Promote mono (N,) audio to stereo (N, 2) or return (N, 2) as float64."""
    arr = np.asarray(audio, dtype=np.float64)
    if arr.ndim == 1:
        return np.column_stack([arr, arr])
    if arr.ndim == 2 and arr.shape[1] == 2:
        return arr
    raise ValueError(f"Expected 1D mono or (N, 2) stereo array, got shape {arr.shape}")


def apply_filter_per_channel(
    audio: np.ndarray, fn: Callable[[np.ndarray], np.ndarray]
) -> np.ndarray:
    """Apply a 1D DSP filter function independently to each channel."""
    st = ensure_stereo(audio)
    out = np.empty_like(st)
    out[:, 0] = fn(st[:, 0])
    out[:, 1] = fn(st[:, 1])
    return out


def butter_lowpass(audio: np.ndarray, cutoff_hz: float, order: int = 3) -> np.ndarray:
    """Apply a Butterworth low-pass filter safely clamped below Nyquist."""
    cutoff = max(20.0, min(cutoff_hz, SAMPLE_RATE * 0.45))
    sos = butter(order, cutoff / (0.5 * SAMPLE_RATE), btype="low", output="sos")
    return apply_filter_per_channel(audio, lambda ch: sosfilt(sos, ch))


def butter_highpass(audio: np.ndarray, cutoff_hz: float, order: int = 2) -> np.ndarray:
    """Apply a Butterworth high-pass filter safely clamped below Nyquist."""
    cutoff = max(15.0, min(cutoff_hz, SAMPLE_RATE * 0.45))
    sos = butter(order, cutoff / (0.5 * SAMPLE_RATE), btype="high", output="sos")
    return apply_filter_per_channel(audio, lambda ch: sosfilt(sos, ch))


def butter_bandpass(
    audio: np.ndarray, low_hz: float, high_hz: float, order: int = 2
) -> np.ndarray:
    """Apply a Butterworth band-pass filter."""
    lo = max(20.0, min(low_hz, SAMPLE_RATE * 0.40))
    hi = max(lo + 40.0, min(high_hz, SAMPLE_RATE * 0.45))
    sos = butter(
        order,
        [lo / (0.5 * SAMPLE_RATE), hi / (0.5 * SAMPLE_RATE)],
        btype="band",
        output="sos",
    )
    return apply_filter_per_channel(audio, lambda ch: sosfilt(sos, ch))


def dynamic_lowpass_sweep(
    signal_1d: np.ndarray, cutoff_curve: np.ndarray, q: float = 0.707
) -> np.ndarray:
    """
    Time-varying 2nd-order low-pass biquad filter with per-block coefficient interpolation.
    Produces smooth, organic filter sweeps without zipper noise.
    """
    n = len(signal_1d)
    block = 64
    out = np.zeros(n, dtype=np.float64)
    z1 = 0.0
    z2 = 0.0
    nyq = 0.5 * SAMPLE_RATE
    for start in range(0, n, block):
        end = min(n, start + block)
        fc = float(np.clip(cutoff_curve[(start + end) // 2], 30.0, nyq * 0.85))
        w0 = 2.0 * math.pi * fc / SAMPLE_RATE
        cos_w0 = math.cos(w0)
        alpha = math.sin(w0) / (2.0 * q)
        b0 = (1.0 - cos_w0) * 0.5
        b1 = 1.0 - cos_w0
        b2 = b0
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha

        b0n, b1n, b2n = b0 / a0, b1 / a0, b2 / a0
        a1n, a2n = a1 / a0, a2 / a0

        for i in range(start, end):
            x = signal_1d[i]
            y = b0n * x + z1
            z1 = b1n * x - a1n * y + z2
            z2 = b2n * x - a2n * y
            out[i] = y
    return out


def dynamic_bandpass_sweep(
    signal_1d: np.ndarray, center_curve: np.ndarray, q: float = 2.0
) -> np.ndarray:
    """Time-varying 2nd-order resonant band-pass biquad filter."""
    n = len(signal_1d)
    block = 64
    out = np.zeros(n, dtype=np.float64)
    z1 = 0.0
    z2 = 0.0
    nyq = 0.5 * SAMPLE_RATE
    for start in range(0, n, block):
        end = min(n, start + block)
        fc = float(np.clip(center_curve[(start + end) // 2], 40.0, nyq * 0.85))
        w0 = 2.0 * math.pi * fc / SAMPLE_RATE
        cos_w0 = math.cos(w0)
        sin_w0 = math.sin(w0)
        alpha = sin_w0 / (2.0 * q)
        b0 = alpha
        b1 = 0.0
        b2 = -alpha
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha

        b0n, b1n, b2n = b0 / a0, b1 / a0, b2 / a0
        a1n, a2n = a1 / a0, a2 / a0

        for i in range(start, end):
            x = signal_1d[i]
            y = b0n * x + z1
            z1 = b1n * x - a1n * y + z2
            z2 = b2n * x - a2n * y
            out[i] = y
    return out


def soft_triangle(phase: np.ndarray) -> np.ndarray:
    """Smooth band-softened triangle wave using fundamental + rounded 3rd/5th partials."""
    return 0.86 * np.sin(phase) - 0.11 * np.sin(3.0 * phase) + 0.03 * np.sin(5.0 * phase)


def warm_saw(phase: np.ndarray, max_harmonics: int = 7) -> np.ndarray:
    """Band-limited warm additive sawtooth (zero aliasing)."""
    out = np.zeros_like(phase, dtype=np.float64)
    for k in range(1, max_harmonics + 1):
        weight = ((-1.0) ** (k + 1)) / (k ** 1.15)
        out += weight * np.sin(k * phase)
    return out * 0.65


def pink_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    """Generate smooth 1/f-weighted noise using a 3-pole Paul Kellet approximation."""
    white = rng.standard_normal(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1.0, -2.494956002, 2.017265875, -0.522189400]
    pink = lfilter(b, a, white)
    max_v = np.max(np.abs(pink))
    return pink / max_v if max_v > 0 else pink


def raised_cosine_fades(
    audio: np.ndarray, fade_in_ms: float = 4.0, fade_out_ms: float = 18.0
) -> np.ndarray:
    """Apply smooth raised-cosine fades at boundaries to eliminate clicks/pops."""
    st = ensure_stereo(audio).copy()
    n = st.shape[0]
    fi = min(n // 3, max(1, int(SAMPLE_RATE * fade_in_ms / 1000.0)))
    fo = min(n // 2, max(1, int(SAMPLE_RATE * fade_out_ms / 1000.0)))
    in_env = 0.5 * (1.0 - np.cos(math.pi * np.linspace(0.0, 1.0, fi)))
    out_env = 0.5 * (1.0 + np.cos(math.pi * np.linspace(0.0, 1.0, fo)))
    st[:fi, :] *= in_env[:, None]
    st[-fo:, :] *= out_env[:, None]
    return st


def space_reverb(
    audio: np.ndarray,
    wet: float = 0.25,
    decay: float = 0.38,
    damping_hz: float = 3400.0,
) -> np.ndarray:
    """
    Lightweight stereo cosmic early-reflection + parallel damped comb space diffuser.
    Adds lush ambient depth without muddying transients.
    """
    st = ensure_stereo(audio)
    n = st.shape[0]
    wet_buf = np.zeros_like(st)

    taps_l = [(int(0.011 * SAMPLE_RATE), 0.42), (int(0.023 * SAMPLE_RATE), 0.28), (int(0.041 * SAMPLE_RATE), 0.18), (int(0.067 * SAMPLE_RATE), 0.11)]
    taps_r = [(int(0.014 * SAMPLE_RATE), 0.40), (int(0.029 * SAMPLE_RATE), 0.26), (int(0.047 * SAMPLE_RATE), 0.17), (int(0.073 * SAMPLE_RATE), 0.10)]

    for delay, gain in taps_l:
        if delay < n:
            wet_buf[delay:, 0] += st[: n - delay, 0] * gain
            wet_buf[delay:, 1] += st[: n - delay, 0] * (gain * 0.35)
    for delay, gain in taps_r:
        if delay < n:
            wet_buf[delay:, 1] += st[: n - delay, 1] * gain
            wet_buf[delay:, 0] += st[: n - delay, 1] * (gain * 0.35)

    # Second diffusion pass for smooth tail
    diff_delay_l = int(0.031 * SAMPLE_RATE)
    diff_delay_r = int(0.037 * SAMPLE_RATE)
    if diff_delay_l < n:
        wet_buf[diff_delay_l:, 0] += wet_buf[: n - diff_delay_l, 1] * decay
    if diff_delay_r < n:
        wet_buf[diff_delay_r:, 1] += wet_buf[: n - diff_delay_r, 0] * decay

    wet_buf = butter_lowpass(wet_buf, damping_hz, order=2)
    return (1.0 - wet * 0.35) * st + wet * wet_buf


def stereo_widen(mono_or_stereo: np.ndarray, delay_ms: float = 1.6, amount: float = 0.25) -> np.ndarray:
    """Create gentle stereo ambience by cross-blending a micro-delayed anti-phase Haas component."""
    st = ensure_stereo(mono_or_stereo).copy()
    d = max(1, int(SAMPLE_RATE * delay_ms / 1000.0))
    if d < st.shape[0]:
        side = np.zeros(st.shape[0], dtype=np.float64)
        side[d:] = st[: st.shape[0] - d, 0] - st[: st.shape[0] - d, 1] * 0.5
        st[:, 0] += amount * side
        st[:, 1] -= amount * side
    return st


def normalize_and_polish(
    audio: np.ndarray,
    peak_dbfs: float = TARGET_PEAK_DBFS,
    fade_in_ms: float = 3.0,
    fade_out_ms: float = 18.0,
) -> np.ndarray:
    """Remove DC offset, apply smooth boundary fades, and normalize peak amplitude."""
    st = ensure_stereo(audio)
    st = st - np.mean(st, axis=0, keepdims=True)
    st = raised_cosine_fades(st, fade_in_ms=fade_in_ms, fade_out_ms=fade_out_ms)
    # Remove any residual DC introduced after fading
    st = st - np.mean(st, axis=0, keepdims=True)
    st = raised_cosine_fades(st, fade_in_ms=min(2.0, fade_in_ms), fade_out_ms=min(8.0, fade_out_ms))
    peak = float(np.max(np.abs(st)))
    if peak > 1e-9:
        target_lin = 10.0 ** (peak_dbfs / 20.0)
        st = st * (target_lin / peak)
    return np.clip(st, -0.99, 0.99)


# -----------------------------------------------------------------------------
# Ambient Abstract Space Shooter Sound Recipes
# -----------------------------------------------------------------------------


def synth_laser_fire(variant: int) -> np.ndarray:
    """Soft, glassy ambient plasma pulse with subtle cosmic shimmer."""
    rng = np.random.default_rng(100 + variant)
    dur = [0.155, 0.165, 0.148][variant - 1]
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    f_start = [1180.0, 1260.0, 1090.0][variant - 1]
    f_end = [235.0, 255.0, 215.0][variant - 1]
    tau = [0.036, 0.034, 0.038][variant - 1]

    freq = f_end + (f_start - f_end) * np.exp(-t / tau)
    phase = 2.0 * math.pi * np.cumsum(freq) / SAMPLE_RATE
    phase_harm = 2.0 * math.pi * np.cumsum(freq * 1.503) / SAMPLE_RATE

    # Warm FM pulse + glassy fifth harmonic shimmer
    fm_mod = 0.55 * np.exp(-t / 0.025) * np.sin(phase * 2.0)
    core = np.sin(phase + fm_mod) * 0.65 + soft_triangle(phase) * 0.35
    shimmer = np.sin(phase_harm) * np.exp(-t / 0.045) * 0.22

    # Soft filtered breath transient (rounded, not harsh click)
    puff = butter_bandpass(pink_noise(n, rng), 1800.0, 4800.0, order=2)[:, 0]
    puff *= np.exp(-t / 0.014) * 0.25

    env = (1.0 - np.exp(-t / 0.0025)) * np.exp(-t / 0.042)
    mono = (core + shimmer) * env + puff
    st = stereo_widen(mono, delay_ms=1.2 + 0.3 * variant, amount=0.18)
    st = space_reverb(st, wet=0.22, decay=0.30, damping_hz=3600.0)
    st = np.tanh(st * 1.2)
    return normalize_and_polish(st, peak_dbfs=-2.0, fade_in_ms=2.0, fade_out_ms=22.0)


def synth_bullet_hit(variant: int) -> np.ndarray:
    """Delicate resonant energy spark / shield deflection."""
    rng = np.random.default_rng(200 + variant)
    dur = [0.11, 0.12][variant - 1]
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    f0 = [760.0, 840.0][variant - 1]
    f1 = [280.0, 310.0][variant - 1]
    freq = f1 + (f0 - f1) * np.exp(-t / 0.022)
    phase = 2.0 * math.pi * np.cumsum(freq) / SAMPLE_RATE

    ping = soft_triangle(phase) * np.exp(-t / 0.028) * 0.7
    spark = butter_bandpass(pink_noise(n, rng), 1600.0, 5200.0, order=2)[:, 0]
    spark *= np.exp(-t / 0.018) * 0.45

    st = stereo_widen(ping + spark, delay_ms=1.5, amount=0.22)
    st = space_reverb(st, wet=0.25, decay=0.28, damping_hz=3800.0)
    return normalize_and_polish(st, peak_dbfs=-2.4, fade_in_ms=1.5, fade_out_ms=20.0)


def synth_food_collect(variant: int) -> np.ndarray:
    """Crystalline neon star chime in gentle pentatonic intervals."""
    dur = 0.155
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Pentatonic crystal tones: G5, A5, C6
    base_hz = [783.99, 880.00, 1046.50][variant - 1]
    # Gentle upward pitch blossom (+6% glide)
    freq = base_hz * (0.96 + 0.06 * (1.0 - np.exp(-t / 0.028)))
    phase = 2.0 * math.pi * np.cumsum(freq) / SAMPLE_RATE

    bell = (
        0.72 * np.sin(phase)
        + 0.22 * np.sin(2.0 * phase) * np.exp(-t / 0.045)
        + 0.08 * np.sin(3.01 * phase) * np.exp(-t / 0.025)
    )
    env = (1.0 - np.exp(-t / 0.003)) * np.exp(-t / 0.044)
    st = stereo_widen(bell * env, delay_ms=1.8, amount=0.24)
    st = space_reverb(st, wet=0.30, decay=0.35, damping_hz=4500.0)
    return normalize_and_polish(st, peak_dbfs=-2.2, fade_in_ms=2.5, fade_out_ms=28.0)


def synth_ship_explode(variant: int) -> np.ndarray:
    """Deep resonant sub-thump + warm low-passed cosmic plasma bloom."""
    rng = np.random.default_rng(300 + variant)
    dur = [0.46, 0.49, 0.44][variant - 1]
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Sub-bass drop
    sub_f0 = [112.0, 104.0, 120.0][variant - 1]
    sub_freq = 30.0 + (sub_f0 - 30.0) * np.exp(-t / 0.085)
    sub_phase = 2.0 * math.pi * np.cumsum(sub_freq) / SAMPLE_RATE
    sub = np.sin(sub_phase) * np.exp(-t / 0.145) * 0.85

    # Warm sweeping plasma bloom
    noise = pink_noise(n, rng)
    cutoff = 150.0 + 2300.0 * np.exp(-t / 0.09)
    bloom = dynamic_lowpass_sweep(noise, cutoff, q=0.9)
    bloom *= (1.0 - np.exp(-t / 0.006)) * np.exp(-t / 0.15) * 0.95

    # Delicate stereo shimmer debris
    shimmer_l = butter_bandpass(rng.standard_normal(n), 900.0, 2600.0, order=2)[:, 0]
    shimmer_r = butter_bandpass(rng.standard_normal(n), 950.0, 2700.0, order=2)[:, 0]
    shimmer = np.column_stack([shimmer_l, shimmer_r]) * np.exp(-t[:, None] / 0.085) * 0.22

    st = ensure_stereo(sub + bloom) + shimmer
    st = space_reverb(st, wet=0.32, decay=0.40, damping_hz=2600.0)
    st = np.tanh(st * 1.35)
    return normalize_and_polish(st, peak_dbfs=-1.2, fade_in_ms=2.5, fade_out_ms=45.0)


def synth_boost() -> np.ndarray:
    """Atmospheric plasma-warp turbine whoosh & harmonic pad swell (750 ms)."""
    rng = np.random.default_rng(401)
    dur = 0.75
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Surge envelope aligned with Spaceone boost physics (fast 160ms surge + smooth trail)
    surge_env = (1.0 - np.exp(-t / 0.045)) * np.exp(-np.maximum(0.0, t - 0.14) / 0.24)

    # Warm sweeping filter noise whoosh
    noise = pink_noise(n, rng)
    center = 240.0 + 1050.0 * np.sin(math.pi * np.clip(t / 0.42, 0.0, 1.0)) ** 1.3
    whoosh_l = dynamic_bandpass_sweep(noise, center, q=1.8)
    whoosh_r = dynamic_bandpass_sweep(pink_noise(n, rng), center * 1.04, q=1.8)
    whoosh = np.column_stack([whoosh_l, whoosh_r]) * surge_env[:, None] * 0.9

    # Ethereal fifth-interval turbine hum
    f_root = 92.5 + 48.0 * np.sin(math.pi * np.clip(t / 0.55, 0.0, 1.0))
    p1 = 2.0 * math.pi * np.cumsum(f_root) / SAMPLE_RATE
    p2 = 2.0 * math.pi * np.cumsum(f_root * 1.498) / SAMPLE_RATE
    pad = (0.65 * np.sin(p1) + 0.35 * soft_triangle(p2)) * surge_env * 0.55

    st = whoosh + ensure_stereo(pad)
    st = space_reverb(st, wet=0.34, decay=0.42, damping_hz=3200.0)
    st = np.tanh(st * 1.15)
    return normalize_and_polish(st, peak_dbfs=-1.6, fade_in_ms=10.0, fade_out_ms=90.0)


def synth_ship_gain() -> np.ndarray:
    """Subtle ascending two-note ambient glass interval (G5 -> D6)."""
    dur = 0.24
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    notes = [(0.0, 783.99, 0.10), (0.065, 1174.66, 0.16)]
    mono = np.zeros(n, dtype=np.float64)
    for start_s, freq, tau in notes:
        dt = np.maximum(0.0, t - start_s)
        mask = t >= start_s
        env = np.where(mask, (1.0 - np.exp(-dt / 0.005)) * np.exp(-dt / tau), 0.0)
        tone = 0.78 * np.sin(2.0 * math.pi * freq * dt) + 0.22 * np.sin(4.0 * math.pi * freq * dt) * np.exp(-dt / 0.04)
        mono += tone * env * 0.65

    st = stereo_widen(mono, delay_ms=2.1, amount=0.28)
    st = space_reverb(st, wet=0.35, decay=0.40, damping_hz=4800.0)
    return normalize_and_polish(st, peak_dbfs=-2.0, fade_in_ms=3.0, fade_out_ms=40.0)


def synth_kill_confirm() -> np.ndarray:
    """Warm sub-pulse + shimmering major-9th ambient bell arpeggio (C5-G5-D6)."""
    dur = 0.38
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Subtle low-mid confirm thump
    thump_f = 65.0 + 95.0 * np.exp(-t / 0.025)
    thump = np.sin(2.0 * math.pi * np.cumsum(thump_f) / SAMPLE_RATE) * np.exp(-t / 0.075) * 0.45

    notes = [(0.0, 523.25), (0.055, 783.99), (0.115, 1174.66)]
    chime = np.zeros(n, dtype=np.float64)
    for idx, (start_s, freq) in enumerate(notes):
        dt = np.maximum(0.0, t - start_s)
        mask = t >= start_s
        env = np.where(mask, (1.0 - np.exp(-dt / 0.004)) * np.exp(-dt / (0.10 + 0.03 * idx)), 0.0)
        tone = 0.72 * np.sin(2.0 * math.pi * freq * dt) + 0.20 * soft_triangle(2.0 * math.pi * freq * dt) + 0.08 * np.sin(6.0 * math.pi * freq * dt) * np.exp(-dt / 0.03)
        chime += tone * env * 0.48

    st = stereo_widen(thump + chime, delay_ms=2.3, amount=0.30)
    st = space_reverb(st, wet=0.38, decay=0.45, damping_hz=5000.0)
    return normalize_and_polish(st, peak_dbfs=-1.5, fade_in_ms=3.0, fade_out_ms=55.0)


def synth_player_spawn() -> np.ndarray:
    """Ethereal rising warp-in chord & airy deep-space sweep (520 ms)."""
    rng = np.random.default_rng(501)
    dur = 0.52
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    env = (1.0 - np.exp(-t / 0.065)) * np.exp(-np.maximum(0.0, t - 0.18) / 0.16)
    glide = 0.85 + 0.15 * (1.0 - np.exp(-t / 0.14))

    freqs = [261.63, 392.00, 587.33, 659.25]  # C4 - G4 - D5 - E5
    pad = np.zeros(n, dtype=np.float64)
    for idx, f in enumerate(freqs):
        ph = 2.0 * math.pi * np.cumsum(f * glide) / SAMPLE_RATE
        ph_det = 2.0 * math.pi * np.cumsum(f * 1.004 * glide) / SAMPLE_RATE
        pad += (0.55 * np.sin(ph) + 0.45 * soft_triangle(ph_det)) * (0.28 - 0.03 * idx)

    air = dynamic_bandpass_sweep(pink_noise(n, rng), 350.0 + 1800.0 * (t / dur), q=1.5)
    mono = (pad + air * 0.35) * env
    st = stereo_widen(mono, delay_ms=2.8, amount=0.35)
    st = space_reverb(st, wet=0.42, decay=0.48, damping_hz=4400.0)
    return normalize_and_polish(st, peak_dbfs=-1.6, fade_in_ms=8.0, fade_out_ms=80.0)


def synth_player_death() -> np.ndarray:
    """Deep atmospheric hull collapse + descending reactor power-down pad (900 ms)."""
    rng = np.random.default_rng(601)
    dur = 0.90
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Deep impact sub drop
    sub_f = 28.0 + 110.0 * np.exp(-t / 0.12)
    sub = np.sin(2.0 * math.pi * np.cumsum(sub_f) / SAMPLE_RATE) * np.exp(-t / 0.24) * 0.75

    # Descending ambient minor chord power-down
    decay_pitch = 1.0 - 0.42 * (1.0 - np.exp(-t / 0.38))
    chord = np.zeros(n, dtype=np.float64)
    for f in [220.0, 261.63, 329.63]:
        ph = 2.0 * math.pi * np.cumsum(f * decay_pitch) / SAMPLE_RATE
        chord += soft_triangle(ph) * 0.28
    chord *= (1.0 - np.exp(-t / 0.015)) * np.exp(-t / 0.34)

    # Warm sweeping low-pass explosion wash
    wash = dynamic_lowpass_sweep(pink_noise(n, rng), 120.0 + 2400.0 * np.exp(-t / 0.18), q=0.85)
    wash *= (1.0 - np.exp(-t / 0.008)) * np.exp(-t / 0.26) * 0.75

    st = stereo_widen(sub + chord + wash, delay_ms=3.2, amount=0.35)
    st = space_reverb(st, wet=0.45, decay=0.52, damping_hz=2500.0)
    st = np.tanh(st * 1.25)
    return normalize_and_polish(st, peak_dbfs=-1.1, fade_in_ms=4.0, fade_out_ms=110.0)


def synth_danger_zone() -> np.ndarray:
    """Soft cosmic sonar proximity ping (non-grating dual pulse)."""
    dur = 0.26
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    pulses = [(0.0, 622.25), (0.095, 493.88)]  # Eb5 -> B4 smooth sonar interval
    mono = np.zeros(n, dtype=np.float64)
    for start_s, freq in pulses:
        dt = np.maximum(0.0, t - start_s)
        mask = t >= start_s
        env = np.where(mask, (1.0 - np.exp(-dt / 0.008)) * np.exp(-dt / 0.055), 0.0)
        tone = 0.85 * np.sin(2.0 * math.pi * freq * dt) + 0.15 * np.sin(4.0 * math.pi * freq * dt) * np.exp(-dt / 0.025)
        mono += tone * env * 0.65

    st = stereo_widen(mono, delay_ms=2.0, amount=0.25)
    st = space_reverb(st, wet=0.36, decay=0.42, damping_hz=3200.0)
    return normalize_and_polish(st, peak_dbfs=-2.5, fade_in_ms=4.0, fade_out_ms=45.0)


def synth_ctf_event() -> np.ndarray:
    """Resonant atmospheric two-tone broadcast chime."""
    dur = 0.42
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    notes = [(0.0, 587.33, 0.14), (0.11, 880.00, 0.22)]  # D5 -> A5
    mono = np.zeros(n, dtype=np.float64)
    for start_s, freq, tau in notes:
        dt = np.maximum(0.0, t - start_s)
        mask = t >= start_s
        env = np.where(mask, (1.0 - np.exp(-dt / 0.006)) * np.exp(-dt / tau), 0.0)
        tone = (
            0.65 * np.sin(2.0 * math.pi * freq * dt)
            + 0.25 * warm_saw(2.0 * math.pi * freq * dt, max_harmonics=4)
            + 0.10 * np.sin(4.0 * math.pi * freq * dt)
        )
        mono += tone * env * 0.55

    st = butter_lowpass(stereo_widen(mono, delay_ms=2.4, amount=0.32), 4200.0, order=2)
    st = space_reverb(st, wet=0.40, decay=0.46, damping_hz=4000.0)
    return normalize_and_polish(st, peak_dbfs=-1.5, fade_in_ms=3.0, fade_out_ms=60.0)


def synth_ctf_victory() -> np.ndarray:
    """Luminous ambient 4-note ascending chord resolution with cosmic tail (950 ms)."""
    dur = 0.95
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    notes = [
        (0.00, 523.25, 0.42),   # C5
        (0.09, 659.25, 0.44),   # E5
        (0.18, 783.99, 0.46),   # G5
        (0.28, 1174.66, 0.50),  # D6 (add9 sparkle)
    ]
    mono = np.zeros(n, dtype=np.float64)
    for start_s, freq, tau in notes:
        dt = np.maximum(0.0, t - start_s)
        mask = t >= start_s
        env = np.where(mask, (1.0 - np.exp(-dt / 0.008)) * np.exp(-dt / tau), 0.0)
        tone = (
            0.68 * np.sin(2.0 * math.pi * freq * dt)
            + 0.22 * soft_triangle(2.0 * math.pi * freq * 1.003 * dt)
            + 0.10 * np.sin(4.0 * math.pi * freq * dt) * np.exp(-dt / 0.12)
        )
        mono += tone * env * 0.38

    st = stereo_widen(mono, delay_ms=3.0, amount=0.36)
    st = space_reverb(st, wet=0.45, decay=0.52, damping_hz=4800.0)
    return normalize_and_polish(st, peak_dbfs=-1.3, fade_in_ms=4.0, fade_out_ms=130.0)


def synth_ui_click() -> np.ndarray:
    """Subtle glassy micro-tick for UI controls."""
    dur = 0.048
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    freq = 1040.0 + 380.0 * (1.0 - np.exp(-t / 0.010))
    phase = 2.0 * math.pi * np.cumsum(freq) / SAMPLE_RATE
    env = (1.0 - np.exp(-t / 0.0018)) * np.exp(-t / 0.011)
    mono = np.sin(phase) * env
    st = stereo_widen(mono, delay_ms=0.8, amount=0.14)
    return normalize_and_polish(st, peak_dbfs=-2.8, fade_in_ms=1.0, fade_out_ms=10.0)


BUILDERS: Dict[str, Callable[[], np.ndarray]] = {
    "laser_fire_1.mp3": lambda: synth_laser_fire(1),
    "laser_fire_2.mp3": lambda: synth_laser_fire(2),
    "laser_fire_3.mp3": lambda: synth_laser_fire(3),
    "bullet_hit_1.mp3": lambda: synth_bullet_hit(1),
    "bullet_hit_2.mp3": lambda: synth_bullet_hit(2),
    "food_collect_1.mp3": lambda: synth_food_collect(1),
    "food_collect_2.mp3": lambda: synth_food_collect(2),
    "food_collect_3.mp3": lambda: synth_food_collect(3),
    "ship_explode_1.mp3": lambda: synth_ship_explode(1),
    "ship_explode_2.mp3": lambda: synth_ship_explode(2),
    "ship_explode_3.mp3": lambda: synth_ship_explode(3),
    "boost.mp3": synth_boost,
    "ship_gain.mp3": synth_ship_gain,
    "kill_confirm.mp3": synth_kill_confirm,
    "player_spawn.mp3": synth_player_spawn,
    "player_death.mp3": synth_player_death,
    "danger_zone.mp3": synth_danger_zone,
    "ctf_event.mp3": synth_ctf_event,
    "ctf_victory.mp3": synth_ctf_victory,
    "ui_click.mp3": synth_ui_click,
}


def write_wav_int16(path: Path, audio: np.ndarray) -> None:
    """Write float64 stereo audio [-1, 1] to a 16-bit PCM WAV file."""
    st = ensure_stereo(audio)
    pcm = np.int16(np.clip(st, -1.0, 1.0) * 32767.0)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def encode_mp3(ffmpeg_bin: str, wav_path: Path, mp3_path: Path) -> None:
    """Encode a WAV file to 160 kbps LAME MP3."""
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_bin,
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(wav_path),
        "-c:a",
        "libmp3lame",
        "-b:a",
        "160k",
        "-ar",
        str(SAMPLE_RATE),
        str(mp3_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {mp3_path.name}: {res.stderr}")


def decode_mp3_for_qc(ffmpeg_bin: str, mp3_path: Path) -> np.ndarray:
    """Decode an MP3 file back to float64 stereo PCM using ffmpeg for automated QC."""
    cmd = [
        ffmpeg_bin,
        "-v",
        "error",
        "-i",
        str(mp3_path),
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "2",
        "-ar",
        str(SAMPLE_RATE),
        "pipe:1",
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed for {mp3_path.name}: {res.stderr.decode('utf-8', 'ignore')}")
    samples = np.frombuffer(res.stdout, dtype=np.float32).astype(np.float64)
    return samples.reshape(-1, 2)


def run_qc(ffmpeg_bin: str, out_dir: Path) -> int:
    """Verify every expected MP3 file exists and passes DSP metrics."""
    failures: List[str] = []
    total_bytes = 0
    print(f"{'File':<22} {'Dur(ms)':>8} {'Peak(dBFS)':>11} {'RMS(dBFS)':>10} {'DC Off':>10} {'Size(KB)':>9}")
    print("-" * 76)

    for fname in EXPECTED_FILES:
        mp3_path = out_dir / fname
        if not mp3_path.exists():
            failures.append(f"Missing file: {mp3_path}")
            continue

        size_bytes = mp3_path.stat().st_size
        total_bytes += size_bytes
        pcm = decode_mp3_for_qc(ffmpeg_bin, mp3_path)
        if pcm.shape[0] == 0:
            failures.append(f"Empty decoded PCM: {fname}")
            continue

        dur_ms = (pcm.shape[0] / SAMPLE_RATE) * 1000.0
        peak = float(np.max(np.abs(pcm)))
        peak_db = 20.0 * math.log10(max(peak, 1e-9))
        rms = float(np.sqrt(np.mean(pcm ** 2)))
        rms_db = 20.0 * math.log10(max(rms, 1e-9))
        dc = float(np.max(np.abs(np.mean(pcm, axis=0))))

        print(f"{fname:<22} {dur_ms:8.1f} {peak_db:11.2f} {rms_db:10.2f} {dc:10.6f} {size_bytes / 1024.0:9.1f}")

        if peak >= 0.999:
            failures.append(f"Clipping detected in {fname}: peak={peak:.4f}")
        if not (-4.5 <= peak_db <= -0.2):
            failures.append(f"Peak out of range in {fname}: {peak_db:.2f} dBFS")
        if dc >= 1e-3:
            failures.append(f"Excess DC offset in {fname}: {dc:.6f}")

    print("-" * 76)
    print(f"Total files: {len(EXPECTED_FILES)} | Total footprint: {total_bytes / 1024.0:.1f} KB")

    if failures:
        print("\nQC FAILED:", file=sys.stderr)
        for err in failures:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("QC PASSED: All 20 MP3 files meet DSP and footprint invariants.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate ambient Spaceone.io SFX pack.")
    repo_root = Path(__file__).resolve().parent.parent.parent
    default_out = repo_root / "Game.Engine" / "wwwroot" / "audio"
    parser.add_argument("--out-dir", type=Path, default=default_out, help="Output directory for MP3 files")
    parser.add_argument("--wav-dir", type=Path, default=None, help="Optional directory to retain intermediate WAVs")
    parser.add_argument("--verify-only", action="store_true", help="Only verify existing MP3 files without regenerating")
    args = parser.parse_args()

    ffmpeg_bin = find_ffmpeg()

    if not args.verify_only:
        with tempfile.TemporaryDirectory() as tmp_dir:
            wav_root = args.wav_dir if args.wav_dir else Path(tmp_dir)
            wav_root.mkdir(parents=True, exist_ok=True)
            for fname, builder in BUILDERS.items():
                audio = builder()
                wav_path = wav_root / fname.replace(".mp3", ".wav")
                mp3_path = args.out_dir / fname
                write_wav_int16(wav_path, audio)
                encode_mp3(ffmpeg_bin, wav_path, mp3_path)

    return run_qc(ffmpeg_bin, args.out_dir)


if __name__ == "__main__":
    sys.exit(main())
