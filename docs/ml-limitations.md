# Machine-learning limitations and responsible use

## Intended use

This component is a final-year academic research prototype demonstrating reproducible model development and secure full-stack integration. It classifies an ICU dataset outcome after observing the first 48 hours. It is not cleared, calibrated, or validated for clinical decisions, remote home monitoring, diagnosis, treatment, or emergency response.

## Dataset limitations

- The Challenge 2012 cohort consists of historical adult ICU stays and may not represent present-day care, outpatient populations, children, regions, devices, or demographic groups.
- Only heart rate and temperature had sufficient coverage for the selected defensible task. The model does not assess SpO₂ or respiratory rate.
- Dataset missingness and measurement frequency can reflect care processes as well as physiology. HR count appearing important illustrates this risk.
- External validation on another hospital system was not performed.

## Evaluation limitations

- Set B is an independent official partition, but it is not a prospective clinical trial.
- Recall is 0.5528 at the selected threshold; 254 of 568 deaths in Set B were false negatives.
- Precision is 0.2370, so many positive classifications are false positives.
- Probability calibration is imperfect and the returned probability must not be interpreted as an individualized clinical prognosis.
- Hyperparameter exploration was deliberately limited; metrics should not be generalized beyond this dataset and task.

## PulseBridge integration boundary

- Dashboard monitoring data is synthetic and was never used to train, select, or evaluate the model.
- Synthetic sessions are outside the validation population. The UI labels this clearly even when their schema permits demonstration inference.
- A single current reading cannot produce a prediction. At least two valid HR and temperature measurements and a nearly complete 48-hour span are required.
- Missing inputs are not invented, imputed with arbitrary UI constants, or replaced with other vital signs.
- An unavailable ML result never silently falls back to the rule-based assessment.
- `SURVIVAL` and `IN_HOSPITAL_DEATH` remain the model’s actual research labels; they are not remapped to PulseBridge `NORMAL`, `WARNING`, or `HIGH_RISK` categories.
- Global permutation importance is not an individual explanation and must not be described as causal.

## Safety and future work

Future research would require ethical review, representative external cohorts, subgroup fairness analysis, prospective temporal validation, calibration monitoring, clinician-led utility studies, drift detection, and a regulated safety lifecycle. Until then, every screen and report must retain the academic-prototype disclaimer and must not involve real patient care.
