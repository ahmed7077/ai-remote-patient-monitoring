# Synthetic device simulator

This development tool explicitly generates **synthetic simulated measurements** and posts them to a registered `SIMULATOR` device. It is never started automatically and its output must not be used to train, validate, or report performance for the final healthcare ML model.

```powershell
python simulator/simulator.py --device-key development-device-ingestion-key --device-uid SIM-DEMO-001 --scenario normal
```

Use `--scenario warning` or `--scenario high-risk` for a deliberate alert demonstration, `--interval 5` to change frequency, and `--once` to send a single session.

