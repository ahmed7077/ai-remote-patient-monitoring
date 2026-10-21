# ML research pipeline

PulseBridge’s research task is binary prediction of in-hospital death from heart-rate and temperature summaries collected during the first 48 hours of an adult ICU stay. It uses the open PhysioNet/Computing in Cardiology Challenge 2012 dataset, not PulseBridge simulator output.

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

The eventual application integration must require a 48-hour history with the supported schema, identify the output as an ICU research model, and keep it separate from `PROTOTYPE_RULE_BASED`. It must not present a prediction from a single simulator reading.

**Simulator output is excluded from model training, validation, and reported performance. This model is not clinically validated and must not be used for patient care.**
