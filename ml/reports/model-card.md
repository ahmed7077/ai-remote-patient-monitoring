# ICU mortality research model v1

## Intended task

`icu-mortality-hr-temp-v1` estimates the probability of in-hospital death using summary features from heart rate and temperature measured during the first 48 hours of an adult ICU stay. It is a retrospective research classifier, not a diagnosis, real-time deterioration detector, or clinically validated system.

Training and evaluation use PhysioNet/Computing in Cardiology Challenge 2012 v1.0.0. Official Set A (4,000 stays; 554 deaths) is used for five-fold stratified cross-validation, model selection, threshold selection from out-of-fold probabilities, and final fitting. Official Set B (4,000 stays; 568 deaths) is held out until one final evaluation.

## Models compared on Set A

| Model | Balanced accuracy | Precision | Recall | F1 | ROC-AUC | PR-AUC | Brier |
|---|---:|---:|---:|---:|---:|---:|---:|
| Majority dummy | 0.500 | 0.000 | 0.000 | 0.000 | 0.500 | 0.139 | 0.139 |
| Logistic regression | 0.594 | 0.196 | 0.552 | 0.289 | 0.630 | 0.230 | 0.234 |
| Random forest | 0.550 | 0.406 | 0.132 | 0.197 | 0.696 | **0.278** | **0.127** |
| Histogram gradient boosting | **0.608** | 0.289 | 0.357 | **0.319** | 0.673 | 0.269 | 0.152 |

The random forest is selected because it achieved the highest mean cross-validated PR-AUC, the primary metric for the imbalanced mortality target. Its out-of-fold F1-optimal decision threshold is 0.31. This lower threshold trades many false positives for greater sensitivity; the tradeoff is explicitly visible in the held-out confusion matrix.

## Held-out Set B results

| Metric | Result | Bootstrap 95% interval where calculated |
|---|---:|---:|
| Accuracy | 0.684 | — |
| Balanced accuracy | 0.629 | — |
| Precision | 0.237 | — |
| Recall | 0.553 | 0.509–0.593 |
| F1 | 0.332 | — |
| ROC-AUC | 0.684 | 0.659–0.707 |
| PR-AUC | 0.266 | 0.238–0.303 |
| Brier score | 0.131 | — |

Confusion matrix at threshold 0.31:

| | Predicted survivor | Predicted death |
|---|---:|---:|
| Actual survivor | 2,421 | 1,011 |
| Actual death | 254 | 314 |

These results are modest, not clinical-grade. They demonstrate that the model learned signal beyond the 14.2% Set B mortality prevalence, while also showing substantial false-positive and false-negative error.

## Features and preprocessing

For both heart rate and temperature, the feature extractor calculates minimum, maximum, mean, standard deviation, last value, per-hour linear slope, and observation count. Missing measurements remain `NaN` until fold-local median imputation; missingness indicators are learned by the scikit-learn pipeline. All transformations are fitted only within training folds or on Set A before Set B evaluation.

Permutation importance on Set B is provided only as descriptive, non-causal global importance. Temperature mean, heart-rate observation count, and heart-rate variability produced the largest decreases in PR-AUC when permuted. Observation counts may reflect clinical workflow rather than physiology.

## Artifact

- File: `artifacts/icu-mortality-hr-temp-v1.joblib`
- SHA-256: `b8ac7bc41197a6516a4484064889ec3451ac753152f62d7a6f1bbd6fbee6b523`
- Serialized with scikit-learn 1.8.0 and joblib 1.5.3
- Only this project-produced, checksum-validated artifact may be loaded

## Limitations

- The historical cohort contains adult ICU stays lasting at least 48 hours and cannot establish performance in remote-monitoring users.
- PulseBridge simulator readings are not training or evaluation data.
- The model uses heart rate and temperature only; it does not assess SpO₂ or respiratory rate.
- A full 48-hour history is required. A prediction from one current reading would violate the validated schema.
- Set B outcomes are used once for this report; further tuning against Set B would invalidate its held-out role.
- Class imbalance, missingness, changing clinical practice, population shift, and treatment effects limit generalization.
- Feature importance is associative, not causal.
- The model must never drive autonomous medical decisions or external emergency actions.
