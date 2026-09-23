from datetime import UTC, datetime

from fastapi.testclient import TestClient


def auth(client: TestClient, role: str, email: str) -> tuple[dict[str, str], dict[str, str]]:
    user = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Synthetic User",
            "email": email,
            "password": "a-secure-test-password",
            "role": role,
        },
    ).json()
    token = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "a-secure-test-password"}
    ).json()["access_token"]
    return user, {"Authorization": f"Bearer {token}"}


def test_authorized_monitoring_pipeline_and_alert_acknowledgement(client: TestClient) -> None:
    _, doctor_headers = auth(client, "HEALTHCARE_PROFESSIONAL", "doctor@example.com")
    patient_user, patient_headers = auth(client, "PATIENT", "patient@example.com")
    patient_response = client.post(
        "/api/v1/patients",
        headers=doctor_headers,
        json={
            "patient_code": "SYN-001",
            "display_name": "Synthetic Patient",
            "linked_user_id": patient_user["id"],
        },
    )
    assert patient_response.status_code == 201
    patient_id = patient_response.json()["id"]
    device_response = client.post(
        "/api/v1/devices",
        headers=doctor_headers,
        json={"device_uid": "SIM-DEMO-001", "patient_id": patient_id, "device_type": "SIMULATOR"},
    )
    assert device_response.status_code == 201
    payload = {
        "device_uid": "SIM-DEMO-001",
        "recorded_at": datetime.now(UTC).isoformat(),
        "source": "SIMULATED",
        "measurements": [
            {"type": "HEART_RATE", "value": 145, "unit": "bpm"},
            {"type": "SPO2", "value": 87, "unit": "%"},
            {"type": "SYSTOLIC_BP", "value": 165, "unit": "mmHg"},
            {"type": "DIASTOLIC_BP", "value": 95, "unit": "mmHg"},
            {"type": "TEMPERATURE", "value": 39.0, "unit": "°C"},
        ],
    }
    assert client.post("/api/v1/ingestion/vitals", json=payload).status_code == 422
    ingestion = client.post(
        "/api/v1/ingestion/vitals",
        headers={"X-Device-Key": "development-device-ingestion-key"},
        json=payload,
    )
    assert ingestion.status_code == 201
    sessions = client.get(f"/api/v1/patients/{patient_id}/sessions", headers=patient_headers)
    assert sessions.status_code == 200
    assert sessions.json()[0]["source"] == "SIMULATED"
    risks = client.get(f"/api/v1/patients/{patient_id}/risks", headers=doctor_headers).json()
    assert risks[0]["risk_level"] == "HIGH_RISK"
    alerts = client.get(f"/api/v1/patients/{patient_id}/alerts", headers=doctor_headers).json()
    acknowledged = client.post(
        f"/api/v1/alerts/{alerts[0]['id']}/acknowledge", headers=doctor_headers
    )
    assert acknowledged.status_code == 200
    assert acknowledged.json()["acknowledged"] is True


def test_unassigned_professional_cannot_access_patient(client: TestClient) -> None:
    _, owner_headers = auth(client, "HEALTHCARE_PROFESSIONAL", "owner@example.com")
    _, outsider_headers = auth(client, "HEALTHCARE_PROFESSIONAL", "outsider@example.com")
    patient_id = client.post(
        "/api/v1/patients",
        headers=owner_headers,
        json={"patient_code": "SYN-002", "display_name": "Scoped Patient"},
    ).json()["id"]
    assert (
        client.get(f"/api/v1/patients/{patient_id}/sessions", headers=outsider_headers).status_code
        == 403
    )
