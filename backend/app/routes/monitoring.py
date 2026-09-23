import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.access import can_access_patient
from app.audit import record_audit
from app.config import get_settings
from app.database import get_db
from app.models import (
    Alert,
    Device,
    MeasurementSession,
    Patient,
    ProfessionalPatientAssignment,
    RiskAssessment,
    Role,
    User,
)
from app.schemas import (
    AlertResponse,
    AssignmentRequest,
    DeviceCreate,
    DeviceResponse,
    IngestionRequest,
    PatientCreate,
    PatientResponse,
    RiskResponse,
    SessionResponse,
)
from app.security import current_user, require_role
from app.services.ingestion import VitalIngestionService

router = APIRouter(tags=["monitoring"])


@router.post("/patients", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    user: User = Depends(require_role(Role.HEALTHCARE_PROFESSIONAL)),
    db: Session = Depends(get_db),
) -> Patient:
    patient_data = payload.model_dump(exclude={"linked_user_email"})
    if payload.linked_user_email is not None:
        linked_user = db.scalar(
            select(User).where(User.email == str(payload.linked_user_email).lower())
        )
        if linked_user is None or linked_user.role != Role.PATIENT or not linked_user.is_active:
            raise HTTPException(status_code=422, detail="Active patient account not found")
        if db.scalar(select(Patient).where(Patient.linked_user_id == linked_user.id)):
            raise HTTPException(status_code=409, detail="Patient account is already linked")
        patient_data["linked_user_id"] = linked_user.id
    patient = Patient(**patient_data)
    db.add(patient)
    db.flush()
    db.add(ProfessionalPatientAssignment(professional_user_id=user.id, patient_id=patient.id))
    record_audit(db, "CREATE_PATIENT", "PATIENT", user.id, str(patient.id))
    db.commit()
    db.refresh(patient)
    return patient


@router.post("/patients/{patient_id}/assign", status_code=status.HTTP_204_NO_CONTENT)
def assign_patient(
    patient_id: uuid.UUID,
    payload: AssignmentRequest,
    user: User = Depends(require_role(Role.HEALTHCARE_PROFESSIONAL)),
    db: Session = Depends(get_db),
) -> None:
    can_access_patient(db, user, patient_id)
    professional = db.get(User, payload.professional_user_id)
    if professional is None or professional.role != Role.HEALTHCARE_PROFESSIONAL:
        raise HTTPException(status_code=422, detail="Healthcare professional not found")
    existing = db.get(ProfessionalPatientAssignment, (professional.id, patient_id))
    if existing is None:
        db.add(
            ProfessionalPatientAssignment(
                professional_user_id=professional.id, patient_id=patient_id
            )
        )
    record_audit(db, "ASSIGN_PATIENT", "PATIENT", user.id, str(patient_id))
    db.commit()


@router.get("/patients", response_model=list[PatientResponse])
def list_patients(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[Patient]:
    if user.role == Role.PATIENT:
        return list(db.scalars(select(Patient).where(Patient.linked_user_id == user.id)))
    return list(
        db.scalars(
            select(Patient)
            .join(ProfessionalPatientAssignment)
            .where(ProfessionalPatientAssignment.professional_user_id == user.id)
            .order_by(Patient.display_name)
        )
    )


@router.post("/devices", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def register_device(
    payload: DeviceCreate,
    user: User = Depends(require_role(Role.HEALTHCARE_PROFESSIONAL)),
    db: Session = Depends(get_db),
) -> Device:
    can_access_patient(db, user, payload.patient_id)
    if db.scalar(select(Device).where(Device.device_uid == payload.device_uid)):
        raise HTTPException(status_code=409, detail="Device UID already registered")
    device = Device(**payload.model_dump())
    db.add(device)
    db.flush()
    record_audit(db, "REGISTER_DEVICE", "DEVICE", user.id, str(device.id))
    db.commit()
    db.refresh(device)
    return device


@router.get("/patients/{patient_id}/devices", response_model=list[DeviceResponse])
def patient_devices(
    patient_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[Device]:
    can_access_patient(db, user, patient_id)
    return list(db.scalars(select(Device).where(Device.patient_id == patient_id)))


@router.post("/ingestion/vitals", response_model=SessionResponse, status_code=201)
def ingest_vitals(
    payload: IngestionRequest,
    x_device_key: str = Header(),
    db: Session = Depends(get_db),
) -> MeasurementSession:
    if not secrets.compare_digest(x_device_key, get_settings().device_ingestion_key):
        raise HTTPException(status_code=401, detail="Invalid device ingestion key")
    return VitalIngestionService().ingest(db, payload)


@router.get("/patients/{patient_id}/sessions", response_model=list[SessionResponse])
def sessions(
    patient_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[MeasurementSession]:
    can_access_patient(db, user, patient_id)
    record_audit(db, "VIEW_VITALS", "PATIENT", user.id, str(patient_id))
    result = list(
        db.scalars(
            select(MeasurementSession)
            .options(selectinload(MeasurementSession.measurements))
            .where(MeasurementSession.patient_id == patient_id)
            .order_by(MeasurementSession.recorded_at.desc())
            .limit(200)
        )
    )
    db.commit()
    return result


@router.get("/patients/{patient_id}/risks", response_model=list[RiskResponse])
def risks(
    patient_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[RiskAssessment]:
    can_access_patient(db, user, patient_id)
    return list(
        db.scalars(
            select(RiskAssessment)
            .where(RiskAssessment.patient_id == patient_id)
            .order_by(RiskAssessment.created_at.desc())
            .limit(100)
        )
    )


@router.get("/patients/{patient_id}/alerts", response_model=list[AlertResponse])
def alerts(
    patient_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[Alert]:
    can_access_patient(db, user, patient_id)
    return list(
        db.scalars(
            select(Alert).where(Alert.patient_id == patient_id).order_by(Alert.created_at.desc())
        )
    )


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(
    alert_id: uuid.UUID,
    user: User = Depends(require_role(Role.HEALTHCARE_PROFESSIONAL)),
    db: Session = Depends(get_db),
) -> Alert:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    can_access_patient(db, user, alert.patient_id)
    alert.acknowledged = True
    alert.acknowledged_by = user.id
    alert.acknowledged_at = datetime.now(UTC)
    record_audit(db, "ACKNOWLEDGE_ALERT", "ALERT", user.id, str(alert.id))
    db.commit()
    db.refresh(alert)
    return alert
