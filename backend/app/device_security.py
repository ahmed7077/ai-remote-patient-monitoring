import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DeviceCredential


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
