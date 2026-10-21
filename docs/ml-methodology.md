# Machine-learning methodology

## Research question

PulseBridge evaluates whether summaries of heart rate and temperature observed during the first 48 hours of an adult ICU stay can support binary classification of eventual in-hospital death. This is an outcome-classification research task, not a real-time deterioration forecast and not a diagnosis.

## Dataset and provenance

The source is the open **PhysioNet/Computing in Cardiology Challenge 2012 v1.0.0**, licensed under ODC-By 1.0. The official Set A contains 4,000 stays with 554 deaths (13.85%); official Set B contains 4,000 stays with 568 deaths. Patient record identifiers define independent stays. Acquisition, file expectations, licensing, checksums, and the data dictionary are documented in [`ml/data/README.md`](../ml/data/README.md).

Observed Set A coverage showed that no honest four-vital complete-case task was practical: heart rate appeared in 3,937 records, temperature in 3,936, SpO₂ in 1,792, respiratory rate in 1,101, and only 171 records contained all four. The implemented task therefore uses HR and temperature only. No missing physiological channel or outcome was manufactured.

## Features

For each of HR and temperature, the pipeline calculates minimum, maximum, mean, population standard deviation, last observed value, hourly slope, and count. The 14-feature order is versioned in the artifact. Training and API inference share the same names, order, units, and summary definitions.

## Splitting and leakage controls

- Official Set A is the development partition.
- Stratified five-fold cross-validation on Set A compares candidates and produces out-of-fold probabilities for threshold selection.
- Imputation/scaling/model fitting occur inside scikit-learn pipelines and are fitted only on each training fold.
- Official Set B remains untouched until model and threshold selection are complete, then is evaluated once.
- PulseBridge simulator output and rule-based classifications are excluded from training, validation, and metric calculation.
- Fixed seed `7077` controls stochastic operations.

## Candidates and selection

The executed comparison includes `DummyClassifier` (majority), logistic regression, random forest, and `HistGradientBoostingClassifier`. PR-AUC is the primary selection measure because death is the minority outcome. ROC-AUC, balanced accuracy, precision, recall, F1, and Brier score provide complementary evidence. Random forest had the strongest Set A cross-validated PR-AUC (0.2782) and was selected. Its decision threshold (0.31) was chosen from Set A out-of-fold predictions, not Set B.

## Artifact and inference

The trusted artifact is `ml/artifacts/icu-mortality-hr-temp-v1.joblib`; a deployable copy is packaged under `backend/app/ml_artifacts/`. Metadata records the dataset, target, feature schema, units, training timestamp, library versions, threshold, metrics, limitations, and SHA-256 checksum. FastAPI loads it once, rejects checksum/version/schema mismatches, and never deserializes user uploads.

At runtime, inference requires at least two technically valid HR and temperature values spanning at least 47 hours within the latest 48-hour window. The stored record includes method `ML_CLASSIFIER_V1`, model version, actual label terminology, probability, threshold, time window, source, feature snapshot, and explanation. The rule-based method remains `PROTOTYPE_RULE_BASED` in a different table and API.

## Reproduction

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

Raw research records are ignored by Git. Generated JSON and plots in `ml/reports/generated/` are the evidence source for this document and the UI metadata endpoint.
