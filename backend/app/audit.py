import uuid

from sqlalchemy.orm import Session

from app.models import AuditEvent


def record_audit(
    db: Session,
    action: str,
    resource_type: str,
    user_id: uuid.UUID | None = None,
    resource_id: str | None = None,
    metadata: dict[str, str] | None = None,
) -> None:
    db.add(
        AuditEvent(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            event_metadata=metadata,
        )
    )
