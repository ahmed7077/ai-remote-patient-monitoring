import numpy as np

from pulsebridge_ml.features import FEATURE_NAMES, Observation, summarize


def test_feature_order_and_summary_values_are_stable() -> None:
    result = summarize(
        [
            Observation(0, "HR", 60.0),
            Observation(60, "HR", 72.0),
            Observation(0, "Temp", 36.5),
            Observation(120, "Temp", 37.5),
        ]
    )

    assert len(result) == len(FEATURE_NAMES) == 14
    assert np.allclose(result[0:7], [60.0, 72.0, 66.0, 6.0, 72.0, 12.0, 2.0])
    assert result[7:12].tolist() == [36.5, 37.5, 37.0, 0.5, 37.5]
    assert np.isclose(result[12], 0.5)
    assert result[13] == 2.0


def test_missing_parameter_is_explicitly_nan_with_zero_count() -> None:
    result = summarize([Observation(0, "HR", 70.0)])

    assert np.isnan(result[7:13]).all()
    assert result[13] == 0.0


def test_non_finite_values_are_not_used() -> None:
    result = summarize([Observation(0, "HR", float("nan")), Observation(0, "Temp", float("inf"))])

    assert np.isnan(result[:6]).all()
    assert result[6] == 0.0
    assert np.isnan(result[7:13]).all()
    assert result[13] == 0.0
