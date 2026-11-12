import io
import json
from datetime import date
from urllib.request import Request
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Patient, ProfessionalPatientAssignment, Role, User
from app.routes.care import (
    EntryInput,
    ReviewInput,
    complete_follow_up,
    create_care,
    draft_summary,
    list_care,
)


def test_clinician_notes_remain_private_and_summaries_require_approval(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    clinician = User(
        full_name="Assigned clinician",
        email="assigned@example.com",
        password_hash="unused",
        role=Role.HEALTHCARE_PROFESSIONAL,
    )
    patient_user = User(
        full_name="Patient",
        email="care@example.com",
        password_hash="unused",
        role=Role.PATIENT,
    )
    db.add_all([clinician, patient_user])
    db.flush()
    patient = Patient(
        patient_code="CARE-001", display_name="Patient", linked_user_id=patient_user.id
    )
    db.add(patient)
    db.flush()
    db.add(ProfessionalPatientAssignment(professional_user_id=clinician.id, patient_id=patient.id))
    db.commit()

    create_care(patient.id, EntryInput(kind="note", body="Internal note"), db, clinician)
    with pytest.raises(HTTPException, match="approval"):
        create_care(patient.id, EntryInput(kind="summary", body="Unapproved"), db, clinician)
    assert list_care(patient.id, db, patient_user) == []

    summary = create_care(
        patient.id,
        EntryInput(
            kind="summary", body="Reviewed text", precautions="Exact wording", approved=True
        ),
        db,
        clinician,
    )
    assert list_care(patient.id, db, patient_user) == [summary]
    assert summary.precautions == "Exact wording"
    assert len(list_care(patient.id, db, clinician)) == 2

    with pytest.raises(HTTPException) as error:
        complete_follow_up(patient.id, uuid4(), db, clinician)
    assert error.value.status_code == 404

    task = create_care(
        patient.id,
        EntryInput(kind="follow_up", body="Review the next check-in", due_date=date(2026, 12, 1)),
        db,
        clinician,
    )
    assert task.completed_at is None
    assert complete_follow_up(patient.id, task.id, db, clinician).completed_at is not None
    assert list_care(patient.id, db, patient_user) == [summary]

    def hosted_response(request: Request, timeout: int) -> io.BytesIO:
        assert request.full_url.startswith("https://generativelanguage.googleapis.com/")
        assert request.get_header("Authorization") == "Bearer test-key"
        assert request.data is not None
        body = json.loads(request.data)
        assert body["messages"][1]["content"] == "Fictional review."
        assert str(patient.id) not in request.data.decode()
        return io.BytesIO(b'{"choices":[{"message":{"content":"Draft text"}}]}')

    monkeypatch.setattr(
        "app.routes.care.get_settings",
        lambda: Settings(
            care_ai_provider="gemini", care_ai_model="test-model", care_ai_api_key="test-key"
        ),
    )
    monkeypatch.setattr("app.routes.care.urlopen", hosted_response)
    assert draft_summary(patient.id, ReviewInput(review="Fictional review."), db, clinician) == {
        "draft": "Draft text"
    }
    assert list_care(patient.id, db, patient_user) == [summary]
