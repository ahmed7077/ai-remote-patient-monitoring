# ML research foundation

The future research question is whether multivariate physiological time-series information can identify abnormal patterns and estimate patient risk. No final model, clinical claim, dataset, target, prediction horizon, or result is defined in Phase 1.

Before training, Phase 2 must document the public dataset, target variable, prediction horizon (if predictive), input window, label provenance, inclusion/exclusion rules, leakage controls, and patient-level train/validation/test strategy.

Candidate baselines are Logistic Regression, SVM, Random Forest, and XGBoost. Candidate features include current values, rolling means, extrema, variation, rates of change, and window statistics. Evaluation may include accuracy, precision, recall, F1, ROC-AUC, confusion matrices, calibration, and clinically appropriate error analysis once the research design supports them.

**Simulator output is excluded from final model training, validation, and reported performance.** It exists only for software development and demonstrations.
