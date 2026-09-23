import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Patient, ProfessionalPatientAssignment, Role, User


def can_access_patient(db: Session, user: User, patient_id: uuid.UUID) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if user.role == Role.PATIENT and patient.linked_user_id == user.id:
        return patient
    if user.role == Role.HEALTHCARE_PROFESSIONAL:
        assignment = db.scalar(
            select(ProfessionalPatientAssignment).where(
                ProfessionalPatientAssignment.professional_user_id == user.id,
                ProfessionalPatientAssignment.patient_id == patient_id,
            )
        )
        if assignment:
            return patient
    raise HTTPException(status_code=403, detail="You are not assigned to this patient")
