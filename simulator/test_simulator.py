from simulator.simulator import generate


def test_payload_is_explicitly_synthetic() -> None:
    payload = generate("normal", "SIM-TEST")
    assert payload["source"] == "SIMULATED"
    assert payload["device_uid"] == "SIM-TEST"
    assert {item["type"] for item in payload["measurements"]} == {
        "HEART_RATE",
        "SPO2",
        "TEMPERATURE",
        "RESPIRATORY_RATE",
    }


def test_each_demo_scenario_uses_the_four_parameter_measurement_set() -> None:
    for scenario in ("normal", "warning", "high-risk"):
        measurements = generate(scenario, "SIM-TEST")["measurements"]
        assert len(measurements) == 4
        respiratory = next(
            item for item in measurements if item["type"] == "RESPIRATORY_RATE"
        )
        assert respiratory["unit"] == "breaths/min"
