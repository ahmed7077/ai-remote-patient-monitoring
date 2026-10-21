# System architecture

PulseBridge keeps transport, identity, quality, and decision support separate:

1. The software simulator submits a clearly labelled synthetic measurement session.
2. Authentication resolves the registered simulator source. Payload source claims are ignored.
3. `VitalIngestionService` rejects stale timestamps, contradictory availability, duplicates, unsupported physical blood-pressure readings, and structurally invalid data.
4. The session, measurements, quality states, acquisition metadata, and device last-contact time are persisted atomically.
5. The replaceable `PrototypeRuleBasedRiskAssessmentService` creates a stored assessment and, only for actionable warning/high-risk results, an internal alert.
6. FastAPI enforces patient linkage or professional assignment before returning data.
7. When requested, `MLRiskAssessmentService` builds the exact 14-feature HR/temperature schema from a nearly complete 48-hour window, loads only the trusted checksum-validated artifact, and persists its separate outcome/provenance.
8. React Query supplies the patient and professional workspaces and invalidates affected views after writes.

```text
Synthetic simulator
  → validation + PostgreSQL
  ├─ PROTOTYPE_RULE_BASED → monitoring alerts
  └─ eligible 48-hour HR/Temp window → ML_CLASSIFIER_V1 → research outcome
       → authenticated API → AI Analytics workspace
```

## Trust boundaries

- Browser users authenticate with access/refresh tokens and RBAC.
- The controlled simulator uses the environment-scoped development key and can authenticate only registered `SIMULATOR` devices.
- Device UID alone is never authentication.
- Audit metadata excludes credentials, tokens, passwords, and vital payloads.

## Availability semantics

Missing sensor output is represented as unavailable, not as zero. `measurement_availability` records the expected four parameters for a session, while the measurements list contains only values that the device could calculate. Invalid-only sessions do not create actionable alerts.

## Model boundary

The model artifact was trained outside the application on independently labelled adult ICU records. It receives no SpO₂ or respiratory-rate features, does not learn from simulator risk labels, and does not map its output to `NORMAL`, `WARNING`, or `HIGH_RISK`. Missing history produces an explicit unavailable result. Global permutation importance is presented as association, never causation.
