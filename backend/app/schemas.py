import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import DeviceStatus, DeviceType, QualityStatus, RiskLevel, Role, VitalType


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


class MeasurementInput(BaseModel):
    type: VitalType
    value: float
    unit: str = Field(min_length=1, max_length=20)


class IngestionRequest(BaseModel):
    device_uid: str
    recorded_at: datetime
    source: str = "SIMULATED"
    measurements: list[MeasurementInput] = Field(min_length=1, max_length=10)


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
