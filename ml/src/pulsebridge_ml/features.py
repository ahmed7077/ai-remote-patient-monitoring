from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

import numpy as np

SUPPORTED_PARAMETERS = ("HR", "Temp")
STATISTICS = ("minimum", "maximum", "mean", "std", "last", "slope", "count")
FEATURE_NAMES = tuple(
    f"{parameter}_{statistic}" for parameter in SUPPORTED_PARAMETERS for statistic in STATISTICS
)
FEATURE_UNITS = {
    "HR": "beats/min",
    "Temp": "degrees Celsius",
}


@dataclass(frozen=True)
class Observation:
    minute: int
    parameter: str
    value: float


def summarize(observations: Iterable[Observation]) -> np.ndarray:
    """Create fixed-order 48-hour summaries without fabricating missing measurements."""
    grouped: dict[str, list[Observation]] = {name: [] for name in SUPPORTED_PARAMETERS}
    for observation in observations:
        if observation.parameter in grouped and np.isfinite(observation.value):
            grouped[observation.parameter].append(observation)

    result: list[float] = []
    for parameter in SUPPORTED_PARAMETERS:
        values = sorted(grouped[parameter], key=lambda item: item.minute)
        if not values:
            result.extend([np.nan] * 6 + [0.0])
            continue
        numeric = np.asarray([item.value for item in values], dtype=float)
        times = np.asarray([item.minute for item in values], dtype=float)
        slope = 0.0
        if len(values) > 1 and np.ptp(times) > 0:
            slope = float(np.polyfit(times, numeric, 1)[0] * 60.0)
        result.extend(
            [
                float(np.min(numeric)),
                float(np.max(numeric)),
                float(np.mean(numeric)),
                float(np.std(numeric)),
                float(numeric[-1]),
                slope,
                float(len(numeric)),
            ]
        )
    return np.asarray(result, dtype=float)
