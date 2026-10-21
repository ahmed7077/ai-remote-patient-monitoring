from __future__ import annotations

import hashlib
import json
import math
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib  # type: ignore[import-untyped]
import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import MeasurementSession, MLPrediction, QualityStatus, VitalType

MODEL_IDENTIFIER = "physionet-2012-icu-mortality"
MODEL_VERSION = "icu-mortality-hr-temp-v1"
ASSESSMENT_METHOD = "ML_CLASSIFIER_V1"
SUPPORTED_PARAMETERS = ("HEART_RATE", "TEMPERATURE")
STATISTICS = ("minimum", "maximum", "mean", "std", "last", "slope", "count")
FEATURE_NAMES = tuple(
    f"{parameter}_{statistic}" for parameter in ("HR", "Temp") for statistic in STATISTICS
)
ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "ml_artifacts"
ARTIFACT_PATH = ARTIFACT_DIR / f"{MODEL_VERSION}.joblib"
METADATA_PATH = ARTIFACT_DIR / f"{MODEL_VERSION}.metadata.json"


class MLArtifactError(RuntimeError):
    pass


@dataclass(frozen=True)
class Observation:
    recorded_at: datetime
    parameter: str
    value: float


@dataclass(frozen=True)
class MLInferenceResult:
    available: bool
    explanation: str
    metadata: dict[str, Any]
    prediction: MLPrediction | None = None


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class MLRiskAssessmentService:
    def __init__(
        self, artifact_path: Path = ARTIFACT_PATH, metadata_path: Path = METADATA_PATH
    ) -> None:
        self.available = False
        self.unavailable_reason: str | None = None
        self.metadata: dict[str, Any] = {
            "model_identifier": MODEL_IDENTIFIER,
            "model_version": MODEL_VERSION,
            "target": "In-hospital death after the first 48 hours of an ICU stay",
            "input_window_hours": 48,
            "held_out_metrics": {},
            "limitations": ["The trusted model artifact is unavailable."],
        }
        self.pipeline: Any | None = None
        self.threshold = 0.5
        try:
            self._load(artifact_path, metadata_path)
        except (OSError, ValueError, KeyError, MLArtifactError) as exc:
            self.unavailable_reason = str(exc)

    def _load(self, artifact_path: Path, metadata_path: Path) -> None:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("model_identifier") != MODEL_IDENTIFIER:
            raise MLArtifactError("Unexpected model identifier")
        if metadata.get("model_version") != MODEL_VERSION:
            raise MLArtifactError("Model metadata version mismatch")
        if metadata.get("artifact_sha256") != sha256(artifact_path):
            raise MLArtifactError("Model artifact checksum mismatch")
        payload: dict[str, Any] = joblib.load(artifact_path)
        if payload.get("model_version") != MODEL_VERSION:
            raise MLArtifactError("Serialized model version mismatch")
        if tuple(payload.get("feature_names", ())) != FEATURE_NAMES:
            raise MLArtifactError("Serialized feature schema mismatch")
        self.metadata = metadata
        self.pipeline = payload["pipeline"]
        self.threshold = float(payload["threshold"])
        self.available = True

    def model_summary(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "model_identifier": MODEL_IDENTIFIER,
            "model_version": MODEL_VERSION,
            "assessment_method": ASSESSMENT_METHOD,
            "target": self.metadata["target"],
            "supported_parameters": list(SUPPORTED_PARAMETERS),
            "input_window_hours": int(self.metadata["input_window_hours"]),
            "development_partition": self.metadata.get("development_partition", "Unavailable"),
            "held_out_partition": self.metadata.get("held_out_partition", "Unavailable"),
            "held_out_metrics": self.metadata.get("held_out_metrics", {}),
            "model_comparison": self.metadata.get("cross_validation", {}),
            "global_feature_importance": self.metadata.get("permutation_importance", {}),
            "limitations": self.metadata.get("limitations", []),
            "unavailable_reason": self.unavailable_reason,
        }

    def assess(self, db: Session, patient_id: uuid.UUID) -> MLInferenceResult:
        if not self.available or self.pipeline is None:
            return MLInferenceResult(
                False,
                (
                    "ML inference is unavailable because the trusted model artifact "
                    "could not be loaded."
                ),
                self.metadata,
            )
        sessions = list(
            db.scalars(
                select(MeasurementSession)
                .options(selectinload(MeasurementSession.measurements))
                .where(MeasurementSession.patient_id == patient_id)
                .order_by(MeasurementSession.recorded_at.desc())
                .limit(1000)
            )
        )
        if not sessions:
            return self._insufficient("No persisted monitoring sessions are available.")
        window_ended_at = max(utc(item.recorded_at) for item in sessions)
        cutoff = window_ended_at - timedelta(hours=48)
        window = [item for item in sessions if cutoff <= utc(item.recorded_at) <= window_ended_at]
        window_started_at = min(utc(item.recorded_at) for item in window)
        if window_ended_at - window_started_at < timedelta(hours=47):
            return self._insufficient(
                "A nearly complete 48-hour history is required; more monitoring time is needed."
            )
        observations = self._observations(window)
        counts = {
            parameter: sum(item.parameter == parameter for item in observations)
            for parameter in ("HR", "Temp")
        }
        if any(count < 2 for count in counts.values()):
            return self._insufficient(
                "At least two technically valid heart-rate and temperature "
                "measurements are required."
            )
        features = self._summarize(observations, window_started_at)
        if not np.isfinite(features).all():
            return self._insufficient("Required feature summaries could not be calculated safely.")
        probability = float(self.pipeline.predict_proba(features.reshape(1, -1))[0, 1])
        if not math.isfinite(probability) or not 0 <= probability <= 1:
            raise MLArtifactError("Model produced an invalid probability")
        label = "IN_HOSPITAL_DEATH" if probability >= self.threshold else "SURVIVAL"
        sources = {item.source for item in window}
        source_data = sources.pop() if len(sources) == 1 else "MIXED"
        explanation = (
            f"Research model probability {probability:.1%} using 48-hour heart-rate and "
            "temperature summaries. This is an ICU research outcome, not a diagnosis or "
            "real-time clinical risk category."
        )
        prediction = MLPrediction(
            patient_id=patient_id,
            model_identifier=MODEL_IDENTIFIER,
            model_version=MODEL_VERSION,
            assessment_method=ASSESSMENT_METHOD,
            predicted_label=label,
            probability=probability,
            decision_threshold=self.threshold,
            window_started_at=window_started_at,
            window_ended_at=window_ended_at,
            source_data=source_data,
            feature_snapshot={
                name: float(value) for name, value in zip(FEATURE_NAMES, features, strict=True)
            },
            explanation=explanation,
        )
        db.add(prediction)
        db.flush()
        return MLInferenceResult(True, explanation, self.metadata, prediction)

    def _insufficient(self, reason: str) -> MLInferenceResult:
        return MLInferenceResult(
            False,
            f"ML inference unavailable: {reason} The rule-based assessment remains separate.",
            self.metadata,
        )

    @staticmethod
    def _observations(sessions: list[MeasurementSession]) -> list[Observation]:
        result: list[Observation] = []
        units = {VitalType.HEART_RATE: {"bpm", "beats/min"}, VitalType.TEMPERATURE: {"°C", "C"}}
        names = {VitalType.HEART_RATE: "HR", VitalType.TEMPERATURE: "Temp"}
        for session in sessions:
            for measurement in session.measurements:
                if (
                    measurement.vital_type in names
                    and measurement.quality_status != QualityStatus.INVALID
                    and measurement.unit in units[measurement.vital_type]
                    and math.isfinite(measurement.value)
                ):
                    result.append(
                        Observation(
                            utc(session.recorded_at),
                            names[measurement.vital_type],
                            measurement.value,
                        )
                    )
        return result

    @staticmethod
    def _summarize(observations: list[Observation], started_at: datetime) -> np.ndarray:
        result: list[float] = []
        for parameter in ("HR", "Temp"):
            values = sorted(
                (item for item in observations if item.parameter == parameter),
                key=lambda item: item.recorded_at,
            )
            numeric = np.asarray([item.value for item in values], dtype=float)
            minutes = np.asarray(
                [(item.recorded_at - started_at).total_seconds() / 60 for item in values],
                dtype=float,
            )
            slope = 0.0
            if len(values) > 1 and np.ptp(minutes) > 0:
                slope = float(np.polyfit(minutes, numeric, 1)[0] * 60)
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


@lru_cache
def get_ml_risk_service() -> MLRiskAssessmentService:
    return MLRiskAssessmentService()
