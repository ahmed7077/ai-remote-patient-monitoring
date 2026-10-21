import numpy as np

from pulsebridge_ml.evaluate import (
    bootstrap_intervals,
    choose_f1_threshold,
    classification_metrics,
)


def test_metrics_are_computed_from_probabilities() -> None:
    metrics = classification_metrics(
        np.asarray([0, 0, 1, 1]), np.asarray([0.1, 0.4, 0.6, 0.9]), 0.5
    )

    assert metrics["accuracy"] == 1.0
    assert metrics["recall"] == 1.0
    assert metrics["confusion_matrix"] == [[2, 0], [0, 2]]


def test_threshold_selection_is_deterministic() -> None:
    targets = np.asarray([0, 0, 1, 1])
    probabilities = np.asarray([0.1, 0.4, 0.45, 0.9])

    assert choose_f1_threshold(targets, probabilities) == choose_f1_threshold(
        targets, probabilities
    )


def test_bootstrap_intervals_are_reproducible() -> None:
    targets = np.asarray([0, 0, 0, 1, 1, 1])
    probabilities = np.asarray([0.1, 0.2, 0.4, 0.55, 0.8, 0.9])

    first = bootstrap_intervals(targets, probabilities, 0.5, iterations=50, seed=7)
    second = bootstrap_intervals(targets, probabilities, 0.5, iterations=50, seed=7)

    assert first == second
    assert set(first) == {"roc_auc", "pr_auc", "recall"}
