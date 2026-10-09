import random
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, DeviceType, MeasurementSession, MeasurementSource, VitalType
from app.schemas import DemoScenario, IngestionRequest, MeasurementInput
from app.services.ingestion import VitalIngestionService

SCENARIO_RANGES: dict[DemoScenario, dict[VitalType, tuple[float, float]]] = {
    DemoScenario.NORMAL: {
        VitalType.HEART_RATE: (66, 82),
        VitalType.SPO2: (96, 100),
        VitalType.SYSTOLIC_BP: (108, 128),
        VitalType.DIASTOLIC_BP: (68, 84),
        VitalType.TEMPERATURE: (36.3, 37.2),
    },
    DemoScenario.WARNING: {
        VitalType.HEART_RATE: (108, 118),
        VitalType.SPO2: (91, 94),
        VitalType.SYSTOLIC_BP: (140, 158),
        VitalType.DIASTOLIC_BP: (86, 98),
        VitalType.TEMPERATURE: (37.8, 38.4),
    },
    DemoScenario.HIGH_RISK: {
        VitalType.HEART_RATE: (136, 152),
        VitalType.SPO2: (84, 88),
        VitalType.SYSTOLIC_BP: (182, 198),
        VitalType.DIASTOLIC_BP: (100, 112),
        VitalType.TEMPERATURE: (39.1, 40.2),
    },
}

UNITS: dict[VitalType, str] = {
    VitalType.HEART_RATE: "bpm",
    VitalType.SPO2: "%",
    VitalType.SYSTOLIC_BP: "mmHg",
    VitalType.DIASTOLIC_BP: "mmHg",
    VitalType.TEMPERATURE: "°C",
}


class DemoSimulationService:
    def simulate(
        self, db: Session, patient_id: uuid.UUID, scenario: DemoScenario
    ) -> MeasurementSession:
        device = db.scalar(
            select(Device).where(
                Device.patient_id == patient_id,
                Device.device_type == DeviceType.SIMULATOR,
            )
        )
        if device is None:
            device = Device(
                device_uid=f"SIM-DEMO-{str(patient_id)[:8].upper()}",
                patient_id=patient_id,
                device_type=DeviceType.SIMULATOR,
                firmware_version="reviewer-demo-1.0",
            )
            db.add(device)
            db.flush()

        measurements = [
            MeasurementInput(type=vital, value=round(random.uniform(*bounds), 1), unit=UNITS[vital])
            for vital, bounds in SCENARIO_RANGES[scenario].items()
        ]
        return VitalIngestionService().ingest(
            db,
            IngestionRequest(
                device_uid=device.device_uid,
                recorded_at=datetime.now(UTC),
                source=MeasurementSource.SIMULATED,
                measurements=measurements,
            ),
            device,
            MeasurementSource.SIMULATED,
        )
