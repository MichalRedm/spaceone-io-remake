#!/usr/bin/env python3
"""
Procedural Hi-Fi Ambient Sci-Fi SFX Generator & QC Verifier for Spaceone.io Remake (v4).

Synthesizes 20 deterministic, studio-clean, ambient cosmic sound effects using:
  1) Pure algorithmic 8-channel Orthogonal Hadamard FDN hall reverb (zero noise-grain veil)
  2) Un-truncated full timelines (dry transients + >1.2x RT60 natural decay tails)
  3) Musical open-fifth / major-9th harmony paired with 36-52 ms anticipation inhales on heavy impacts
  4) Zero-phase FFT mastering EQ (-3.5 dB @ 310 Hz de-mud, +3.0 dB >8.5 kHz air)
  5) Transparent 5 ms lookahead peak limiter + LAME V0 (~245 kbps) encoding

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
from typing import Callable, Dict, List, Sequence, Tuple

import numpy as np
from scipy.linalg import hadamard
from scipy.ndimage import maximum_filter1d
from scipy.signal import butter, lfilter, sosfilt

SAMPLE_RATE = 44100
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
    """Promote mono (N,) audio to stereo (N, 2) or validate (N, 2) float64."""
    arr = np.asarray(audio, dtype=np.float64)
    if arr.ndim == 1:
        return np.column_stack([arr, arr])
    if arr.ndim == 2 and arr.shape[1] == 2:
        return arr
    raise ValueError(f"Expected 1D mono or (N, 2) stereo array, got shape {arr.shape}")


def butter_filter(
    audio: np.ndarray, btype: str, cutoff: float | Sequence[float], order: int = 2
) -> np.ndarray:
    """Apply a Butterworth filter safely clamped below Nyquist per stereo channel."""
    nyq = 0.5 * SAMPLE_RATE
    if isinstance(cutoff, (list, tuple)):
        wn = [
            max(18.0, min(float(cutoff[0]), nyq * 0.90)) / nyq,
            max(40.0, min(float(cutoff[1]), nyq * 0.95)) / nyq,
        ]
    else:
        wn = max(18.0, min(float(cutoff), nyq * 0.92)) / nyq
    sos = butter(order, wn, btype=btype, output="sos")
    st = ensure_stereo(audio)
    return np.column_stack([sosfilt(sos, st[:, 0]), sosfilt(sos, st[:, 1])])


def pan_mono(signal: np.ndarray, pan: float) -> np.ndarray:
    """Constant-power stereo panning across [-1, 1]."""
    p = max(-1.0, min(1.0, pan))
    return np.column_stack(
        [
            signal * math.cos((p + 1.0) * math.pi * 0.25),
            signal * math.sin((p + 1.0) * math.pi * 0.25),
        ]
    )


def allpass_diffuse(
    signal_1d: np.ndarray, delays: Sequence[int], g: float = 0.62
) -> np.ndarray:
    """4-stage prime-delay Schroeder allpass diffuser with flat magnitude response."""
    x = signal_1d
    for d in delays:
        b = np.zeros(d + 1, dtype=np.float64)
        a = np.zeros(d + 1, dtype=np.float64)
        b[0] = g
        b[d] = 1.0
        a[0] = 1.0
        a[d] = g
        x = lfilter(b, a, x)
    return x


def studio_fdn_reverb(
    audio: np.ndarray,
    rt60_s: float = 1.40,
    wet: float = 0.70,
    pre_delay_ms: float = 22.0,
    hp_hz: float = 260.0,
    hf_damp_hz: float = 10500.0,
) -> Tuple[np.ndarray, float]:
    """
    Unity-calibrated 8-channel Orthogonal Hadamard FDN Hall Reverb (zero noise grain).
    Expects `audio` to span the full natural tail duration so decay never truncates.
    """
    st = ensure_stereo(audio)
    n_sig = st.shape[0]

    send = butter_filter(st, "high", hp_hz, order=2)
    pre_n = int(pre_delay_ms * SAMPLE_RATE / 1000.0)
    if 0 < pre_n < n_sig:
        delayed = np.zeros_like(send)
        delayed[pre_n:] = send[: n_sig - pre_n]
        send = delayed

    diff_l = allpass_diffuse(send[:, 0], (142, 107, 379, 277), g=0.62)
    diff_r = allpass_diffuse(send[:, 1], (157, 113, 401, 293), g=0.62)

    block = 1024
    delays = np.array([1487, 1723, 1997, 2269, 2557, 2851, 3169, 3491], dtype=np.int64)
    h8 = hadamard(8) / math.sqrt(8.0)

    g_fb = 10.0 ** (-3.0 * delays / (SAMPLE_RATE * max(0.15, rt60_s)))
    alpha_lp = math.exp(-2.0 * math.pi * hf_damp_hz / SAMPLE_RATE)

    buf_len = int(delays.max()) + block + 64
    delay_buf = np.zeros((buf_len, 8), dtype=np.float64)
    lp_state = np.zeros(8, dtype=np.float64)
    write_ptr = int(delays.max())

    in_ch = np.zeros((n_sig, 8), dtype=np.float64)
    w_l = np.array([0.45, 0.35, 0.40, 0.28, 0.36, 0.30, 0.42, 0.28])
    w_r = np.array([0.28, 0.42, 0.30, 0.36, 0.28, 0.40, 0.35, 0.45])
    in_ch[:, :] = diff_l[:, None] * w_l[None, :] + diff_r[:, None] * w_r[None, :]

    wet_out = np.zeros((n_sig, 2), dtype=np.float64)
    out_l_mask = np.array([1.0, -0.75, 0.85, -0.65, 0.80, -0.82, 0.70, -0.72]) * 0.82
    out_r_mask = np.array([0.72, 1.0, -0.65, 0.85, -0.82, 0.80, -0.75, 0.70]) * 0.82

    b_damp = np.array([1.0 - alpha_lp], dtype=np.float64)
    a_damp = np.array([1.0, -alpha_lp], dtype=np.float64)

    for start in range(0, n_sig, block):
        end = min(n_sig, start + block)
        blen = end - start

        tap = np.empty((blen, 8), dtype=np.float64)
        for ch_idx in range(8):
            d = int(delays[ch_idx])
            r_start = (write_ptr - d) % buf_len
            if r_start + blen <= buf_len:
                tap[:, ch_idx] = delay_buf[r_start : r_start + blen, ch_idx]
            else:
                first = buf_len - r_start
                tap[:first, ch_idx] = delay_buf[r_start:, ch_idx]
                tap[first:, ch_idx] = delay_buf[: blen - first, ch_idx]

        damped = np.empty_like(tap)
        for ch_idx in range(8):
            damped[:, ch_idx], lp_state[ch_idx : ch_idx + 1] = lfilter(
                b_damp, a_damp, tap[:, ch_idx], zi=lp_state[ch_idx : ch_idx + 1]
            )

        wet_out[start:end, 0] = damped @ out_l_mask
        wet_out[start:end, 1] = damped @ out_r_mask

        fb = (damped @ h8.T) * g_fb[None, :] + in_ch[start:end, :]

        w_end = write_ptr + blen
        if w_end <= buf_len:
            delay_buf[write_ptr:w_end, :] = fb
        else:
            first = buf_len - write_ptr
            delay_buf[write_ptr:, :] = fb[:first, :]
            delay_buf[: blen - first, :] = fb[first:, :]
        write_ptr = (write_ptr + blen) % buf_len

    wet_out[:, 0] = allpass_diffuse(wet_out[:, 0], (89, 179), g=0.45)
    wet_out[:, 1] = allpass_diffuse(wet_out[:, 1], (97, 191), g=0.45)
    wet_scaled = wet_out * wet

    dry_e = max(1e-12, float(np.sum(st ** 2)))
    wet_e = float(np.sum(wet_scaled ** 2))
    wet_pct = 100.0 * wet_e / (dry_e + wet_e)
    return st + wet_scaled, wet_pct


def clean_stereo_chorus(
    audio: np.ndarray, depth_ms: float = 2.8, rate_hz: float = 1.2, mix: float = 0.36
) -> np.ndarray:
    """Apply quadrature-LFO stereo micro-chorus for wide, silky harmonic motion."""
    st = ensure_stereo(audio)
    n = st.shape[0]
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    idx = np.arange(n, dtype=np.float64)
    out = np.zeros_like(st)
    base_d = (depth_ms * 1.6) * SAMPLE_RATE / 1000.0
    amp_d = depth_ms * SAMPLE_RATE / 1000.0
    for ch, phase in [(0, 0.0), (1, math.pi * 0.55)]:
        delay = base_d + amp_d * np.sin(2.0 * math.pi * rate_hz * t + phase)
        delayed = np.interp(np.clip(idx - delay, 0.0, n - 1.0), idx, st[:, ch])
        out[:, ch] = (1.0 - mix) * st[:, ch] + mix * delayed
    return out


def crystal_modal_sparkle(
    n: int,
    base_hz: float,
    ratios: Sequence[float],
    tau_base_s: float,
    rng: np.random.Generator,
    spread: float = 0.85,
) -> np.ndarray:
    """Full-spectrum modal resonator bank extending cleanly into 6-15 kHz."""
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    out = np.zeros((n, 2), dtype=np.float64)
    num = len(ratios)
    for idx, ratio in enumerate(ratios):
        freq = base_hz * ratio * float(rng.uniform(0.997, 1.003))
        if freq > 16500.0:
            continue
        tau = tau_base_s / (1.0 + 0.28 * max(0.0, ratio - 1.0))
        env = (1.0 - np.exp(-t / 0.0015)) * np.exp(-t / max(0.030, tau))
        ph0 = float(rng.uniform(0.0, 2.0 * math.pi))
        mode = np.sin(ph0 + 2.0 * math.pi * freq * t) * env
        weight = 1.0 / ((idx + 1) ** 0.40)
        pan = spread * ((2.0 * idx / max(1, num - 1)) - 1.0)
        out += pan_mono(mode * weight, pan)
    return out / max(1.0, math.sqrt(num))


def linear_phase_master_eq(audio: np.ndarray) -> np.ndarray:
    """Zero-phase FFT Studio EQ: -3.5 dB de-mud @ 310 Hz, +1.5 dB @ 4.8 kHz, +3.0 dB air >8.5 kHz."""
    st = ensure_stereo(audio)
    n = st.shape[0]
    n_fft = 1 << int(math.ceil(math.log2(max(2048, n * 2))))
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / SAMPLE_RATE)

    f_safe = np.maximum(freqs, 1.0)
    hpf_mag = (f_safe ** 2) / np.sqrt(
        (f_safe ** 2 - 28.0 ** 2) ** 2 + (28.0 * f_safe / 0.707) ** 2
    )
    hpf_mag[0] = 0.0

    mud_bell = -3.5 * np.exp(-0.5 * ((np.log2(f_safe / 310.0)) / 0.55) ** 2)
    pres_bell = 1.5 * np.exp(-0.5 * ((np.log2(f_safe / 4800.0)) / 0.75) ** 2)
    air_shelf = 3.0 / (1.0 + (8500.0 / f_safe) ** 2.5)
    nyq_taper = 1.0 / (1.0 + (f_safe / 17500.0) ** 4)

    mag_curve = (
        hpf_mag * (10.0 ** ((mud_bell + pres_bell + air_shelf) / 20.0)) * nyq_taper
    )
    mag_curve[0] = 0.0

    out = np.empty_like(st)
    for ch in range(2):
        spec = np.fft.rfft(st[:, ch], n=n_fft)
        out[:, ch] = np.fft.irfft(spec * mag_curve, n=n_fft)[:n]
    return out


def transparent_limiter(
    audio: np.ndarray,
    target_peak_dbfs: float = -0.8,
    target_rms_dbfs: float = -15.5,
    fade_out_ms: float = 180.0,
) -> np.ndarray:
    """
    Transparent 5 ms lookahead limiter preserving lush natural reverb tails
    and applying a long cosine boundary fade-out to eliminate end cutoffs.
    """
    st = ensure_stereo(audio)
    st = st - np.mean(st, axis=0, keepdims=True)
    n = st.shape[0]

    abs_sig = np.max(np.abs(st), axis=1)
    peak_raw = float(np.max(abs_sig))
    if peak_raw < 1e-9:
        return st

    active_samples = st[abs_sig > peak_raw * 0.04]
    rms_active = (
        float(np.sqrt(np.mean(active_samples ** 2)))
        if len(active_samples) > 0
        else float(np.sqrt(np.mean(st ** 2)))
    )
    desired_rms = 10.0 ** (target_rms_dbfs / 20.0)
    makeup = min(2.8, max(0.4, desired_rms / max(1e-7, rms_active)))
    st = st * makeup

    ceil_lin = 10.0 ** (target_peak_dbfs / 20.0)
    lookahead_n = int(0.005 * SAMPLE_RATE)

    peak_env = np.max(np.abs(st), axis=1)
    padded = np.pad(peak_env, (lookahead_n, 0), mode="constant")
    ahead_max = maximum_filter1d(padded, size=lookahead_n * 2 + 1, mode="constant")[:n]

    req_gain = np.minimum(1.0, ceil_lin / np.maximum(ahead_max, 1e-9))
    a_rel = math.exp(-1.0 / (0.055 * SAMPLE_RATE))
    smooth_gain = np.ones(n, dtype=np.float64)
    cur_g = 1.0
    for i in range(n):
        rg = req_gain[i]
        cur_g = rg if rg < cur_g else (a_rel * cur_g + (1.0 - a_rel) * rg)
        smooth_gain[i] = cur_g

    out = st * smooth_gain[:, None]
    fi = min(n // 6, max(1, int(SAMPLE_RATE * 0.002)))
    fo = min(n // 3, max(1, int(SAMPLE_RATE * fade_out_ms / 1000.0)))
    out[:fi, :] *= (0.5 * (1.0 - np.cos(math.pi * np.linspace(0.0, 1.0, fi))))[:, None]
    out[-fo:, :] *= (0.5 * (1.0 + np.cos(math.pi * np.linspace(0.0, 1.0, fo))))[:, None]
    out = out - np.mean(out, axis=0, keepdims=True)
    final_pk = float(np.max(np.abs(out)))
    if final_pk > ceil_lin:
        out *= ceil_lin / final_pk
    return np.clip(out, -0.99, 0.99)


def finish_hifi(
    audio: np.ndarray,
    fade_out_ms: float = 180.0,
    target_rms_dbfs: float = -15.5,
) -> np.ndarray:
    """Apply zero-phase studio mastering EQ and transparent lookahead limiting."""
    return transparent_limiter(
        linear_phase_master_eq(audio),
        target_peak_dbfs=-0.8,
        target_rms_dbfs=target_rms_dbfs,
        fade_out_ms=fade_out_ms,
    )


def clean_sub_punch(
    t: np.ndarray, f_start: float, f_end: float, f_tau: float, amp_tau: float
) -> np.ndarray:
    """Pure phase-continuous sub pitch-drop with warm 2nd harmonic weight."""
    freq = f_end + (f_start - f_end) * np.exp(-t / f_tau)
    ph = 2.0 * math.pi * np.cumsum(freq) / SAMPLE_RATE
    env = (1.0 - np.exp(-t / 0.002)) * np.exp(-t / amp_tau)
    return (0.82 * np.sin(ph) + 0.24 * np.sin(2.0 * ph)) * env


def shift_stereo(audio: np.ndarray, delay_s: float) -> np.ndarray:
    """Zero-padded positive time shift for stereo arrays."""
    shift = int(delay_s * SAMPLE_RATE)
    if shift <= 0 or shift >= audio.shape[0]:
        return audio
    out = np.zeros_like(audio)
    out[shift:] = audio[: audio.shape[0] - shift]
    return out


# -----------------------------------------------------------------------------
# SELECTED WINNERS & HARMONIZED GAME SFX PALETTE (Hi-Fi Hadamard FDN v4)
# -----------------------------------------------------------------------------


def make_laser(
    seed: int, sweep_hi: float, sweep_lo: float, sub_hi: float, sub_lo: float
) -> np.ndarray:
    """Instant futuristic plasma whip: sleek non-stationary FM glide + sub thump (zero noise fizz)."""
    del seed  # Deterministic closed-form synthesis for cleanly matching firefights
    dur = 0.85
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    f_sweep = sweep_lo + (sweep_hi - sweep_lo) * np.exp(-t / 0.020)
    ph = 2.0 * math.pi * np.cumsum(f_sweep) / SAMPLE_RATE
    fm = 0.82 * np.exp(-t / 0.012) * np.sin(2.0 * ph)
    env = (1.0 - np.exp(-t / 0.0012)) * np.exp(-t / 0.038)
    core = pan_mono(
        (0.76 * np.sin(ph + fm) + 0.24 * np.sin(2.0 * ph)) * env * 0.78,
        0.0,
    )
    core = clean_stereo_chorus(core, depth_ms=1.8, rate_hz=2.0, mix=0.30)

    # Ultrafast energy-whip sheen (swept sine instead of white-noise hiss)
    f_zip = 320.0 + (sweep_hi * 2.1 - 320.0) * np.exp(-t / 0.008)
    ph_zip = 2.0 * math.pi * np.cumsum(f_zip) / SAMPLE_RATE
    zip_env = (1.0 - np.exp(-t / 0.0008)) * np.exp(-t / 0.016)
    zip_air = clean_stereo_chorus(
        pan_mono(np.sin(ph_zip) * zip_env * 0.26, 0.0),
        depth_ms=2.2,
        rate_hz=2.6,
        mix=0.40,
    )

    sub = pan_mono(clean_sub_punch(t, sub_hi, sub_lo, 0.020, 0.048) * 0.68, 0.0)

    dry = core + zip_air + sub
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=0.62, wet=0.48, pre_delay_ms=14.0, hp_hz=380.0, hf_damp_hz=9000.0
    )
    return finish_hifi(wet, fade_out_ms=150.0)


def make_bullet_hit(seed: int, thud_hi: float, thud_lo: float) -> np.ndarray:
    """Cohesive damped plasma deflector thump + micro-zip transient (zero static speck)."""
    del seed
    dur = 0.65
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    thud = pan_mono(clean_sub_punch(t, thud_hi, thud_lo, 0.010, 0.026) * 1.05, 0.0)

    f_def = 140.0 + (thud_hi * 3.6) * np.exp(-t / 0.006)
    ph_def = 2.0 * math.pi * np.cumsum(f_def) / SAMPLE_RATE
    def_env = (1.0 - np.exp(-t / 0.0007)) * np.exp(-t / 0.011)
    deflect = clean_stereo_chorus(
        pan_mono(np.sin(ph_def) * def_env * 0.58, 0.0),
        depth_ms=1.4,
        rate_hz=2.2,
        mix=0.30,
    )

    wet, _ = studio_fdn_reverb(
        thud + deflect,
        rt60_s=0.45,
        wet=0.38,
        pre_delay_ms=10.0,
        hp_hz=420.0,
        hf_damp_hz=8500.0,
    )
    return finish_hifi(wet, fade_out_ms=120.0)


def make_food_collect(seed: int, f1: float, f2: float, body_hz: float) -> np.ndarray:
    """Light, crisp pentatonic celesta spark + warm body (trimmed decay for clean pickup trails)."""
    rng = np.random.default_rng(seed)
    dur = 1.20
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    c1 = crystal_modal_sparkle(n, f1, (1.0, 2.0, 3.0, 4.0, 6.0, 8.0), 0.10, rng) * 0.56
    c2 = shift_stereo(
        crystal_modal_sparkle(n, f2, (1.0, 2.0, 3.0, 4.0, 6.0), 0.085, rng) * 0.34,
        0.024,
    )
    body = pan_mono(
        np.sin(2.0 * math.pi * body_hz * t)
        * (1.0 - np.exp(-t / 0.003))
        * np.exp(-t / 0.085)
        * 0.36,
        0.0,
    )

    dry = clean_stereo_chorus(c1 + c2 + body, depth_ms=2.2, rate_hz=1.4, mix=0.35)
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=0.95, wet=0.60, pre_delay_ms=16.0, hp_hz=320.0, hf_damp_hz=10500.0
    )
    return finish_hifi(wet, fade_out_ms=180.0)


def make_ship_explode(
    seed: int,
    inhale_s: float,
    sub_hi: float,
    sub_lo: float,
    punch_hi: float,
    punch_lo: float,
) -> np.ndarray:
    """Vacuum inhale + micro-gap -> deep seismic sub-bass implosion + warm FDN space bloom."""
    rng = np.random.default_rng(seed)
    dur = 2.05
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    inhale = butter_filter(
        rng.standard_normal((n, 2)), "band", (2200.0, 10500.0), order=2
    )
    inhale *= np.where(t < inhale_s, (t / inhale_s) ** 2 * 0.16, 0.0)[:, None]
    inhale += pan_mono(
        np.where(
            t < inhale_s,
            np.sin(
                2.0
                * math.pi
                * np.cumsum(140.0 + 240.0 * (t / inhale_s) ** 2)
                / SAMPLE_RATE
            )
            * ((t / inhale_s) ** 1.5)
            * 0.24,
            0.0,
        ),
        0.0,
    )

    t0 = inhale_s + 0.014
    dt = np.maximum(0.0, t - t0)
    active = t >= t0

    # Deep seismic sub-bass drop + warm low-mid chest thump (unpitched, zero chords)
    sub = pan_mono(
        np.where(active, clean_sub_punch(dt, sub_hi, sub_lo, 0.062, 0.30) * 1.10, 0.0),
        0.0,
    )
    punch = pan_mono(
        np.where(
            active, clean_sub_punch(dt, punch_hi, punch_lo, 0.018, 0.062) * 0.62, 0.0
        ),
        0.0,
    )

    # Low-end seismic pressure rumble (45-180 Hz) for warm acoustic explosion fullness
    rumble = (
        butter_filter(rng.standard_normal((n, 2)), "band", (45.0, 185.0), order=2)
        * np.where(
            active, (1.0 - np.exp(-dt / 0.008)) * np.exp(-dt / 0.12) * 0.34, 0.0
        )[:, None]
    )

    # Swept plasma shock-excitation fed cleanly into the hall (zero dry snare-brush noise)
    shock_whip = pan_mono(
        np.where(active, clean_sub_punch(dt, 480.0, 95.0, 0.014, 0.032) * 0.50, 0.0),
        0.0,
    )
    velvet_air = (
        butter_filter(rng.standard_normal((n, 2)), "band", (350.0, 3400.0), order=2)
        * np.where(
            active, (1.0 - np.exp(-dt / 0.004)) * np.exp(-dt / 0.040) * 0.15, 0.0
        )[:, None]
    )

    dry = inhale + sub + punch + rumble + shock_whip + velvet_air
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=1.45, wet=0.70, pre_delay_ms=22.0, hp_hz=280.0, hf_damp_hz=7200.0
    )
    return finish_hifi(wet, fade_out_ms=240.0)


def make_boost() -> np.ndarray:
    """Deep cosmic sub-bass warp surge with punchy low ignition and restrained dark fifth."""
    rng = np.random.default_rng(8102)
    dur = 1.90
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    t_peak = 0.16
    env = ((t / t_peak) * np.exp(1.0 - t / t_peak)) ** 0.90
    f_arc = (t / 0.22) * np.exp(1.0 - t / 0.22)

    ignition = pan_mono(clean_sub_punch(t, 260.0, 42.0, 0.022, 0.085) * 1.25, 0.0)

    sub_f = 36.0 + 42.0 * f_arc
    sub_ph = 2.0 * math.pi * np.cumsum(sub_f) / SAMPLE_RATE
    sub_wave = pan_mono(
        (
            0.82 * np.sin(sub_ph)
            + 0.28 * np.sin(2.0 * sub_ph)
            + 0.10 * np.sin(3.0 * sub_ph)
        )
        * env
        * 0.90,
        0.0,
    )

    glide_ratio = 0.90 + 0.18 * f_arc
    low_pad = np.zeros((n, 2), dtype=np.float64)
    for idx, f in enumerate([73.42, 110.00, 146.83]):
        ph = 2.0 * math.pi * np.cumsum(f * glide_ratio) / SAMPLE_RATE
        pan = -0.45 + 0.45 * idx
        low_pad += pan_mono(
            (0.80 * np.sin(ph) + 0.20 * np.sin(2.0 * ph)) * (0.20 - 0.03 * idx),
            pan,
        )
    low_pad = clean_stereo_chorus(
        low_pad * env[:, None], depth_ms=3.0, rate_hz=1.2, mix=0.38
    )

    air_env = (1.0 - np.exp(-t / 0.004)) * np.exp(-t / 0.095) * 0.18 + env * 0.10
    prop_air = (
        butter_filter(rng.standard_normal((n, 2)), "band", (350.0, 2600.0), order=2)
        * air_env[:, None]
    )

    dry = ignition + sub_wave + low_pad + prop_air
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=1.35, wet=0.62, pre_delay_ms=20.0, hp_hz=260.0, hf_damp_hz=6800.0
    )
    return finish_hifi(wet, fade_out_ms=220.0, target_rms_dbfs=-12.8)


def make_ship_gain() -> np.ndarray:
    """Understated warm magnetic fleet-docking bass pulse + subtle glass glint."""
    rng = np.random.default_rng(8601)
    dur = 1.15
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    f_rise = 90.0 + 85.0 * (1.0 - np.exp(-t / 0.035))
    ph = 2.0 * math.pi * np.cumsum(f_rise) / SAMPLE_RATE
    dock = pan_mono(
        (0.80 * np.sin(ph) + 0.22 * np.sin(2.0 * ph))
        * (1.0 - np.exp(-t / 0.004))
        * np.exp(-t / 0.095)
        * 0.85,
        0.0,
    )

    lock = shift_stereo(
        pan_mono(clean_sub_punch(t, 130.0, 68.0, 0.020, 0.085) * 0.52, 0.0),
        0.045,
    )
    glint = shift_stereo(
        crystal_modal_sparkle(n, 880.0, (1.0, 2.0), 0.055, rng, spread=0.45) * 0.22,
        0.045,
    )

    dry = dock + lock + glint
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=0.85, wet=0.52, pre_delay_ms=16.0, hp_hz=320.0, hf_damp_hz=8800.0
    )
    return finish_hifi(wet, fade_out_ms=170.0)


def make_kill_confirm() -> np.ndarray:
    """Deep bass confirmation drop + tight kinetic lock punch + single octave glint."""
    rng = np.random.default_rng(8701)
    dur = 1.45
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    sub = pan_mono(clean_sub_punch(t, 165.0, 42.0, 0.035, 0.16) * 1.02, 0.0)
    snap = pan_mono(clean_sub_punch(t, 360.0, 92.0, 0.011, 0.032) * 0.72, 0.0)
    glint = shift_stereo(
        clean_stereo_chorus(
            crystal_modal_sparkle(n, 659.25, (1.0, 2.0), 0.085, rng, spread=0.55)
            * 0.26,
            depth_ms=2.0,
            rate_hz=1.5,
            mix=0.32,
        ),
        0.040,
    )

    dry = sub + snap + glint
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=1.05, wet=0.56, pre_delay_ms=18.0, hp_hz=320.0, hf_damp_hz=8500.0
    )
    return finish_hifi(wet, fade_out_ms=190.0)


def make_player_spawn() -> np.ndarray:
    """Luminous arena materialization swell: warm Dadd9 pad + lock-in pulse + shimmer."""
    rng = np.random.default_rng(8801)
    dur = 2.35
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    t0 = 0.085
    dt = np.maximum(0.0, t - t0)
    active = t >= t0

    swell_env = np.where(t < t0, (t / t0) ** 2, np.exp(-dt / 0.36))
    glide = np.where(t < t0, 0.84 + 0.16 * (t / t0) ** 1.5, 1.0)
    chord = np.zeros((n, 2), dtype=np.float64)
    for idx, f in enumerate([146.83, 220.00, 293.66, 440.00, 659.25, 880.00]):
        ph = 2.0 * math.pi * np.cumsum(f * glide) / SAMPLE_RATE
        chord += pan_mono(
            (0.75 * np.sin(ph) + 0.25 * np.sin(2.0 * ph)) * (0.26 - 0.025 * idx),
            -0.6 + 0.24 * idx,
        )
    chord = clean_stereo_chorus(
        chord * swell_env[:, None], depth_ms=3.0, rate_hz=1.2, mix=0.44
    )

    sub = pan_mono(
        np.where(active, clean_sub_punch(dt, 138.0, 56.0, 0.045, 0.20) * 0.60, 0.0),
        0.0,
    )
    spark = shift_stereo(
        crystal_modal_sparkle(n, 1760.0, (1.0, 1.5, 2.0, 3.0, 4.5, 6.0), 0.26, rng)
        * 0.44,
        t0,
    )

    dry = chord + sub + spark
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=1.85, wet=0.78, pre_delay_ms=24.0, hf_damp_hz=11200.0
    )
    return finish_hifi(wet, fade_out_ms=260.0)


def make_player_death() -> np.ndarray:
    """Winner `death_4B_void_horizon`: 52 ms inhale -> sub drop + crystal + void chord."""
    rng = np.random.default_rng(8502)
    dur = 2.95
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    inhale = butter_filter(rng.standard_normal(n), "band", (2200.0, 12500.0), order=2)
    inhale *= np.where(t < 0.052, (t / 0.052) ** 2 * 0.22, 0.0)[:, None]
    inhale += pan_mono(
        np.where(
            t < 0.052,
            np.sin(
                2.0
                * math.pi
                * np.cumsum(260.0 + 620.0 * (t / 0.052) ** 2)
                / SAMPLE_RATE
            )
            * (t / 0.052)
            * 0.35,
            0.0,
        ),
        0.0,
    )

    t0 = 0.068
    dt = np.maximum(0.0, t - t0)
    active = t >= t0
    sub = pan_mono(
        np.where(active, clean_sub_punch(dt, 110.0, 32.0, 0.14, 0.34) * 0.62, 0.0),
        0.0,
    )

    shimmer = shift_stereo(
        crystal_modal_sparkle(
            n, 880.0, (1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.5, 7.5, 10.0), 0.36, rng
        )
        * 0.65,
        t0,
    )

    drop = 1.0 - 0.28 * (1.0 - np.exp(-dt / 0.60))
    pad_env = np.where(active, (1.0 - np.exp(-dt / 0.025)) * np.exp(-dt / 0.54), 0.0)
    chord = np.zeros((n, 2), dtype=np.float64)
    for idx, f in enumerate([196.00, 293.66, 392.00, 587.33, 880.00, 1174.66]):
        ph = 2.0 * math.pi * np.cumsum(f * drop) / SAMPLE_RATE
        chord += pan_mono(
            (0.72 * np.sin(ph) + 0.28 * np.sin(2.0 * ph)) * (0.30 - 0.025 * idx),
            -0.6 + 0.24 * idx,
        )
    chord = clean_stereo_chorus(
        chord * pad_env[:, None], depth_ms=3.4, rate_hz=1.2, mix=0.45
    )

    dry = inhale + sub + shimmer + chord
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=2.45, wet=0.82, pre_delay_ms=28.0, hf_damp_hz=11500.0
    )
    return finish_hifi(wet, fade_out_ms=300.0)


def make_danger_zone() -> np.ndarray:
    """Non-fatiguing deep-space sonar two-tone (E4 -> B3 fourth) + chest pulse."""
    rng = np.random.default_rng(8901)
    dur = 1.60
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    p1 = crystal_modal_sparkle(n, 329.63, (1.0, 2.0, 3.0, 4.0), 0.14, rng, spread=0.35) * 0.55
    p2 = shift_stereo(
        crystal_modal_sparkle(n, 246.94, (1.0, 2.0, 3.0, 4.0), 0.18, rng, spread=0.35)
        * 0.52,
        0.18,
    )

    sub1 = pan_mono(clean_sub_punch(t, 140.0, 82.41, 0.030, 0.14) * 0.42, -0.1)
    sub2 = shift_stereo(
        pan_mono(clean_sub_punch(t, 120.0, 61.74, 0.030, 0.16) * 0.42, 0.1), 0.18
    )

    dry = clean_stereo_chorus(p1 + p2, depth_ms=2.0, rate_hz=1.1, mix=0.30) + sub1 + sub2
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=1.25, wet=0.70, pre_delay_ms=22.0, hf_damp_hz=9800.0
    )
    return finish_hifi(wet, fade_out_ms=200.0)


def make_ctf_event() -> np.ndarray:
    """Resonant open-fifth beacon broadcast (D5 -> A5) with warm harmonic foundation."""
    rng = np.random.default_rng(9001)
    dur = 2.05
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    b1 = crystal_modal_sparkle(n, 587.33, (1.0, 1.5, 2.0, 3.0, 4.5, 6.0), 0.22, rng) * 0.55
    b2 = shift_stereo(
        crystal_modal_sparkle(n, 880.00, (1.0, 1.5, 2.0, 3.0, 4.5, 6.0), 0.24, rng) * 0.58,
        0.11,
    )

    pad_env = (1.0 - np.exp(-t / 0.025)) * np.exp(-t / 0.34)
    pad = np.zeros((n, 2), dtype=np.float64)
    for idx, f in enumerate([146.83, 220.00, 293.66, 440.00]):
        pad += pan_mono(np.sin(2.0 * math.pi * f * t) * (0.24 - 0.02 * idx), -0.5 + 0.33 * idx)
    pad = clean_stereo_chorus(pad * pad_env[:, None], depth_ms=2.8, rate_hz=1.2, mix=0.40)

    sub = pan_mono(clean_sub_punch(t, 146.83, 73.42, 0.045, 0.18) * 0.52, 0.0)
    dry = b1 + b2 + pad + sub
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=1.65, wet=0.76, pre_delay_ms=22.0, hf_damp_hz=11500.0
    )
    return finish_hifi(wet, fade_out_ms=240.0)


def make_ctf_victory() -> np.ndarray:
    """Expansive ambient major-9th victory cadence with cascading celesta fifths."""
    rng = np.random.default_rng(9101)
    dur = 3.00
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    sub = pan_mono(clean_sub_punch(t, 130.81, 65.41, 0.08, 0.36) * 0.65, 0.0)

    pad_env = (1.0 - np.exp(-t / 0.045)) * np.exp(-t / 0.62)
    pad = np.zeros((n, 2), dtype=np.float64)
    for idx, f in enumerate([130.81, 196.00, 261.63, 293.66, 392.00, 659.25]):
        pad += pan_mono(
            (0.76 * np.sin(2.0 * math.pi * f * t) + 0.24 * np.sin(4.0 * math.pi * f * t))
            * (0.26 - 0.025 * idx),
            -0.65 + 0.26 * idx,
        )
    pad = clean_stereo_chorus(pad * pad_env[:, None], depth_ms=3.2, rate_hz=1.1, mix=0.44)

    chimes = np.zeros((n, 2), dtype=np.float64)
    for delay_s, note_hz, amp in [
        (0.00, 783.99, 0.48),
        (0.11, 1174.66, 0.45),
        (0.22, 1318.51, 0.44),
        (0.33, 1567.98, 0.50),
    ]:
        chimes += shift_stereo(
            crystal_modal_sparkle(n, note_hz, (1.0, 2.0, 3.0, 4.0, 6.0), 0.30, rng) * amp,
            delay_s,
        )

    dry = sub + pad + chimes
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=2.35, wet=0.80, pre_delay_ms=26.0, hf_damp_hz=11800.0
    )
    return finish_hifi(wet, fade_out_ms=300.0)


def make_ui_click() -> np.ndarray:
    """Ultra-clean glassy micro-pluck with tight studio room reflection."""
    rng = np.random.default_rng(9201)
    dur = 0.55
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)

    f_flick = 740.0 + 380.0 * (1.0 - np.exp(-t / 0.004))
    ph = 2.0 * math.pi * np.cumsum(f_flick) / SAMPLE_RATE
    env = (1.0 - np.exp(-t / 0.0008)) * np.exp(-t / 0.011)
    pluck = pan_mono((0.82 * np.sin(ph) + 0.18 * np.sin(2.0 * ph)) * env * 0.72, 0.0)
    air = crystal_modal_sparkle(n, 2960.0, (1.0, 1.5, 2.0), 0.022, rng, spread=0.35) * 0.24

    dry = pluck + air
    wet, _ = studio_fdn_reverb(
        dry, rt60_s=0.35, wet=0.42, pre_delay_ms=8.0, hf_damp_hz=12000.0
    )
    return finish_hifi(wet, fade_out_ms=120.0)


BUILDERS: Dict[str, Callable[[], np.ndarray]] = {
    "laser_fire_1.mp3": lambda: make_laser(8311, 1280.0, 86.0, 152.0, 54.0),
    "laser_fire_2.mp3": lambda: make_laser(8312, 1180.0, 78.0, 142.0, 50.0),
    "laser_fire_3.mp3": lambda: make_laser(8313, 1380.0, 94.0, 162.0, 58.0),
    "bullet_hit_1.mp3": lambda: make_bullet_hit(8961, 195.0, 56.0),
    "bullet_hit_2.mp3": lambda: make_bullet_hit(8962, 220.0, 62.0),
    "food_collect_1.mp3": lambda: make_food_collect(8401, 587.33, 880.00, 293.66),
    "food_collect_2.mp3": lambda: make_food_collect(8402, 659.25, 987.77, 329.63),
    "food_collect_3.mp3": lambda: make_food_collect(8403, 783.99, 1174.66, 392.00),
    "ship_explode_1.mp3": lambda: make_ship_explode(
        8211, 0.036, 118.0, 31.0, 275.0, 62.0
    ),
    "ship_explode_2.mp3": lambda: make_ship_explode(
        8212, 0.040, 110.0, 28.0, 250.0, 58.0
    ),
    "ship_explode_3.mp3": lambda: make_ship_explode(
        8213, 0.034, 126.0, 34.0, 300.0, 66.0
    ),
    "boost.mp3": make_boost,
    "ship_gain.mp3": make_ship_gain,
    "kill_confirm.mp3": make_kill_confirm,
    "player_spawn.mp3": make_player_spawn,
    "player_death.mp3": make_player_death,
    "danger_zone.mp3": make_danger_zone,
    "ctf_event.mp3": make_ctf_event,
    "ctf_victory.mp3": make_ctf_victory,
    "ui_click.mp3": make_ui_click,
}


# -----------------------------------------------------------------------------
# WAV WRITE, LAME V0 ENCODE & QC VERIFICATION
# -----------------------------------------------------------------------------


def write_wav_int16(path: Path, audio: np.ndarray) -> None:
    """Write stereo float64 audio clamped to [-1, 1] as 16-bit PCM WAV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.int16(np.clip(ensure_stereo(audio), -1.0, 1.0) * 32767.0)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def encode_mp3(ffmpeg_bin: str, wav_path: Path, mp3_path: Path) -> None:
    """Encode WAV to transparent LAME V0 (~245 kbps VBR) MP3 preserving >10 kHz air."""
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
        "-q:a",
        "0",
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
    """Verify every expected MP3 file exists and passes peak, DC, clipping, and tail-decay QC."""
    failures: List[str] = []
    total_bytes = 0
    print(
        f"{'File':<22} {'Dur(ms)':>8} {'Peak(dBFS)':>11} {'RMS(dBFS)':>10} {'TailEnd':>10} {'DC Off':>10} {'Size(KB)':>9}"
    )
    print("-" * 88)

    tail_samples = int(0.08 * SAMPLE_RATE)

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
        tail_n = min(pcm.shape[0], tail_samples)
        tail_rms = float(np.sqrt(np.mean(pcm[-tail_n:] ** 2)))
        tail_db = 20.0 * math.log10(max(tail_rms, 1e-9))
        dc = float(np.max(np.abs(np.mean(pcm, axis=0))))

        print(
            f"{fname:<22} {dur_ms:8.1f} {peak_db:11.2f} {rms_db:10.2f} {tail_db:10.2f} {dc:10.6f} {size_bytes / 1024.0:9.1f}"
        )

        if peak >= 0.999:
            failures.append(f"Clipping detected in {fname}: peak={peak:.4f}")
        if not (-4.5 <= peak_db <= -0.2):
            failures.append(f"Peak out of range in {fname}: {peak_db:.2f} dBFS")
        if tail_db > -48.0:
            failures.append(f"Abrupt tail cutoff risk in {fname}: TailEnd={tail_db:.2f} dBFS")
        if dc >= 1e-3:
            failures.append(f"Excess DC offset in {fname}: {dc:.6f}")

    print("-" * 88)
    print(
        f"Total files: {len(EXPECTED_FILES)} | Total footprint: {total_bytes / 1024.0:.1f} KB"
    )

    if failures:
        print("\nQC FAILED:", file=sys.stderr)
        for err in failures:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("QC PASSED: All 20 MP3 files meet DSP, tail-decay, and footprint invariants.")
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
