from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pulsebridge_ml.features import FEATURE_NAMES, Observation, summarize


@dataclass(frozen=True)
class Dataset:
    record_ids: np.ndarray
    features: np.ndarray
    targets: np.ndarray


def parse_elapsed_minutes(value: str) -> int:
    hours, minutes = value.split(":", maxsplit=1)
    return int(hours) * 60 + int(minutes)


def read_record(path: Path) -> np.ndarray:
    observations: list[Observation] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            parameter = row["Parameter"]
            value = float(row["Value"])
            if value < 0:
                continue
            observations.append(Observation(parse_elapsed_minutes(row["Time"]), parameter, value))
    return summarize(observations)


def read_outcomes(path: Path) -> dict[str, int]:
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["RecordID"]: int(row["In-hospital_death"]) for row in csv.DictReader(handle)}


def load_partition(records_dir: Path, outcomes_path: Path) -> Dataset:
    outcomes = read_outcomes(outcomes_path)
    record_ids = sorted(outcomes)
    missing = [
        record_id for record_id in record_ids if not (records_dir / f"{record_id}.txt").is_file()
    ]
    if missing:
        raise ValueError(
            f"Missing {len(missing)} record files; first missing record is {missing[0]}"
        )
    features = np.vstack(
        [read_record(records_dir / f"{record_id}.txt") for record_id in record_ids]
    )
    if features.shape != (len(record_ids), len(FEATURE_NAMES)):
        raise ValueError("Feature matrix does not match the declared schema")
    targets = np.asarray([outcomes[record_id] for record_id in record_ids], dtype=int)
    if not set(np.unique(targets)).issubset({0, 1}):
        raise ValueError("In-hospital death target must be binary")
    return Dataset(np.asarray(record_ids), features, targets)
