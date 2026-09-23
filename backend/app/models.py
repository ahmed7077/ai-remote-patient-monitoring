import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now() -> datetime:
    return datetime.now(UTC)


class Role(StrEnum):
    PATIENT = "PATIENT"
    HEALTHCARE_PROFESSIONAL = "HEALTHCARE_PROFESSIONAL"


class DeviceType(StrEnum):
    SIMULATOR = "SIMULATOR"
    ESP32 = "ESP32"


class DeviceStatus(StrEnum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    STALE = "STALE"


class VitalType(StrEnum):
    HEART_RATE = "HEART_RATE"
    SPO2 = "SPO2"
    SYSTOLIC_BP = "SYSTOLIC_BP"
    DIASTOLIC_BP = "DIASTOLIC_BP"
    TEMPERATURE = "TEMPERATURE"


class QualityStatus(StrEnum):
    VALID = "VALID"
    SUSPECT = "SUSPECT"
    INVALID = "INVALID"


class RiskLevel(StrEnum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    HIGH_RISK = "HIGH_RISK"


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    linked_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), unique=True)
    patient_code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    devices: Mapped[list["Device"]] = relationship(back_populates="patient")


class ProfessionalPatientAssignment(Base):
    __tablename__ = "professional_patient_assignments"
    professional_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    device_uid: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), index=True)
    device_type: Mapped[DeviceType] = mapped_column(Enum(DeviceType), default=DeviceType.SIMULATOR)
    status: Mapped[DeviceStatus] = mapped_column(Enum(DeviceStatus), default=DeviceStatus.OFFLINE)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    firmware_version: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    patient: Mapped[Patient] = relationship(back_populates="devices")


class MeasurementSession(Base):
    __tablename__ = "measurement_sessions"
    __table_args__ = (UniqueConstraint("device_id", "recorded_at", name="uq_device_recorded"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), index=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("devices.id"), index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    source: Mapped[str] = mapped_column(String(30), default="SIMULATED")
    measurements: Mapped[list["VitalMeasurement"]] = relationship(cascade="all, delete-orphan")


class VitalMeasurement(Base):
    __tablename__ = "vital_measurements"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("measurement_sessions.id"), index=True)
    vital_type: Mapped[VitalType] = mapped_column(Enum(VitalType))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(20))
    quality_status: Mapped[QualityStatus] = mapped_column(Enum(QualityStatus))


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("measurement_sessions.id"), unique=True
    )
    risk_level: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel))
    assessment_method: Mapped[str] = mapped_column(String(50))
    explanation: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("measurement_sessions.id"))
    severity: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel))
    message: Mapped[str] = mapped_column(String(500))
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    resource_type: Mapped[str] = mapped_column(String(60))
    resource_id: Mapped[str | None] = mapped_column(String(80))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    event_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
