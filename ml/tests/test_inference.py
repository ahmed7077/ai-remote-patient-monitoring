from pathlib import Path

import numpy as np
import pytest

from pulsebridge_ml.features import FEATURE_NAMES
from pulsebridge_ml.inference import ArtifactError, TrustedModel

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "artifacts" / "icu-mortality-hr-temp-v1.joblib"
METADATA = ROOT / "artifacts" / "icu-mortality-hr-temp-v1.metadata.json"


def test_versioned_artifact_loads_and_predicts() -> None:
    model = TrustedModel(ARTIFACT, METADATA)
    values = np.asarray(
        [60.0, 100.0, 78.0, 8.0, 75.0, 0.0, 48.0, 35.5, 38.0, 36.8, 0.4, 37.0, 0.0, 24.0]
    )

    prediction = model.predict(values)

    assert prediction.label in {"SURVIVAL", "IN_HOSPITAL_DEATH"}
    assert 0.0 <= prediction.probability <= 1.0
    assert prediction.model_version == "icu-mortality-hr-temp-v1"


def test_inference_rejects_wrong_feature_order_length() -> None:
    model = TrustedModel(ARTIFACT, METADATA)

    with pytest.raises(ValueError, match=f"Expected {len(FEATURE_NAMES)}"):
        model.predict(np.zeros(len(FEATURE_NAMES) - 1))


def test_inference_rejects_infinite_values() -> None:
    model = TrustedModel(ARTIFACT, METADATA)
    values = np.zeros(len(FEATURE_NAMES))
    values[0] = np.inf

    with pytest.raises(ValueError, match="infinite"):
        model.predict(values)


def test_checksum_mismatch_is_rejected(tmp_path: Path) -> None:
    metadata = tmp_path / "metadata.json"
    metadata.write_text(METADATA.read_text(encoding="utf-8"), encoding="utf-8")
    artifact = tmp_path / "model.joblib"
    artifact.write_bytes(ARTIFACT.read_bytes() + b"tampered")

    with pytest.raises(ArtifactError, match="checksum"):
        TrustedModel(artifact, metadata)
