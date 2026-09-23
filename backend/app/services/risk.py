from dataclasses import dataclass

from app.models import QualityStatus, RiskLevel, VitalType


@dataclass
class RiskResult:
    level: RiskLevel
    explanation: str


class PrototypeRuleBasedRiskAssessmentService:
    """Demonstration thresholds only; not clinically validated or diagnostic."""

    method = "PROTOTYPE_RULE_BASED"

    def assess(self, values: dict[VitalType, tuple[float, QualityStatus]]) -> RiskResult:
        usable = {key: value for key, value in values.items() if value[1] != QualityStatus.INVALID}
        high: list[str] = []
        warning: list[str] = []
        checks = {
            VitalType.HEART_RATE: (45, 130, 55, 105),
            VitalType.SPO2: (89, 101, 94, 101),
            VitalType.SYSTOLIC_BP: (89, 180, 100, 139),
            VitalType.TEMPERATURE: (34.0, 40.0, 35.5, 38.0),
        }
        for vital, (high_low, high_upper, warn_low, warn_upper) in checks.items():
            if vital not in usable:
                continue
            value = usable[vital][0]
            if value < high_low or value > high_upper:
                high.append(vital.value.replace("_", " ").title())
            elif value < warn_low or value > warn_upper:
                warning.append(vital.value.replace("_", " ").title())
        if high:
            return RiskResult(
                RiskLevel.HIGH_RISK, f"Prototype thresholds flagged: {', '.join(high)}."
            )
        if warning:
            return RiskResult(
                RiskLevel.WARNING, f"Prototype thresholds noted: {', '.join(warning)}."
            )
        if not usable:
            return RiskResult(
                RiskLevel.WARNING, "No technically valid measurements were available."
            )
        return RiskResult(
            RiskLevel.NORMAL, "Available measurements are within prototype thresholds."
        )
