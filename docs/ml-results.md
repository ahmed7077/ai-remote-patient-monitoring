# Twelve-hour model results

Model `icu-mortality-hr-temp-v2-12h` uses only observations from minutes 0 through 720 of each ICU stay. Selected model: `random_forest`. Threshold: 0.30.

## Set A five-fold comparison

| Candidate | ROC-AUC | PR-AUC | Recall |
|---|---:|---:|---:|
| dummy_most_frequent | 0.5000 | 0.1385 | 0.0000 |
| logistic_regression | 0.5921 | 0.1949 | 0.5795 |
| random_forest | 0.6286 | 0.2181 | 0.0975 |
| hist_gradient_boosting | 0.5996 | 0.1961 | 0.2762 |

## Held-out Set B results

| Metric | Value |
|---|---:|
| accuracy | 0.6595 |
| balanced_accuracy | 0.6047 |
| precision | 0.2152 |
| recall | 0.5282 |
| f1 | 0.3058 |
| roc_auc | 0.6489 |
| pr_auc | 0.2286 |
| brier_score | 0.1371 |

Confusion matrix (actual rows, predicted columns; survival then death): `[[2338, 1094], [268, 300]]`.

These are research results, not clinical validation. The 48-hour v1 results are historical and must not be attributed to this model. Set B was previously evaluated for v1; this is a revised-window experiment on the same benchmark, not a new independent external validation.

Full confidence intervals, importance, provenance and plots are in `ml/reports/generated/`.
