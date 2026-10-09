from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.models import (
    Alert,
    Device,
    DeviceStatus,
    MeasurementSession,
    MeasurementSource,
    RiskAssessment,
    RiskLevel,
    VitalMeasurement,
    VitalType,
)
from app.schemas import IngestionRequest
from app.services.quality import DataQualityService
from app.services.risk import PrototypeRuleBasedRiskAssessmentService


class VitalIngestionService:
    def __init__(self) -> None:
        self.quality = DataQualityService()
        self.risk = PrototypeRuleBasedRiskAssessmentService()

    def ingest(
        self,
        db: Session,
        payload: IngestionRequest,
        device: Device,
        source: MeasurementSource,
    ) -> MeasurementSession:
        if source == MeasurementSource.PHYSICAL_DEVICE:
            legacy_types = {VitalType.SYSTOLIC_BP, VitalType.DIASTOLIC_BP}
            if any(item.type in legacy_types for item in payload.measurements):
                raise HTTPException(
                    status_code=422,
                    detail="Blood pressure is not supported by the Phase 2 physical device",
                )
        if self.quality.stale(payload.recorded_at):
            raise HTTPException(status_code=422, detail="Measurement timestamp is stale")
        provided = {item.type.value for item in payload.measurements}
        availability = payload.measurement_availability or {
            vital.value: vital.value in provided
            for vital in (
                VitalType.HEART_RATE,
                VitalType.SPO2,
                VitalType.TEMPERATURE,
                VitalType.RESPIRATORY_RATE,
            )
        }
        if any(availability.get(item.type.value) is False for item in payload.measurements):
            raise HTTPException(
                status_code=422,
                detail="Measurement availability contradicts the submitted readings",
            )
        session = MeasurementSession(
            patient_id=device.patient_id,
            device_id=device.id,
            recorded_at=payload.recorded_at,
            source=source.value,
            device_session_id=payload.device_session_id,
            acquisition_duration_seconds=payload.acquisition_duration_seconds,
            algorithm_version=payload.algorithm_version,
            signal_quality=payload.signal_quality,
            measurement_availability=availability,
            device_error_code=payload.device_error_code,
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
        if result.actionable and result.level != RiskLevel.NORMAL:
            db.add(
                Alert(
                    patient_id=device.patient_id,
                    session_id=session.id,
                    severity=result.level,
                    message=result.explanation,
                )
            )
        record_audit(
            db,
            "INGEST_VITALS",
            "DEVICE",
            resource_id=str(device.id),
            metadata={"source": source.value},
        )
        db.commit()
        db.refresh(session)
        return session
