from __future__ import annotations

import argparse
import hashlib
import json
import platform
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import matplotlib
import numpy as np
import sklearn
from matplotlib import pyplot as plt
from sklearn.calibration import calibration_curve
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    PrecisionRecallDisplay,
    RocCurveDisplay,
    make_scorer,
    precision_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from pulsebridge_ml import MODEL_VERSION
from pulsebridge_ml.dataset import Dataset, load_partition
from pulsebridge_ml.evaluate import (
    bootstrap_intervals,
    choose_f1_threshold,
    classification_metrics,
)
from pulsebridge_ml.features import FEATURE_NAMES, FEATURE_UNITS, SUPPORTED_PARAMETERS

RANDOM_SEED = 7077


def model_candidates() -> dict[str, Pipeline]:
    imputer = SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True)
    return {
        "dummy_most_frequent": Pipeline(
            [("imputer", imputer), ("model", DummyClassifier(strategy="most_frequent"))]
        ),
        "logistic_regression": Pipeline(
            [
                ("imputer", imputer),
                ("scaler", StandardScaler()),
                (
                    "model",
                    LogisticRegression(
                        class_weight="balanced", max_iter=2000, random_state=RANDOM_SEED
                    ),
                ),
            ]
        ),
        "random_forest": Pipeline(
            [
                ("imputer", imputer),
                (
                    "model",
                    RandomForestClassifier(
                        n_estimators=400,
                        min_samples_leaf=5,
                        class_weight="balanced_subsample",
                        n_jobs=-1,
                        random_state=RANDOM_SEED,
                    ),
                ),
            ]
        ),
        "hist_gradient_boosting": Pipeline(
            [
                ("imputer", imputer),
                (
                    "model",
                    HistGradientBoostingClassifier(
                        learning_rate=0.06,
                        max_iter=250,
                        max_leaf_nodes=15,
                        l2_regularization=1.0,
                        class_weight="balanced",
                        random_state=RANDOM_SEED,
                    ),
                ),
            ]
        ),
    }


