from datetime import UTC, datetime, timedelta

from app.models import QualityStatus, VitalType

EXPECTED_UNITS = {
    VitalType.HEART_RATE: "bpm",
    VitalType.SPO2: "%",
    VitalType.SYSTOLIC_BP: "mmHg",
    VitalType.DIASTOLIC_BP: "mmHg",
    VitalType.TEMPERATURE: "°C",
}
STRUCTURAL_RANGES = {
    VitalType.HEART_RATE: (20, 260),
    VitalType.SPO2: (40, 100),
    VitalType.SYSTOLIC_BP: (40, 300),
    VitalType.DIASTOLIC_BP: (20, 200),
    VitalType.TEMPERATURE: (25, 45),
}
SUSPECT_RANGES = {
    VitalType.HEART_RATE: (35, 220),
    VitalType.SPO2: (70, 100),
    VitalType.SYSTOLIC_BP: (70, 250),
    VitalType.DIASTOLIC_BP: (40, 150),
    VitalType.TEMPERATURE: (32, 43),
}


class DataQualityService:
    """Technical plausibility checks; these are not clinical validation."""

    def assess(self, vital_type: VitalType, value: float, unit: str) -> QualityStatus:
        if unit != EXPECTED_UNITS[vital_type]:
            return QualityStatus.INVALID
        lower, upper = STRUCTURAL_RANGES[vital_type]
        if not lower <= value <= upper:
            return QualityStatus.INVALID
        suspect_lower, suspect_upper = SUSPECT_RANGES[vital_type]
        if not suspect_lower <= value <= suspect_upper:
            return QualityStatus.SUSPECT
        return QualityStatus.VALID

    def stale(self, recorded_at: datetime) -> bool:
        timestamp = recorded_at if recorded_at.tzinfo else recorded_at.replace(tzinfo=UTC)
        return timestamp < datetime.now(UTC) - timedelta(hours=24)
