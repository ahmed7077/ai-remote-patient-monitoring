"""Intentional software-only RPM device simulator. Never use its data for ML evaluation."""

import argparse
import json
import random
import signal
import time
import urllib.request
from datetime import UTC, datetime

RUNNING = True


def stop(*_: object) -> None:
    global RUNNING
    RUNNING = False


def generate(scenario: str, device_uid: str) -> dict[str, object]:
    ranges = {
        "normal": {
            "HEART_RATE": (66, 82),
            "SPO2": (96, 100),
            "SYSTOLIC_BP": (108, 128),
            "DIASTOLIC_BP": (68, 84),
            "TEMPERATURE": (36.3, 37.2),
        },
        "warning": {
            "HEART_RATE": (108, 118),
            "SPO2": (91, 94),
            "SYSTOLIC_BP": (140, 158),
            "DIASTOLIC_BP": (86, 98),
            "TEMPERATURE": (37.8, 38.4),
        },
        "high-risk": {
            "HEART_RATE": (136, 152),
            "SPO2": (84, 88),
            "SYSTOLIC_BP": (182, 198),
            "DIASTOLIC_BP": (100, 112),
            "TEMPERATURE": (39.1, 40.2),
        },
    }
    units = {
        "HEART_RATE": "bpm",
        "SPO2": "%",
        "SYSTOLIC_BP": "mmHg",
        "DIASTOLIC_BP": "mmHg",
        "TEMPERATURE": "°C",
    }
    return {
        "device_uid": device_uid,
        "recorded_at": datetime.now(UTC).isoformat(),
        "source": "SIMULATED",
        "measurements": [
            {
                "type": vital,
                "value": round(random.uniform(*bounds), 1),
                "unit": units[vital],
            }
            for vital, bounds in ranges[scenario].items()
        ],
    }


def send(api_url: str, key: str, payload: dict[str, object]) -> None:
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/v1/ingestion/vitals",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "X-Device-Key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        print(
            f"Synthetic session accepted ({response.status}) at {payload['recorded_at']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Explicit synthetic RPM device simulator"
    )
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--device-uid", default="SIM-DEMO-001")
    parser.add_argument("--device-key", required=True)
    parser.add_argument("--interval", type=float, default=10)
    parser.add_argument(
        "--scenario", choices=["normal", "warning", "high-risk"], default="normal"
    )
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(
        f"Starting SYNTHETIC simulator '{args.device_uid}' in {args.scenario} mode. Ctrl+C stops it."
    )
    while RUNNING:
        send(args.api_url, args.device_key, generate(args.scenario, args.device_uid))
        if args.once:
            break
        time.sleep(max(args.interval, 1))
    print("Simulator stopped cleanly.")


if __name__ == "__main__":
    main()
