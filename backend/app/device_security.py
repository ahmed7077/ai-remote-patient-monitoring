import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Device, DeviceCredential, DeviceType, MeasurementSource


def credential_hash(raw_credential: str) -> str:
    """Hash a high-entropy device credential before database storage."""
    return hashlib.sha256(raw_credential.encode()).hexdigest()


def issue_device_credential(db: Session, device_id: uuid.UUID) -> str:
    raw = f"pbd_{secrets.token_urlsafe(48)}"
    db.add(
        DeviceCredential(
            device_id=device_id,
            token_hash=credential_hash(raw),
            token_prefix=raw[:12],
        )
    )
    return raw


def revoke_device_credentials(db: Session, device_id: uuid.UUID) -> int:
    active = list(
        db.scalars(
            select(DeviceCredential).where(
                DeviceCredential.device_id == device_id,
                DeviceCredential.revoked_at.is_(None),
            )
        )
    )
    revoked_at = datetime.now(UTC)
    for credential in active:
        credential.revoked_at = revoked_at
    return len(active)


def authenticate_ingestion_device(
    db: Session,
    device_uid: str,
    device_credential: str | None,
    development_key: str | None,
) -> tuple[Device, MeasurementSource]:
    """Authenticate a device and derive provenance without trusting payload source."""
    error = HTTPException(status_code=401, detail="Invalid device credentials")
    if device_credential:
        stored = db.scalar(
            select(DeviceCredential).where(
                DeviceCredential.token_hash == credential_hash(device_credential),
                DeviceCredential.revoked_at.is_(None),
            )
        )
        if stored is None:
            raise error
        device = db.get(Device, stored.device_id)
        if (
            device is None
            or device.device_type != DeviceType.ESP32
            or not secrets.compare_digest(device.device_uid, device_uid)
        ):
            raise error
        stored.last_used_at = datetime.now(UTC)
        return device, MeasurementSource.PHYSICAL_DEVICE

    expected_key = get_settings().device_ingestion_key
    if not development_key or not secrets.compare_digest(development_key, expected_key):
        raise error
    device = db.scalar(select(Device).where(Device.device_uid == device_uid))
    if device is None or device.device_type != DeviceType.SIMULATOR:
        raise error
    return device, MeasurementSource.SIMULATED
