from __future__ import annotations

from collections.abc import Mapping

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


def classification_metrics(
    targets: np.ndarray, probabilities: np.ndarray, threshold: float
) -> dict[str, float | list[list[int]]]:
    predictions = (probabilities >= threshold).astype(int)
    return {
        "accuracy": float(accuracy_score(targets, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(targets, predictions)),
        "precision": float(precision_score(targets, predictions, zero_division=0)),
        "recall": float(recall_score(targets, predictions, zero_division=0)),
        "f1": float(f1_score(targets, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(targets, probabilities)),
        "pr_auc": float(average_precision_score(targets, probabilities)),
        "brier_score": float(brier_score_loss(targets, probabilities)),
        "confusion_matrix": confusion_matrix(targets, predictions).tolist(),
    }


def choose_f1_threshold(targets: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.linspace(0.05, 0.95, 181)
    scores = [
        f1_score(targets, probabilities >= threshold, zero_division=0) for threshold in candidates
    ]
    return float(candidates[int(np.argmax(scores))])


def bootstrap_intervals(
    targets: np.ndarray,
    probabilities: np.ndarray,
    threshold: float,
    *,
    iterations: int = 1000,
    seed: int = 7077,
) -> dict[str, list[float]]:
    """Return percentile 95% intervals from deterministic patient-level resampling."""
    generator = np.random.default_rng(seed)
    values: dict[str, list[float]] = {"roc_auc": [], "pr_auc": [], "recall": []}
    for _ in range(iterations):
        indices = generator.integers(0, len(targets), len(targets))
        sampled_targets = targets[indices]
        if len(np.unique(sampled_targets)) < 2:
            continue
        sampled_probabilities = probabilities[indices]
        values["roc_auc"].append(float(roc_auc_score(sampled_targets, sampled_probabilities)))
        values["pr_auc"].append(
            float(average_precision_score(sampled_targets, sampled_probabilities))
        )
        values["recall"].append(
            float(
                recall_score(
                    sampled_targets,
                    sampled_probabilities >= threshold,
                    zero_division=0,
                )
            )
        )
    return {
        name: [float(np.percentile(scores, 2.5)), float(np.percentile(scores, 97.5))]
        for name, scores in values.items()
    }


def json_ready(values: Mapping[str, object]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in values.items():
        if isinstance(value, np.floating):
            result[key] = float(value)
        elif isinstance(value, np.integer):
            result[key] = int(value)
        else:
            result[key] = value
    return result
