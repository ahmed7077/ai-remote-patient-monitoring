from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Device,
    DeviceType,
    MeasurementSession,
    MLPrediction,
    Patient,
    ProfessionalPatientAssignment,
    QualityStatus,
    Role,
    User,
    VitalMeasurement,
    VitalType,
)
from app.security import hash_password
from app.services.ml_risk import FEATURE_NAMES, MLRiskAssessmentService


def create_user(db: Session, email: str, role: Role) -> User:
    user = User(
        full_name=email.split("@")[0],
        email=email,
        password_hash=hash_password("a-secure-test-password"),
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def login(client: TestClient, email: str) -> dict[str, str]:
    token = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "a-secure-test-password"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def setup_patient(db: Session) -> tuple[Patient, User, User]:
    professional = create_user(db, "ml-doctor@example.com", Role.HEALTHCARE_PROFESSIONAL)
    patient_user = create_user(db, "ml-patient@example.com", Role.PATIENT)
    patient = Patient(
        patient_code="ML-001", display_name="ML Research Patient", linked_user_id=patient_user.id
    )
    db.add(patient)
    db.flush()
    db.add(
        ProfessionalPatientAssignment(professional_user_id=professional.id, patient_id=patient.id)
    )
    db.commit()
    return patient, professional, patient_user


def add_history(db: Session, patient: Patient) -> None:
    device = patient.devices[0] if patient.devices else None
    if device is None:
        device = Device(
            device_uid="ML-SIM-001", patient_id=patient.id, device_type=DeviceType.SIMULATOR
        )
        db.add(device)
        db.flush()
    end = datetime.now(UTC)
    for index, hours_ago in enumerate((48, 36, 24, 12, 0)):
        session = MeasurementSession(
            patient_id=patient.id,
            device_id=device.id,
            recorded_at=end - timedelta(hours=hours_ago),
            source="SIMULATED",
            device_session_id=f"ml-history-{index}",
        )
        session.measurements.extend(
            [
                VitalMeasurement(
                    vital_type=VitalType.HEART_RATE,
                    value=72 + index * 2,
                    unit="bpm",
                    quality_status=QualityStatus.VALID,
                ),
                VitalMeasurement(
                    vital_type=VitalType.TEMPERATURE,
                    value=36.5 + index * 0.1,
                    unit="°C",
                    quality_status=QualityStatus.VALID,
                ),
            ]
        )
        db.add(session)
    db.commit()


def test_model_metadata_requires_authentication_and_reports_real_metrics(
    client: TestClient, db: Session
) -> None:
    _, professional, _ = setup_patient(db)

    assert client.get("/api/v1/ml/model").status_code == 401
    response = client.get("/api/v1/ml/model", headers=login(client, professional.email))

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is True
    assert payload["model_version"] == "icu-mortality-hr-temp-v1"
    assert payload["supported_parameters"] == ["HEART_RATE", "TEMPERATURE"]
    assert payload["held_out_metrics"]["roc_auc"] > 0.5
    assert payload["model_comparison"]["random_forest"]["pr_auc"] > 0.25
    assert "Temp_mean" in payload["global_feature_importance"]


def test_insufficient_history_is_explicit_and_not_persisted(
    client: TestClient, db: Session
) -> None:
    patient, professional, _ = setup_patient(db)

    response = client.post(
        f"/api/v1/patients/{patient.id}/ml/predict",
        headers=login(client, professional.email),
    )

    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["explanation"].startswith("ML inference unavailable:")
    assert db.scalar(select(MLPrediction)) is None


def test_authenticated_prediction_is_persisted_with_separate_provenance(
    client: TestClient, db: Session
) -> None:
    patient, professional, patient_user = setup_patient(db)
    add_history(db, patient)

    response = client.post(
        f"/api/v1/patients/{patient.id}/ml/predict",
        headers=login(client, professional.email),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is True
    assert payload["assessment_method"] == "ML_CLASSIFIER_V1"
    assert payload["predicted_label"] in {"SURVIVAL", "IN_HOSPITAL_DEATH"}
    assert payload["source_data"] == "SIMULATED"
    assert payload["probability"] is not None
    assert "not a diagnosis" in payload["explanation"]
    stored = db.scalar(select(MLPrediction))
    assert stored is not None
    assert stored.model_version == "icu-mortality-hr-temp-v1"
    assert tuple(stored.feature_snapshot) == FEATURE_NAMES

    history = client.get(
        f"/api/v1/patients/{patient.id}/ml/predictions",
        headers=login(client, patient_user.email),
    )
    assert history.status_code == 200
    assert history.json()[0]["prediction_id"] == payload["prediction_id"]


def test_unassigned_professional_cannot_run_ml_inference(client: TestClient, db: Session) -> None:
    patient, _, _ = setup_patient(db)
    outsider = create_user(db, "ml-outsider@example.com", Role.HEALTHCARE_PROFESSIONAL)
    db.commit()

    response = client.post(
        f"/api/v1/patients/{patient.id}/ml/predict",
        headers=login(client, outsider.email),
    )

    assert response.status_code == 403


def test_missing_artifact_has_safe_unavailable_state() -> None:
    service = MLRiskAssessmentService(Path("missing.joblib"), Path("missing.json"))

    assert service.available is False
    assert service.unavailable_reason is not None
