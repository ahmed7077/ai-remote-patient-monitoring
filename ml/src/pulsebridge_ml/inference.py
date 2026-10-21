from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from pulsebridge_ml import MODEL_VERSION
from pulsebridge_ml.features import FEATURE_NAMES


class ArtifactError(RuntimeError):
    """Raised when a trusted local model artifact fails integrity validation."""


@dataclass(frozen=True)
class Prediction:
    label: str
    probability: float
    threshold: float
    model_version: str


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class TrustedModel:
    def __init__(self, artifact_path: Path, metadata_path: Path) -> None:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("model_version") != MODEL_VERSION:
            raise ArtifactError("Model metadata version does not match the application")
        if metadata.get("artifact_sha256") != file_sha256(artifact_path):
            raise ArtifactError("Model artifact checksum does not match trusted metadata")
        payload: dict[str, Any] = joblib.load(artifact_path)
        if payload.get("model_version") != MODEL_VERSION:
            raise ArtifactError("Serialized model version does not match the application")
        if tuple(payload.get("feature_names", ())) != FEATURE_NAMES:
            raise ArtifactError("Serialized feature schema does not match the application")
        self.pipeline = payload["pipeline"]
        self.threshold = float(payload["threshold"])

    def predict(self, features: np.ndarray) -> Prediction:
        values = np.asarray(features, dtype=float)
        if values.shape != (len(FEATURE_NAMES),):
            raise ValueError(f"Expected {len(FEATURE_NAMES)} ordered features")
        if np.isinf(values).any():
            raise ValueError("Features cannot contain infinite values")
        probability = float(self.pipeline.predict_proba(values.reshape(1, -1))[0, 1])
        return Prediction(
            label="IN_HOSPITAL_DEATH" if probability >= self.threshold else "SURVIVAL",
            probability=probability,
            threshold=self.threshold,
            model_version=MODEL_VERSION,
        )
