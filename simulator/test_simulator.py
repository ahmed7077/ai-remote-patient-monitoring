from simulator.simulator import generate


def test_payload_is_explicitly_synthetic() -> None:
    payload = generate("normal", "SIM-TEST")
    assert payload["source"] == "SIMULATED"
    assert payload["device_uid"] == "SIM-TEST"
    assert len(payload["measurements"]) == 5
