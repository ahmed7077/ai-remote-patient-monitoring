from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.device_security import credential_hash
from app.models import DeviceCredential, VitalType
from app.schemas import IngestionRequest


def auth(client: TestClient, email: str) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Device Test Professional",
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


def test_respiratory_rate_is_available_in_ingestion_schema() -> None:
    schema = IngestionRequest.model_json_schema()

    assert VitalType.RESPIRATORY_RATE.value in str(schema)


def test_esp32_registration_returns_one_time_hashed_credential(
    client: TestClient, db: Session
) -> None:
    headers = auth(client, "device-owner@example.com")
    patient_id = client.post(
        "/api/v1/patients",
        headers=headers,
        json={"patient_code": "DEVICE-001", "display_name": "Device Patient"},
    ).json()["id"]

    registered = client.post(
        "/api/v1/devices",
        headers=headers,
        json={"device_uid": "ESP32-UNIT-001", "patient_id": patient_id, "device_type": "ESP32"},
    )

    assert registered.status_code == 201
    raw = registered.json()["device_credential"]
    assert raw.startswith("pbd_")
    stored = db.scalar(select(DeviceCredential))
    assert stored is not None
    assert stored.token_hash == credential_hash(raw)
    assert raw not in stored.token_hash
    listed = client.get(f"/api/v1/patients/{patient_id}/devices", headers=headers).json()
    assert "device_credential" not in listed[0]


def test_device_credential_rotation_and_revocation(client: TestClient, db: Session) -> None:
    headers = auth(client, "credential-owner@example.com")
    patient_id = client.post(
        "/api/v1/patients",
        headers=headers,
        json={"patient_code": "DEVICE-002", "display_name": "Credential Patient"},
    ).json()["id"]
    registered = client.post(
        "/api/v1/devices",
        headers=headers,
        json={"device_uid": "ESP32-UNIT-002", "patient_id": patient_id, "device_type": "ESP32"},
    ).json()

    rotated = client.post(f"/api/v1/devices/{registered['id']}/credentials/rotate", headers=headers)
    assert rotated.status_code == 200
    assert rotated.json()["device_credential"] != registered["device_credential"]
    credentials = list(db.scalars(select(DeviceCredential).order_by(DeviceCredential.created_at)))
    assert len(credentials) == 2
    assert credentials[0].revoked_at is not None
    assert credentials[1].revoked_at is None

    revoked = client.post(f"/api/v1/devices/{registered['id']}/credentials/revoke", headers=headers)
    assert revoked.status_code == 204
    db.expire_all()
    assert all(item.revoked_at is not None for item in db.scalars(select(DeviceCredential)))
