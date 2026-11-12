# ML research pipeline

PulseBridge’s research task is binary prediction of in-hospital death from heart-rate and temperature summaries collected during the first 12 hours of an adult ICU stay. It uses the open PhysioNet/Computing in Cardiology Challenge 2012 dataset, not PulseBridge simulator output.

The package compares a majority-class dummy baseline, logistic regression, random forest, and histogram gradient boosting with stratified five-fold cross-validation on official Set A. PR-AUC is the primary selection metric because mortality is the minority class; recall, ROC-AUC, F1, balanced accuracy, and Brier score are also reported. The decision threshold is selected from Set A out-of-fold predictions. Official Set B is evaluated once after selection.

## Run

```bash
python -m venv .venv
.venv/Scripts/pip install -e "ml[dev]"
cd ml
python -m pulsebridge_ml.acquire --destination data/raw
python -m pulsebridge_ml.train
pytest
ruff check .
mypy src
```

Outputs are written to `artifacts/` and `reports/generated/`. Raw records under `data/raw/` are ignored by Git. See [dataset provenance](data/README.md) for licensing, checksums, observed feature coverage, and leakage controls.

The application integration is implemented in `backend/app/services/ml_risk.py`. It uses available history within the latest 12 hours, validates units and the exact feature order, verifies the artifact checksum/version, persists provenance in `ml_predictions`, and exposes authenticated patient-scoped APIs. The React AI Analytics workspace displays actual evaluation evidence and keeps the result separate from `PROTOTYPE_RULE_BASED`.

Selected held-out Set B results for the 12-hour model: roc_auc 0.6489, pr_auc 0.2286, recall 0.5282, precision 0.2152, f1 0.3058, balanced_accuracy 0.6047, brier_score 0.1371. These values describe the research dataset only.

See [methodology](../docs/ml-methodology.md), [results](../docs/ml-results.md), and [limitations](../docs/ml-limitations.md).

**Simulator output is excluded from model training, validation, and reported performance. This model is not clinically validated and must not be used for patient care.**
