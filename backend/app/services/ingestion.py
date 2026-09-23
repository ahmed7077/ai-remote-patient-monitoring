from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Alert,
    Device,
    DeviceStatus,
    MeasurementSession,
    RiskAssessment,
    RiskLevel,
    VitalMeasurement,
)
from app.schemas import IngestionRequest
from app.services.quality import DataQualityService
from app.services.risk import PrototypeRuleBasedRiskAssessmentService


class VitalIngestionService:
    def __init__(self) -> None:
        self.quality = DataQualityService()
        self.risk = PrototypeRuleBasedRiskAssessmentService()

    def ingest(self, db: Session, payload: IngestionRequest) -> MeasurementSession:
        device = db.scalar(select(Device).where(Device.device_uid == payload.device_uid))
        if device is None:
            raise HTTPException(status_code=404, detail="Registered device not found")
        if payload.source != "SIMULATED" or device.device_type.value != "SIMULATOR":
            raise HTTPException(
                status_code=422, detail="Phase 1 accepts only explicitly simulated data"
            )
        if self.quality.stale(payload.recorded_at):
            raise HTTPException(status_code=422, detail="Measurement timestamp is stale")
        session = MeasurementSession(
            patient_id=device.patient_id,
            device_id=device.id,
            recorded_at=payload.recorded_at,
            source="SIMULATED",
        )
        values = {}
        for item in payload.measurements:
            quality = self.quality.assess(item.type, item.value, item.unit)
            values[item.type] = (item.value, quality)
            session.measurements.append(
                VitalMeasurement(
                    vital_type=item.type, value=item.value, unit=item.unit, quality_status=quality
                )
            )
        device.last_seen_at = datetime.now(UTC)
        device.status = DeviceStatus.ONLINE
        db.add(session)
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="Duplicate measurement session") from exc
        result = self.risk.assess(values)
        assessment = RiskAssessment(
            patient_id=device.patient_id,
            session_id=session.id,
            risk_level=result.level,
            assessment_method=self.risk.method,
            explanation=result.explanation,
        )
        db.add(assessment)
        if result.level != RiskLevel.NORMAL:
            db.add(
                Alert(
                    patient_id=device.patient_id,
                    session_id=session.id,
                    severity=result.level,
                    message=result.explanation,
                )
            )
        db.commit()
        db.refresh(session)
        return session
