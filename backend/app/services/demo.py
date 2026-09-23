import random
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Device, DeviceType, MeasurementSession
from app.schemas import DemoScenario, IngestionRequest, MeasurementInput
from app.services.ingestion import VitalIngestionService

SCENARIO_RANGES = {
    DemoScenario.NORMAL: {
        "HEART_RATE": (66, 82),
        "SPO2": (96, 100),
        "SYSTOLIC_BP": (108, 128),
        "DIASTOLIC_BP": (68, 84),
        "TEMPERATURE": (36.3, 37.2),
    },
    DemoScenario.WARNING: {
        "HEART_RATE": (108, 118),
        "SPO2": (91, 94),
        "SYSTOLIC_BP": (140, 158),
        "DIASTOLIC_BP": (86, 98),
        "TEMPERATURE": (37.8, 38.4),
    },
    DemoScenario.HIGH_RISK: {
        "HEART_RATE": (136, 152),
        "SPO2": (84, 88),
        "SYSTOLIC_BP": (182, 198),
        "DIASTOLIC_BP": (100, 112),
        "TEMPERATURE": (39.1, 40.2),
    },
}

UNITS = {
    "HEART_RATE": "bpm",
    "SPO2": "%",
    "SYSTOLIC_BP": "mmHg",
    "DIASTOLIC_BP": "mmHg",
    "TEMPERATURE": "°C",
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
                source="SIMULATED",
                measurements=measurements,
            ),
        )
