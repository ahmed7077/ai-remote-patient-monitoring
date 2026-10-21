# Machine-learning results

## Model comparison on development Set A

Values below are means from the executed stratified five-fold cross-validation. They are read from the generated evaluation artifact, not hand-selected demo values.

| Candidate | Balanced accuracy | Precision | Recall | F1 | ROC-AUC | PR-AUC | Brier |
|---|---:|---:|---:|---:|---:|---:|---:|
| Majority dummy | 0.5000 | 0.0000 | 0.0000 | 0.0000 | 0.5000 | 0.1385 | 0.1385 |
| Logistic regression | 0.5937 | 0.1957 | 0.5524 | 0.2889 | 0.6297 | 0.2295 | 0.2336 |
| **Random forest (selected)** | 0.5502 | 0.4065 | 0.1317 | 0.1973 | **0.6960** | **0.2782** | **0.1272** |
| Histogram gradient boosting | 0.6082 | 0.2889 | 0.3574 | 0.3190 | 0.6728 | 0.2694 | 0.1520 |

Random forest was selected by the predefined primary measure, PR-AUC. The operational threshold was then selected using Set A out-of-fold probabilities to increase sensitivity relative to the default 0.5 cutoff.

## Final held-out Set B evaluation

| Measure | Value |
|---|---:|
| Accuracy | 0.6838 |
| Balanced accuracy | 0.6291 |
| Precision | 0.2370 |
| Recall | 0.5528 |
| F1 | 0.3317 |
| ROC-AUC | 0.6836 |
| PR-AUC | 0.2663 |
| Brier score | 0.1314 |

Confusion matrix, with rows as actual class and columns as predicted class:

| | Predicted survival | Predicted death |
|---|---:|---:|
| Actual survival | 2,421 | 1,011 |
| Actual death | 254 | 314 |

Bootstrap 95% confidence intervals were ROC-AUC 0.6591–0.7071, PR-AUC 0.2376–0.3031, and recall 0.5094–0.5928. The 254 false negatives are a central limitation; the output cannot be used for clinical care.

## Explainability

Permutation importance was calculated globally on held-out data. Temperature mean and HR measurement count were the two largest positive importances in this evaluation, followed by HR standard deviation. Some features have near-zero or negative permutation importance. These results describe predictive association and model behavior, not physiology, causation, or an individual explanation.

## Generated evidence

- `ml/reports/generated/metrics.json`
- `ml/reports/generated/confusion-matrix.png`
- `ml/reports/generated/roc-curve.png`
- `ml/reports/generated/precision-recall-curve.png`
- `ml/reports/generated/calibration.png`
- `ml/reports/generated/permutation-importance.png`
- `ml/reports/model-card.md`

The authenticated `/api/v1/ml/model` endpoint exposes the same held-out metrics, cross-validation comparison, and global feature importance to the React AI Analytics workspace.
