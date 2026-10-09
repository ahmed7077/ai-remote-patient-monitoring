import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient


def professional_headers(client: TestClient, email: str = "hardware@example.com") -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Hardware Professional",
            "email": email,
            "password": "a-secure-test-password",
            "role": "HEALTHCARE_PROFESSIONAL",
        },
    )
    token = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "a-secure-test-password"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def provision(
    client: TestClient,
    headers: dict[str, str],
    suffix: str = "001",
) -> tuple[str, dict[str, object]]:
    patient_id = client.post(
        "/api/v1/patients",
        headers=headers,
        json={"patient_code": f"HW-{suffix}", "display_name": f"Hardware Patient {suffix}"},
    ).json()["id"]
    device = client.post(
        "/api/v1/devices",
        headers=headers,
        json={
            "device_uid": f"ESP32-{suffix}",
            "patient_id": patient_id,
            "device_type": "ESP32",
            "firmware_version": "0.1.0",
        },
    ).json()
    return patient_id, device


def payload(device_uid: str, session_id: str | None = None) -> dict[str, object]:
    return {
        "device_uid": device_uid,
        "recorded_at": datetime.now(UTC).isoformat(),
        # Provenance is intentionally misleading here; the server must derive it.
        "source": "SIMULATED",
        "device_session_id": session_id or f"session-{uuid.uuid4()}",
        "acquisition_duration_seconds": 60,
        "algorithm_version": "ppg-resp-0.1.0",
        "signal_quality": {"ppg_score": 0.91, "finger_detected": True},
        "measurement_availability": {
            "HEART_RATE": True,
            "SPO2": True,
            "TEMPERATURE": True,
            "RESPIRATORY_RATE": True,
        },
        "measurements": [
            {"type": "HEART_RATE", "value": 74, "unit": "bpm"},
            {"type": "SPO2", "value": 97, "unit": "%"},
            {"type": "TEMPERATURE", "value": 35.8, "unit": "°C"},
            {"type": "RESPIRATORY_RATE", "value": 15, "unit": "breaths/min"},
        ],
    }


def test_physical_ingestion_derives_source_and_persists_metadata(client: TestClient) -> None:
    headers = professional_headers(client)
    patient_id, device = provision(client, headers)

    response = client.post(
        "/api/v1/ingestion/vitals",
        headers={"X-Device-Credential": str(device["device_credential"])},
        json=payload(str(device["device_uid"])),
    )

    assert response.status_code == 201
    session = response.json()
    assert session["source"] == "PHYSICAL_DEVICE"
    assert session["acquisition_duration_seconds"] == 60
    assert session["algorithm_version"] == "ppg-resp-0.1.0"
    assert session["signal_quality"]["finger_detected"] is True
    assert {item["vital_type"] for item in session["measurements"]} == {
        "HEART_RATE",
        "SPO2",
        "TEMPERATURE",
        "RESPIRATORY_RATE",
    }
    listed = client.get(f"/api/v1/patients/{patient_id}/sessions", headers=headers).json()
    assert listed[0]["source"] == "PHYSICAL_DEVICE"


def test_physical_device_impersonation_and_revoked_credentials_are_rejected(
    client: TestClient,
) -> None:
    headers = professional_headers(client, "hardware-security@example.com")
    _, first = provision(client, headers, "101")
    _, second = provision(client, headers, "102")
    credential_headers = {"X-Device-Credential": str(first["device_credential"])}

    impersonation = client.post(
        "/api/v1/ingestion/vitals",
        headers=credential_headers,
        json=payload(str(second["device_uid"])),
    )
    assert impersonation.status_code == 401

    client.post(f"/api/v1/devices/{first['id']}/credentials/revoke", headers=headers)
    revoked = client.post(
        "/api/v1/ingestion/vitals",
        headers=credential_headers,
        json=payload(str(first["device_uid"])),
    )
    assert revoked.status_code == 401


def test_physical_sessions_allow_missing_estimates_and_reject_duplicates(
    client: TestClient,
) -> None:
    headers = professional_headers(client, "hardware-partial@example.com")
    patient_id, device = provision(client, headers, "201")
    body = payload(str(device["device_uid"]), "stable-device-session-201")
    body["measurements"] = list(body["measurements"])[:-1]
    body["measurement_availability"] = {
        "HEART_RATE": True,
        "SPO2": True,
        "TEMPERATURE": True,
        "RESPIRATORY_RATE": False,
    }
    credential_headers = {"X-Device-Credential": str(device["device_credential"])}

    first = client.post("/api/v1/ingestion/vitals", headers=credential_headers, json=body)
    assert first.status_code == 201
    assert first.json()["measurement_availability"]["RESPIRATORY_RATE"] is False
    assert all(item["vital_type"] != "RESPIRATORY_RATE" for item in first.json()["measurements"])

    body["recorded_at"] = (datetime.now(UTC) + timedelta(seconds=1)).isoformat()
    duplicate = client.post("/api/v1/ingestion/vitals", headers=credential_headers, json=body)
    assert duplicate.status_code == 409
    sessions = client.get(f"/api/v1/patients/{patient_id}/sessions", headers=headers).json()
    assert len(sessions) == 1


def test_physical_device_rejects_bp_and_sensor_errors_do_not_create_alerts(
    client: TestClient,
) -> None:
    headers = professional_headers(client, "hardware-quality@example.com")
    patient_id, device = provision(client, headers, "301")
    credential_headers = {"X-Device-Credential": str(device["device_credential"])}
    bp = payload(str(device["device_uid"]))
    bp["measurements"] = [{"type": "SYSTOLIC_BP", "value": 120, "unit": "mmHg"}]
    assert (
        client.post("/api/v1/ingestion/vitals", headers=credential_headers, json=bp).status_code
        == 422
    )

    invalid = payload(str(device["device_uid"]), "invalid-signal-session")
    invalid["measurements"] = [
        {"type": "HEART_RATE", "value": 0, "unit": "bpm"},
        {"type": "SPO2", "value": 0, "unit": "%"},
    ]
    invalid["measurement_availability"] = {
        "HEART_RATE": True,
        "SPO2": True,
        "TEMPERATURE": False,
        "RESPIRATORY_RATE": False,
    }
    result = client.post("/api/v1/ingestion/vitals", headers=credential_headers, json=invalid)
    assert result.status_code == 201
    assert all(item["quality_status"] == "INVALID" for item in result.json()["measurements"])
    assert client.get(f"/api/v1/patients/{patient_id}/alerts", headers=headers).json() == []
