import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import (
    DeviceStatus,
    DeviceType,
    MeasurementSource,
    QualityStatus,
    RiskLevel,
    Role,
    VitalType,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: Role


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(ORMModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: Role
    is_active: bool


class PatientCreate(BaseModel):
    patient_code: str = Field(pattern=r"^[A-Z0-9-]{3,40}$")
    display_name: str = Field(min_length=2, max_length=120)
    linked_user_id: uuid.UUID | None = None
    linked_user_email: EmailStr | None = None

    @model_validator(mode="after")
    def single_link_identifier(self) -> "PatientCreate":
        if self.linked_user_id is not None and self.linked_user_email is not None:
            raise ValueError("Provide either linked_user_id or linked_user_email, not both")
        return self


class PatientResponse(ORMModel):
    id: uuid.UUID
    patient_code: str
    display_name: str
    linked_user_id: uuid.UUID | None
    created_at: datetime


class AssignmentRequest(BaseModel):
    professional_user_id: uuid.UUID


class DeviceCreate(BaseModel):
    device_uid: str = Field(min_length=3, max_length=80)
    patient_id: uuid.UUID
    device_type: DeviceType = DeviceType.SIMULATOR
    firmware_version: str | None = Field(default=None, max_length=40)


class DeviceResponse(ORMModel):
    id: uuid.UUID
    device_uid: str
    patient_id: uuid.UUID
    device_type: DeviceType
    status: DeviceStatus
    last_seen_at: datetime | None
    firmware_version: str | None


class DeviceRegistrationResponse(DeviceResponse):
    device_credential: str | None = None


class DeviceCredentialResponse(BaseModel):
    device_id: uuid.UUID
    device_credential: str


class MeasurementInput(BaseModel):
    type: VitalType
    value: float
    unit: str = Field(min_length=1, max_length=20)


class IngestionRequest(BaseModel):
    device_uid: str
    recorded_at: datetime
    source: MeasurementSource = MeasurementSource.SIMULATED
    device_session_id: str | None = Field(default=None, min_length=8, max_length=80)
    acquisition_duration_seconds: float | None = Field(default=None, ge=0, le=600)
    algorithm_version: str | None = Field(default=None, max_length=40)
    signal_quality: dict[str, float | str | bool] | None = None
    measurement_availability: dict[str, bool] | None = None
    device_error_code: str | None = Field(default=None, max_length=80)
    measurements: list[MeasurementInput] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def unique_measurement_types(self) -> "IngestionRequest":
        types = [measurement.type for measurement in self.measurements]
        if len(types) != len(set(types)):
            raise ValueError("A session cannot contain duplicate measurement types")
        return self


class DemoScenario(StrEnum):
    NORMAL = "normal"
    WARNING = "warning"
    HIGH_RISK = "high-risk"


class DemoSimulationRequest(BaseModel):
    scenario: DemoScenario


class VitalResponse(ORMModel):
    vital_type: VitalType
    value: float
    unit: str
    quality_status: QualityStatus


class SessionResponse(ORMModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    device_id: uuid.UUID
    recorded_at: datetime
    received_at: datetime
    source: str
    device_session_id: str | None
    acquisition_duration_seconds: float | None
    algorithm_version: str | None
    signal_quality: dict[str, float | str | bool] | None
    measurement_availability: dict[str, bool] | None
    device_error_code: str | None
    measurements: list[VitalResponse]


class RiskResponse(ORMModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    session_id: uuid.UUID
    risk_level: RiskLevel
    assessment_method: str
    explanation: str
    created_at: datetime


class AlertResponse(ORMModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    session_id: uuid.UUID
    severity: RiskLevel
    message: str
    acknowledged: bool
    acknowledged_by: uuid.UUID | None
    acknowledged_at: datetime | None
    created_at: datetime
