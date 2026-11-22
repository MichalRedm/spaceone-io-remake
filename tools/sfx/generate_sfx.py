#!/usr/bin/env python3
"""
Procedural Modern Ambient Sci-Fi SFX Generator & QC Verifier for Spaceone.io Remake (v2).

Synthesizes 20 deterministic, warm, bass-rich, convolution-reverberated sound effects
designed for modern abstract space combat without long-term ear fatigue.

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
from typing import Callable, Dict, List

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

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
    raise FileNotFoundError(
        "ffmpeg executable not found on PATH or at C:\\Tools\\ffmpeg.exe"
    )


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
    """Time-varying 2nd-order low-pass biquad filter with per-block coefficient updates."""
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
    signal_1d: np.ndarray, center_curve: np.ndarray, q: float = 1.8
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
    """Smooth band-softened triangle wave using fundamental + gentle odd harmonics."""
    return 0.88 * np.sin(phase) - 0.10 * np.sin(3.0 * phase) + 0.02 * np.sin(5.0 * phase)


def warm_saw(phase: np.ndarray, max_harmonics: int = 6) -> np.ndarray:
    """Warm band-limited additive sawtooth with gentle high-harmonic rolloff."""
    out = np.zeros_like(phase, dtype=np.float64)
    for k in range(1, max_harmonics + 1):
        weight = ((-1.0) ** (k + 1)) / (k ** 1.35)
        out += weight * np.sin(k * phase)
    return out * 0.65


def pink_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    """Generate smooth 1/f-weighted noise using a 3-pole Paul Kellet approximation."""
    white = rng.standard_normal(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1.0, -2.494956002, 2.017265875, -0.522189400]
    pink = lfilter(b, a, white)
    max_v = float(np.max(np.abs(pink)))
    return pink / max_v if max_v > 0 else pink


def smooth_drift(n: int, rng: np.random.Generator, rate_hz: float = 2.0) -> np.ndarray:
    """Smooth organic random drift curve in [-1, 1] for analog oscillator life."""
    raw = rng.standard_normal(n)
    sos = butter(2, max(0.2, rate_hz) / (0.5 * SAMPLE_RATE), btype="low", output="sos")
    drifted = sosfilt(sos, raw)
    m = float(np.max(np.abs(drifted)))
    return drifted / m if m > 1e-9 else drifted


def unison_pad(
    freq_curve: np.ndarray,
    rng: np.random.Generator,
    voices: int = 5,
    detune_cents: float = 10.0,
    drift_cents: float = 4.0,
    wave_fn: Callable[[np.ndarray], np.ndarray] = soft_triangle,
) -> np.ndarray:
    """
    Synthesize a lush multi-voice detuned stereo oscillator with independent analog pitch drift.
    Eliminates flat, static single-oscillator 80s synth character.
    """
    n = len(freq_curve)
    out = np.zeros((n, 2), dtype=np.float64)
    offsets = np.linspace(-detune_cents, detune_cents, voices) if voices > 1 else np.array([0.0])

    for idx, cents in enumerate(offsets):
        drift = smooth_drift(n, rng, rate_hz=1.4 + 0.3 * idx) * drift_cents
        ratio = 2.0 ** ((cents + drift) / 1200.0)
        phase_0 = float(rng.uniform(0.0, 2.0 * math.pi))
        phase = phase_0 + 2.0 * math.pi * np.cumsum(freq_curve * ratio) / SAMPLE_RATE
        voice = wave_fn(phase)
        pan = -0.7 + 1.4 * (idx / max(1, voices - 1)) if voices > 1 else 0.0
        gain_l = math.cos((pan + 1.0) * math.pi * 0.25)
        gain_r = math.sin((pan + 1.0) * math.pi * 0.25)
        out[:, 0] += voice * gain_l
        out[:, 1] += voice * gain_r

    return out / max(1.0, math.sqrt(voices))


def tape_saturate(audio: np.ndarray, drive: float = 1.35, warm_lp_hz: float = 3200.0) -> np.ndarray:
    """Warm analog tape-style soft saturation with subtle harmonic smoothing."""
    st = ensure_stereo(audio)
    # Tiny asymmetric bias adds subtle even harmonics (analog tube/tape warmth)
    shaped = np.tanh(st * drive + 0.04 * (st ** 2)) - 0.04 * np.tanh(0.0)
    return butter_lowpass(shaped, warm_lp_hz, order=2)


def convolution_space_reverb(
    audio: np.ndarray,
    seed: int,
    rt60_s: float = 0.55,
    wet: float = 0.38,
    pre_delay_ms: float = 8.0,
    damping_hz: float = 1900.0,
    tail_pad_s: float = 0.25,
) -> np.ndarray:
    """
    True stereo convolution space reverb using a dual-band damped decorrelated impulse response.
    Creates a lush, dark, modern cosmic atmosphere without metallic ringing or dry abrupt cutoffs.
    """
    st = ensure_stereo(audio)
    pad_samples = int(tail_pad_s * SAMPLE_RATE)
    if pad_samples > 0:
        st = np.vstack([st, np.zeros((pad_samples, 2), dtype=np.float64)])

    n_sig = st.shape[0]
    ir_len = min(int(rt60_s * 1.45 * SAMPLE_RATE), SAMPLE_RATE * 2)
    ir_len = max(ir_len, int(0.12 * SAMPLE_RATE))

    rng = np.random.default_rng(seed)
    t_ir = np.arange(ir_len, dtype=np.float64) / SAMPLE_RATE

    # Two-band decay: lows/mids linger warmly while highs fade faster (natural air absorption)
    tau_low = max(0.04, rt60_s / 6.91)
    tau_high = max(0.025, tau_low * 0.52)

    pre_n = int(pre_delay_ms * SAMPLE_RATE / 1000.0)
    ir = np.zeros((ir_len, 2), dtype=np.float64)

    for ch in range(2):
        # Smooth velvet-like dense diffusion noise
        raw = rng.standard_normal(ir_len)
        low_band = butter_lowpass(raw, damping_hz, order=2)[:, 0] * np.exp(-t_ir / tau_low)
        high_band = butter_bandpass(raw, damping_hz * 0.7, min(5500.0, damping_hz * 2.2), order=2)[:, 0] * np.exp(-t_ir / tau_high)
        ch_ir = low_band * 0.82 + high_band * 0.28

        # Soft fade-in on IR prevents slap-back harshness
        fi = min(ir_len // 4, max(1, int(0.010 * SAMPLE_RATE)))
        ch_ir[:fi] *= 0.5 * (1.0 - np.cos(math.pi * np.linspace(0.0, 1.0, fi)))

        # Apply pre-delay
        if 0 < pre_n < ir_len:
            shifted = np.zeros(ir_len, dtype=np.float64)
            shifted[pre_n:] = ch_ir[: ir_len - pre_n]
            ch_ir = shifted

        energy = float(np.sqrt(np.sum(ch_ir ** 2)))
        if energy > 1e-9:
            ch_ir /= energy
        ir[:, ch] = ch_ir

    wet_l = fftconvolve(st[:, 0], ir[:, 0], mode="full")[:n_sig]
    wet_r = fftconvolve(st[:, 1], ir[:, 1], mode="full")[:n_sig]
    # Add gentle cross-feed for natural stereo space cohesion
    wet_st = np.column_stack([0.85 * wet_l + 0.15 * wet_r, 0.85 * wet_r + 0.15 * wet_l])
    wet_st = butter_highpass(wet_st, 35.0, order=2)

    return (1.0 - wet * 0.28) * st + wet * wet_st


def raised_cosine_fades(
    audio: np.ndarray, fade_in_ms: float = 4.0, fade_out_ms: float = 35.0
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


def stereo_widen(
    mono_or_stereo: np.ndarray, delay_ms: float = 2.0, amount: float = 0.25
) -> np.ndarray:
    """Create gentle stereo ambience by cross-blending a micro-delayed side component."""
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
    fade_in_ms: float = 4.0,
    fade_out_ms: float = 35.0,
) -> np.ndarray:
    """Remove DC offset, apply smooth boundary fades, and normalize peak amplitude."""
    st = ensure_stereo(audio)
    st = st - np.mean(st, axis=0, keepdims=True)
    st = raised_cosine_fades(st, fade_in_ms=fade_in_ms, fade_out_ms=fade_out_ms)
    st = st - np.mean(st, axis=0, keepdims=True)
    st = raised_cosine_fades(
        st, fade_in_ms=min(2.0, fade_in_ms), fade_out_ms=min(12.0, fade_out_ms)
    )
    peak = float(np.max(np.abs(st)))
    if peak > 1e-9:
        target_lin = 10.0 ** (peak_dbfs / 20.0)
        st = st * (target_lin / peak)
    return np.clip(st, -0.99, 0.99)


# -----------------------------------------------------------------------------
# v2 Modern Ambient Abstract Space Shooter Sound Recipes
# -----------------------------------------------------------------------------


def synth_laser_fire(variant: int) -> np.ndarray:
    """
    Deep, tactile modern plasma pulse: sub-bass punch + detuned low-mid unison sweep
    + velvety air breath + dark cosmic convolution tail. Zero harsh 80s pew.
    """
    rng = np.random.default_rng(1100 + variant)
    dur = [0.22, 0.23, 0.21][variant - 1]
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # 1) Warm sub-bass body thump (145 -> 52 Hz)
    sub_f0 = [148.0, 140.0, 155.0][variant - 1]
    sub_freq = 50.0 + (sub_f0 - 50.0) * np.exp(-t / 0.032)
    sub_phase = 2.0 * math.pi * np.cumsum(sub_freq) / SAMPLE_RATE
    sub = np.sin(sub_phase) * (1.0 - np.exp(-t / 0.004)) * np.exp(-t / 0.068) * 0.72

    # 2) Detuned warm low-mid plasma body (340 -> 115 Hz) with sweeping low-pass filter
    mid_f0 = [345.0, 325.0, 365.0][variant - 1]
    mid_freq = 112.0 + (mid_f0 - 112.0) * np.exp(-t / 0.036)
    mid_pad = unison_pad(
        mid_freq,
        rng,
        voices=4,
        detune_cents=12.0,
        drift_cents=5.0,
        wave_fn=lambda ph: warm_saw(ph, max_harmonics=5),
    )
    mid_env = (1.0 - np.exp(-t / 0.0045)) * np.exp(-t / 0.055)
    mid_pad *= mid_env[:, None] * 0.65
    cutoff = 240.0 + 1150.0 * np.exp(-t / 0.042)
    mid_pad[:, 0] = dynamic_lowpass_sweep(mid_pad[:, 0], cutoff, q=0.95)
    mid_pad[:, 1] = dynamic_lowpass_sweep(mid_pad[:, 1], cutoff * 1.03, q=0.95)

    # 3) Soft airy plasma exhale (band-limited 450-1650 Hz, zero sibilant fizz)
    air = butter_bandpass(pink_noise(n, rng), 450.0, 1650.0, order=2)
    air *= ((1.0 - np.exp(-t / 0.004)) * np.exp(-t / 0.025) * 0.28)[:, None]

    dry = ensure_stereo(sub) + mid_pad + air
    dry = tape_saturate(dry, drive=1.25, warm_lp_hz=2200.0)
    wet = convolution_space_reverb(
        dry,
        seed=2100 + variant,
        rt60_s=0.34,
        wet=0.34,
        pre_delay_ms=4.0,
        damping_hz=1500.0,
        tail_pad_s=0.14,
    )
    return normalize_and_polish(wet, peak_dbfs=-2.0, fade_in_ms=3.0, fade_out_ms=45.0)


def synth_bullet_hit(variant: int) -> np.ndarray:
    """Muted low-mid energy thud + soft filtered plasma spark + dark room tail."""
    rng = np.random.default_rng(1200 + variant)
    dur = [0.15, 0.16][variant - 1]
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    f0 = [185.0, 205.0][variant - 1]
    freq = 64.0 + (f0 - 64.0) * np.exp(-t / 0.024)
    phase = 2.0 * math.pi * np.cumsum(freq) / SAMPLE_RATE
    thud = soft_triangle(phase) * (1.0 - np.exp(-t / 0.003)) * np.exp(-t / 0.042) * 0.8

    puff = butter_bandpass(pink_noise(n, rng), 420.0, 1750.0, order=2)
    puff *= ((1.0 - np.exp(-t / 0.003)) * np.exp(-t / 0.022) * 0.35)[:, None]

    dry = tape_saturate(ensure_stereo(thud) + puff, drive=1.2, warm_lp_hz=2100.0)
    wet = convolution_space_reverb(
        dry,
        seed=2200 + variant,
        rt60_s=0.28,
        wet=0.34,
        pre_delay_ms=3.0,
        damping_hz=1500.0,
        tail_pad_s=0.12,
    )
    return normalize_and_polish(wet, peak_dbfs=-2.4, fade_in_ms=2.5, fade_out_ms=38.0)


def synth_food_collect(variant: int) -> np.ndarray:
    """
    Warm marimba/Rhodes-style ambient orb pickup (C4, E4, G4 — an octave lower than v1)
    with felt soft attack, warm sub-body, and dreamy stereo reverb tail.
    """
    rng = np.random.default_rng(1300 + variant)
    dur = 0.24
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Warm lower octave pentatonic: C4, E4, G4 (261.63, 329.63, 392.00 Hz)
    base_hz = [261.63, 329.63, 392.00][variant - 1]
    freq_curve = base_hz * (0.97 + 0.03 * (1.0 - np.exp(-t / 0.025)))

    body = unison_pad(
        freq_curve,
        rng,
        voices=3,
        detune_cents=7.0,
        drift_cents=3.0,
        wave_fn=np.sin,
    )
    # Soft 2nd-harmonic Rhodes warmth decaying early
    overtone = np.sin(2.0 * math.pi * np.cumsum(freq_curve * 2.0) / SAMPLE_RATE)
    overtone *= (np.exp(-t / 0.045) * 0.22)

    # Tactile sub-warmth an octave down
    sub = np.sin(2.0 * math.pi * np.cumsum(freq_curve * 0.5) / SAMPLE_RATE) * np.exp(-t / 0.075) * 0.35

    env = (1.0 - np.exp(-t / 0.007)) * np.exp(-t / 0.072)
    dry = (body + ensure_stereo(overtone + sub)) * env[:, None]
    dry = tape_saturate(dry, drive=1.15, warm_lp_hz=1900.0)
    wet = convolution_space_reverb(
        dry,
        seed=2300 + variant,
        rt60_s=0.44,
        wet=0.45,
        pre_delay_ms=6.0,
        damping_hz=1600.0,
        tail_pad_s=0.20,
    )
    return normalize_and_polish(wet, peak_dbfs=-2.3, fade_in_ms=4.0, fade_out_ms=65.0)


def synth_ship_explode(variant: int) -> np.ndarray:
    """
    Cinematic deep-space hull detonation: visceral sub-bass drop + warm low-passed
    rumble + distant muffled crackle + wide dark cosmic hall reverb.
    """
    rng = np.random.default_rng(1400 + variant)
    dur = [0.62, 0.66, 0.58][variant - 1]
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Deep physical sub drop (84 -> 26 Hz)
    sub_f0 = [84.0, 78.0, 90.0][variant - 1]
    sub_freq = 26.0 + (sub_f0 - 26.0) * np.exp(-t / 0.11)
    sub_phase = 2.0 * math.pi * np.cumsum(sub_freq) / SAMPLE_RATE
    sub = np.sin(sub_phase) * (1.0 - np.exp(-t / 0.005)) * np.exp(-t / 0.19) * 0.95

    # Warm sweeping low-mid plasma roar (1400 -> 95 Hz)
    n1 = pink_noise(n, rng)
    n2 = pink_noise(n, rng)
    cutoff = 95.0 + 1350.0 * np.exp(-t / 0.11)
    bloom_l = dynamic_lowpass_sweep(n1, cutoff, q=0.85)
    bloom_r = dynamic_lowpass_sweep(n2, cutoff * 1.05, q=0.85)
    bloom = np.column_stack([bloom_l, bloom_r])
    bloom *= ((1.0 - np.exp(-t / 0.008)) * np.exp(-t / 0.18) * 0.95)[:, None]

    # Distant muted structural debris (bandpass 450-1500 Hz, gentle)
    debris = butter_bandpass(
        np.column_stack([rng.standard_normal(n), rng.standard_normal(n)]),
        450.0,
        1500.0,
        order=2,
    )
    debris *= (np.exp(-t / 0.085) * 0.22)[:, None]

    dry = tape_saturate(ensure_stereo(sub) + bloom + debris, drive=1.4, warm_lp_hz=2000.0)
    wet = convolution_space_reverb(
        dry,
        seed=2400 + variant,
        rt60_s=0.68,
        wet=0.45,
        pre_delay_ms=8.0,
        damping_hz=1400.0,
        tail_pad_s=0.32,
    )
    return normalize_and_polish(wet, peak_dbfs=-1.1, fade_in_ms=4.0, fade_out_ms=95.0)


def synth_boost() -> np.ndarray:
    """
    Deep modern warp-drive surge (1.1s): sub-bass turbine rumble + lush fifth-interval
    ambient pad + velvety low-mid wind sweep + wide cosmic hall reverb.
    """
    rng = np.random.default_rng(1501)
    dur = 0.85
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    surge_env = (1.0 - np.exp(-t / 0.055)) * np.exp(-np.maximum(0.0, t - 0.16) / 0.28)

    # Velvety low-mid wind sweep (180 -> 660 -> 160 Hz)
    center = 160.0 + 500.0 * np.sin(math.pi * np.clip(t / 0.50, 0.0, 1.0)) ** 1.25
    whoosh_l = dynamic_bandpass_sweep(pink_noise(n, rng), center, q=1.5)
    whoosh_r = dynamic_bandpass_sweep(pink_noise(n, rng), center * 1.04, q=1.5)
    whoosh = np.column_stack([whoosh_l, whoosh_r]) * surge_env[:, None] * 0.85

    # Sub-bass turbine + lush detuned fifth pad
    f_root = 58.0 + 36.0 * np.sin(math.pi * np.clip(t / 0.55, 0.0, 1.0))
    sub = np.sin(2.0 * math.pi * np.cumsum(f_root) / SAMPLE_RATE) * surge_env * 0.65
    pad_root = unison_pad(f_root * 2.0, rng, voices=4, detune_cents=10.0, drift_cents=4.0, wave_fn=soft_triangle)
    pad_fifth = unison_pad(f_root * 3.0, rng, voices=3, detune_cents=12.0, drift_cents=4.0, wave_fn=np.sin)
    pad = (pad_root * 0.45 + pad_fifth * 0.30) * surge_env[:, None]

    dry = tape_saturate(whoosh + ensure_stereo(sub) + pad, drive=1.22, warm_lp_hz=1850.0)
    wet = convolution_space_reverb(
        dry,
        seed=2501,
        rt60_s=0.60,
        wet=0.45,
        pre_delay_ms=10.0,
        damping_hz=1600.0,
        tail_pad_s=0.28,
    )
    return normalize_and_polish(wet, peak_dbfs=-1.5, fade_in_ms=12.0, fade_out_ms=120.0)


def synth_ship_gain() -> np.ndarray:
    """Warm Rhodes/ambient-pad fifth interval (D4 -> A4) with soft sub-body & lush halo."""
    rng = np.random.default_rng(1601)
    dur = 0.30
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    notes = [(0.0, 293.66, 0.13), (0.075, 440.00, 0.18)]  # D4 -> A4
    dry = np.zeros((n, 2), dtype=np.float64)
    for start_s, freq, tau in notes:
        dt = np.maximum(0.0, t - start_s)
        mask = (t >= start_s)[:, None]
        env = np.where(mask, ((1.0 - np.exp(-dt / 0.008)) * np.exp(-dt / tau))[:, None], 0.0)
        pad = unison_pad(np.full(n, freq), rng, voices=3, detune_cents=7.0, drift_cents=3.0, wave_fn=np.sin)
        sub = np.sin(2.0 * math.pi * (freq * 0.5) * dt) * 0.32
        dry += (pad + ensure_stereo(sub)) * env * 0.55

    dry = tape_saturate(dry, drive=1.15, warm_lp_hz=2000.0)
    wet = convolution_space_reverb(
        dry,
        seed=2601,
        rt60_s=0.52,
        wet=0.46,
        pre_delay_ms=8.0,
        damping_hz=1750.0,
        tail_pad_s=0.22,
    )
    return normalize_and_polish(wet, peak_dbfs=-2.0, fade_in_ms=5.0, fade_out_ms=70.0)


def synth_kill_confirm() -> np.ndarray:
    """
    Deep satisfying sub-impact (95 -> 40 Hz) + warm lush major-9th ambient chord
    swell (C4 - G4 - D5) bathed in cosmic reverb.
    """
    rng = np.random.default_rng(1701)
    dur = 0.44
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Tactile deep confirmation thump
    thump_f = 40.0 + 62.0 * np.exp(-t / 0.038)
    thump = np.sin(2.0 * math.pi * np.cumsum(thump_f) / SAMPLE_RATE) * (1.0 - np.exp(-t / 0.004)) * np.exp(-t / 0.11) * 0.65

    # Warm lower-register chord arpeggio (C4 -> G4 -> D5)
    notes = [(0.0, 261.63), (0.06, 392.00), (0.125, 587.33)]
    chord = np.zeros((n, 2), dtype=np.float64)
    for idx, (start_s, freq) in enumerate(notes):
        dt = np.maximum(0.0, t - start_s)
        mask = (t >= start_s)[:, None]
        env = np.where(mask, ((1.0 - np.exp(-dt / 0.010)) * np.exp(-dt / (0.15 + 0.04 * idx)))[:, None], 0.0)
        pad = unison_pad(np.full(n, freq), rng, voices=4, detune_cents=8.0, drift_cents=3.5, wave_fn=soft_triangle)
        chord += pad * env * 0.42

    dry = tape_saturate(ensure_stereo(thump) + chord, drive=1.18, warm_lp_hz=2300.0)
    wet = convolution_space_reverb(
        dry,
        seed=2701,
        rt60_s=0.62,
        wet=0.48,
        pre_delay_ms=10.0,
        damping_hz=1900.0,
        tail_pad_s=0.26,
    )
    return normalize_and_polish(wet, peak_dbfs=-1.4, fade_in_ms=4.0, fade_out_ms=85.0)


def synth_player_spawn() -> np.ndarray:
    """Deep cinematic warp-in: rising sub-bass + lush 5-voice ambient chord + hall reverb."""
    rng = np.random.default_rng(1801)
    dur = 0.62
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    env = (1.0 - np.exp(-t / 0.09)) * np.exp(-np.maximum(0.0, t - 0.20) / 0.22)
    glide = 0.88 + 0.12 * (1.0 - np.exp(-t / 0.18))

    # Deep sub swell (65 Hz)
    sub = np.sin(2.0 * math.pi * np.cumsum(65.41 * glide) / SAMPLE_RATE) * 0.55

    # Warm ambient pad chord: C3, G3, D4, E4
    chord = np.zeros((n, 2), dtype=np.float64)
    for idx, f in enumerate([130.81, 196.00, 293.66, 329.63]):
        pad = unison_pad(f * glide, rng, voices=4, detune_cents=11.0, drift_cents=4.5, wave_fn=soft_triangle)
        chord += pad * (0.30 - 0.03 * idx)

    air = dynamic_bandpass_sweep(pink_noise(n, rng), 240.0 + 1100.0 * (t / dur), q=1.4)
    dry = (ensure_stereo(sub + air * 0.28) + chord) * env[:, None]
    dry = tape_saturate(dry, drive=1.18, warm_lp_hz=2200.0)

    wet = convolution_space_reverb(
        dry,
        seed=2801,
        rt60_s=0.75,
        wet=0.50,
        pre_delay_ms=12.0,
        damping_hz=1850.0,
        tail_pad_s=0.34,
    )
    return normalize_and_polish(wet, peak_dbfs=-1.5, fade_in_ms=10.0, fade_out_ms=120.0)


def synth_player_death() -> np.ndarray:
    """Deep cinematic hull implosion + slow descending sub-bass & dark minor pad into the void."""
    rng = np.random.default_rng(1901)
    dur = 1.05
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    # Heavy sub impact drop (115 -> 26 Hz)
    sub_f = 26.0 + 90.0 * np.exp(-t / 0.15)
    sub = np.sin(2.0 * math.pi * np.cumsum(sub_f) / SAMPLE_RATE) * (1.0 - np.exp(-t / 0.006)) * np.exp(-t / 0.30) * 0.85

    # Slow descending dark ambient minor pad: A2, C3, E3
    decay_pitch = 1.0 - 0.38 * (1.0 - np.exp(-t / 0.45))
    pad_env = (1.0 - np.exp(-t / 0.025)) * np.exp(-t / 0.42)
    chord = np.zeros((n, 2), dtype=np.float64)
    for f in [110.00, 130.81, 164.81]:
        chord += unison_pad(f * decay_pitch, rng, voices=4, detune_cents=12.0, drift_cents=5.0, wave_fn=soft_triangle) * 0.32
    chord *= pad_env[:, None]

    wash = dynamic_lowpass_sweep(pink_noise(n, rng), 90.0 + 1600.0 * np.exp(-t / 0.22), q=0.8)
    wash *= (1.0 - np.exp(-t / 0.01)) * np.exp(-t / 0.32) * 0.72

    dry = tape_saturate(ensure_stereo(sub + wash) + chord, drive=1.32, warm_lp_hz=1750.0)
    wet = convolution_space_reverb(
        dry,
        seed=2901,
        rt60_s=0.95,
        wet=0.52,
        pre_delay_ms=14.0,
        damping_hz=1450.0,
        tail_pad_s=0.45,
    )
    return normalize_and_polish(wet, peak_dbfs=-1.1, fade_in_ms=5.0, fade_out_ms=160.0)


def synth_danger_zone() -> np.ndarray:
    """Calm, deep spaceship-hull sonar pulse (220 -> 175 Hz) with warm cosmic echo."""
    rng = np.random.default_rng(2001)
    dur = 0.32
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    pulses = [(0.0, 246.94), (0.115, 196.00)]  # B3 -> G3 deep warm sonar
    dry = np.zeros((n, 2), dtype=np.float64)
    for start_s, freq in pulses:
        dt = np.maximum(0.0, t - start_s)
        mask = (t >= start_s)[:, None]
        env = np.where(mask, ((1.0 - np.exp(-dt / 0.012)) * np.exp(-dt / 0.075))[:, None], 0.0)
        pad = unison_pad(np.full(n, freq), rng, voices=3, detune_cents=6.0, drift_cents=2.5, wave_fn=np.sin)
        dry += pad * env * 0.65

    dry = tape_saturate(dry, drive=1.12, warm_lp_hz=1400.0)
    wet = convolution_space_reverb(
        dry,
        seed=3001,
        rt60_s=0.55,
        wet=0.45,
        pre_delay_ms=8.0,
        damping_hz=1350.0,
        tail_pad_s=0.20,
    )
    return normalize_and_polish(wet, peak_dbfs=-2.4, fade_in_ms=5.0, fade_out_ms=65.0)


def synth_ctf_event() -> np.ndarray:
    """Deep resonant cinematic sci-fi horn/pad broadcast chime (D3 + A3 + D4)."""
    rng = np.random.default_rng(2101)
    dur = 0.50
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    notes = [(0.0, 293.66, 0.16), (0.13, 440.00, 0.24)]  # D4 -> A4 with octave-down sub
    dry = np.zeros((n, 2), dtype=np.float64)
    for start_s, freq, tau in notes:
        dt = np.maximum(0.0, t - start_s)
        mask = (t >= start_s)[:, None]
        env = np.where(mask, ((1.0 - np.exp(-dt / 0.010)) * np.exp(-dt / tau))[:, None], 0.0)
        pad = unison_pad(np.full(n, freq), rng, voices=4, detune_cents=9.0, drift_cents=3.5, wave_fn=lambda ph: warm_saw(ph, 4))
        sub = np.sin(2.0 * math.pi * (freq * 0.5) * dt) * 0.45
        dry += (pad + ensure_stereo(sub)) * env * 0.52

    dry = tape_saturate(dry, drive=1.2, warm_lp_hz=2100.0)
    wet = convolution_space_reverb(
        dry,
        seed=3101,
        rt60_s=0.68,
        wet=0.48,
        pre_delay_ms=10.0,
        damping_hz=1750.0,
        tail_pad_s=0.28,
    )
    return normalize_and_polish(wet, peak_dbfs=-1.4, fade_in_ms=5.0, fade_out_ms=85.0)


def synth_ctf_victory() -> np.ndarray:
    """Luminous modern ambient cinematic chord resolution (C3-G3-C4-D4-E4) with lush hall tail."""
    rng = np.random.default_rng(2201)
    dur = 1.15
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    notes = [
        (0.00, 130.81, 0.60),  # C3 sub foundation
        (0.02, 196.00, 0.58),  # G3
        (0.11, 261.63, 0.56),  # C4
        (0.20, 293.66, 0.54),  # D4
        (0.29, 329.63, 0.62),  # E4
    ]
    dry = np.zeros((n, 2), dtype=np.float64)
    for idx, (start_s, freq, tau) in enumerate(notes):
        dt = np.maximum(0.0, t - start_s)
        mask = (t >= start_s)[:, None]
        env = np.where(mask, ((1.0 - np.exp(-dt / 0.018)) * np.exp(-dt / tau))[:, None], 0.0)
        pad = unison_pad(np.full(n, freq), rng, voices=4, detune_cents=10.0, drift_cents=4.0, wave_fn=soft_triangle)
        dry += pad * env * (0.42 if idx < 2 else 0.34)

    dry = tape_saturate(dry, drive=1.18, warm_lp_hz=2300.0)
    wet = convolution_space_reverb(
        dry,
        seed=3201,
        rt60_s=0.95,
        wet=0.52,
        pre_delay_ms=12.0,
        damping_hz=1850.0,
        tail_pad_s=0.45,
    )
    return normalize_and_polish(wet, peak_dbfs=-1.2, fade_in_ms=6.0, fade_out_ms=160.0)


def synth_ui_click() -> np.ndarray:
    """Tactile, muted modern UI 'thock/bubble' (300 -> 440 Hz) with subtle room space."""
    dur = 0.065
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    freq = 290.0 + 145.0 * (1.0 - np.exp(-t / 0.010))
    phase = 2.0 * math.pi * np.cumsum(freq) / SAMPLE_RATE
    env = (1.0 - np.exp(-t / 0.0025)) * np.exp(-t / 0.014)
    mono = np.sin(phase) * env
    dry = tape_saturate(stereo_widen(mono, delay_ms=1.1, amount=0.14), drive=1.15, warm_lp_hz=1600.0)
    wet = convolution_space_reverb(
        dry,
        seed=3301,
        rt60_s=0.14,
        wet=0.24,
        pre_delay_ms=2.0,
        damping_hz=1400.0,
        tail_pad_s=0.04,
    )
    return normalize_and_polish(wet, peak_dbfs=-2.8, fade_in_ms=2.0, fade_out_ms=16.0)


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
        raise RuntimeError(
            f"ffmpeg decode failed for {mp3_path.name}: {res.stderr.decode('utf-8', 'ignore')}"
        )
    samples = np.frombuffer(res.stdout, dtype=np.float32).astype(np.float64)
    return samples.reshape(-1, 2)


def run_qc(ffmpeg_bin: str, out_dir: Path) -> int:
    """Verify every expected MP3 file exists and passes DSP metrics."""
    failures: List[str] = []
    total_bytes = 0
    print(
        f"{'File':<22} {'Dur(ms)':>8} {'Peak(dBFS)':>11} {'RMS(dBFS)':>10} {'DC Off':>10} {'Size(KB)':>9}"
    )
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

        print(
            f"{fname:<22} {dur_ms:8.1f} {peak_db:11.2f} {rms_db:10.2f} {dc:10.6f} {size_bytes / 1024.0:9.1f}"
        )

        if peak >= 0.999:
            failures.append(f"Clipping detected in {fname}: peak={peak:.4f}")
        if not (-4.5 <= peak_db <= -0.2):
            failures.append(f"Peak out of range in {fname}: {peak_db:.2f} dBFS")
        if dc >= 1e-3:
            failures.append(f"Excess DC offset in {fname}: {dc:.6f}")

    print("-" * 76)
    print(
        f"Total files: {len(EXPECTED_FILES)} | Total footprint: {total_bytes / 1024.0:.1f} KB"
    )

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
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=default_out,
        help="Output directory for MP3 files",
    )
    parser.add_argument(
        "--wav-dir",
        type=Path,
        default=None,
        help="Optional directory to retain intermediate WAVs",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify existing MP3 files without regenerating",
    )
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
