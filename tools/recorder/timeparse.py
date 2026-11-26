"""Timestamp parsing and formatting utilities for replay range selection."""

from __future__ import annotations

import math


def parse_timestamp_sec(value: str | float | int) -> float:
    """
    Parses a timestamp into non-negative seconds.

    Supported formats:
      - Plain numeric seconds: ``"90"``, ``"12.5"``, ``0``
      - Minutes and seconds:   ``"02:15"``, ``"12:30.5"``
      - Hours, minutes, secs:  ``"1:02:03"``, ``"0:12:30.25"``
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        sec = float(value)
        if not math.isfinite(sec) or sec < 0:
            raise ValueError(f"Timestamp must be finite and non-negative, got {value!r}.")
        return sec

    raw = str(value).strip()
    if not raw:
        raise ValueError("Timestamp cannot be empty.")
    if raw.startswith("-"):
        raise ValueError(f"Timestamp cannot be negative: {value!r}.")

    if ":" not in raw:
        try:
            sec = float(raw)
        except ValueError as exc:
            raise ValueError(f"Invalid timestamp '{raw}'.") from exc
        if not math.isfinite(sec) or sec < 0:
            raise ValueError(f"Timestamp must be finite and non-negative, got '{raw}'.")
        return sec

    parts = raw.split(":")
    if len(parts) not in (2, 3):
        raise ValueError(
            f"Invalid timestamp '{raw}'. Expected seconds, MM:SS, or HH:MM:SS."
        )

    try:
        if len(parts) == 2:
            hours = 0
            minutes = int(parts[0])
            seconds = float(parts[1])
        else:
            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = float(parts[2])
    except ValueError as exc:
        raise ValueError(
            f"Invalid timestamp '{raw}'. Expected numeric MM:SS or HH:MM:SS."
        ) from exc

    if hours < 0 or minutes < 0 or seconds < 0 or not math.isfinite(seconds):
        raise ValueError(f"Invalid negative/non-finite component in timestamp '{raw}'.")
    if minutes >= 60 or seconds >= 60:
        raise ValueError(
            f"Minutes and seconds must be < 60 in colon timestamp '{raw}'."
        )

    return hours * 3600.0 + minutes * 60.0 + seconds


def format_timestamp(seconds: float) -> str:
    """Formats seconds as ``MM:SS.ss`` (or ``H:MM:SS.ss`` when >= 1 hour)."""
    clamped = max(0.0, float(seconds))
    total_cs = int(round(clamped * 100.0))
    cs = total_cs % 100
    total_sec = total_cs // 100
    hrs, rem = divmod(total_sec, 3600)
    mins, secs = divmod(rem, 60)
    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}.{cs:02d}"
    return f"{mins:02d}:{secs:02d}.{cs:02d}"