def compare_models(dataset: Dataset) -> tuple[dict[str, dict[str, float]], str]:
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    scoring = {
        "balanced_accuracy": "balanced_accuracy",
        "precision": make_scorer(precision_score, zero_division=0),
        "recall": "recall",
        "f1": "f1",
        "roc_auc": "roc_auc",
        "pr_auc": "average_precision",
        "neg_brier": "neg_brier_score",
    }
    comparison: dict[str, dict[str, float]] = {}
    for name, pipeline in model_candidates().items():
        scores = cross_validate(
            pipeline, dataset.features, dataset.targets, cv=folds, scoring=scoring, n_jobs=-1
        )
        comparison[name] = {metric: float(np.mean(scores[f"test_{metric}"])) for metric in scoring}
        comparison[name]["brier_score"] = -comparison[name].pop("neg_brier")
    eligible = [name for name in comparison if name != "dummy_most_frequent"]
    selected = max(
        eligible, key=lambda name: (comparison[name]["pr_auc"], comparison[name]["recall"])
    )
    return comparison, selected


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_plots(
    targets: np.ndarray,
    probabilities: np.ndarray,
    threshold: float,
    pipeline: Pipeline,
    features: np.ndarray,
    reports_dir: Path,
) -> dict[str, float]:
    reports_dir.mkdir(parents=True, exist_ok=True)
    predictions = (probabilities >= threshold).astype(int)
    ConfusionMatrixDisplay.from_predictions(
        targets, predictions, display_labels=["Survived", "Died"]
    )
    plt.tight_layout()
    plt.savefig(reports_dir / "confusion-matrix.png", dpi=180)
    plt.close()
    RocCurveDisplay.from_predictions(targets, probabilities)
    plt.tight_layout()
    plt.savefig(reports_dir / "roc-curve.png", dpi=180)
    plt.close()
    PrecisionRecallDisplay.from_predictions(targets, probabilities)
    plt.tight_layout()
    plt.savefig(reports_dir / "precision-recall-curve.png", dpi=180)
    plt.close()
    observed, predicted = calibration_curve(targets, probabilities, n_bins=10, strategy="quantile")
    plt.plot(predicted, observed, marker="o", label="Model")
    plt.plot([0, 1], [0, 1], linestyle="--", color="black", label="Ideal")
    plt.xlabel("Mean predicted probability")
    plt.ylabel("Observed event frequency")
    plt.legend()
    plt.tight_layout()
    plt.savefig(reports_dir / "calibration.png", dpi=180)
    plt.close()
    importance = permutation_importance(
        pipeline,
        features,
        targets,
        scoring="average_precision",
        n_repeats=10,
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
    ranked = sorted(
        zip(FEATURE_NAMES, importance.importances_mean, strict=True), key=lambda item: item[1]
    )
    labels, values = zip(*ranked, strict=True)
    plt.barh(labels, values)
    plt.xlabel("Decrease in held-out PR-AUC after permutation")
    plt.tight_layout()
    plt.savefig(reports_dir / "permutation-importance.png", dpi=180)
    plt.close()
    return {name: float(value) for name, value in ranked}


def train(data_dir: Path, artifacts_dir: Path, reports_dir: Path) -> dict[str, Any]:
    development = load_partition(data_dir / "set-a", data_dir / "Outcomes-a.txt")
    held_out = load_partition(data_dir / "set-b", data_dir / "Outcomes-b.txt")
    comparison, selected_name = compare_models(development)
    selected = model_candidates()[selected_name]
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    out_of_fold = cross_val_predict(
        selected,
        development.features,
        development.targets,
        cv=folds,
        method="predict_proba",
        n_jobs=-1,
    )[:, 1]
    threshold = choose_f1_threshold(development.targets, out_of_fold)
    selected.fit(development.features, development.targets)
    held_out_probabilities = selected.predict_proba(held_out.features)[:, 1]
    held_out_metrics = classification_metrics(held_out.targets, held_out_probabilities, threshold)
    confidence_intervals = bootstrap_intervals(held_out.targets, held_out_probabilities, threshold)
    importance = save_plots(
        held_out.targets,
        held_out_probabilities,
        threshold,
        selected,
        held_out.features,
        reports_dir,
    )

    artifacts_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifacts_dir / f"{MODEL_VERSION}.joblib"
    joblib.dump(
        {
            "model_version": MODEL_VERSION,
            "pipeline": selected,
            "feature_names": FEATURE_NAMES,
            "threshold": threshold,
            "supported_parameters": SUPPORTED_PARAMETERS,
        },
        artifact_path,
        compress=3,
    )
    metadata = {
        "model_identifier": "physionet-2012-icu-mortality",
        "model_version": MODEL_VERSION,
        "selected_model": selected_name,
        "dataset": "PhysioNet/Computing in Cardiology Challenge 2012 v1.0.0",
        "development_partition": "Set A (4,000 ICU stays)",
        "held_out_partition": "Set B (4,000 ICU stays)",
        "target": "In-hospital death after the first 48 hours of the ICU stay",
        "feature_names": FEATURE_NAMES,
        "feature_units": FEATURE_UNITS,
        "input_window_hours": 48,
        "decision_threshold": threshold,
        "training_timestamp_utc": datetime.now(UTC).isoformat(),
        "random_seed": RANDOM_SEED,
        "library_versions": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scikit_learn": sklearn.__version__,
            "joblib": joblib.__version__,
            "matplotlib": matplotlib.__version__,
        },
        "cross_validation": comparison,
        "held_out_metrics": held_out_metrics,
        "held_out_95_percent_confidence_intervals": confidence_intervals,
        "permutation_importance": importance,
        "artifact_sha256": sha256(artifact_path),
        "limitations": [
            "Research-only model trained on adult ICU stays; it is not clinically validated.",
            "It does not assess SpO2 or respiratory rate.",
            "It requires a 48-hour heart-rate and temperature history, not one current reading.",
            "Synthetic PulseBridge sessions are outside the validation population.",
        ],
    }
    (artifacts_dir / f"{MODEL_VERSION}.metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    (reports_dir / "metrics.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train and evaluate the PulseBridge research model"
    )
    parser.add_argument("--data-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--artifacts-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--reports-dir", type=Path, default=Path("reports/generated"))
    args = parser.parse_args()
    metadata = train(args.data_dir, args.artifacts_dir, args.reports_dir)
    print(json.dumps(metadata["held_out_metrics"], indent=2))


if __name__ == "__main__":
    main()
