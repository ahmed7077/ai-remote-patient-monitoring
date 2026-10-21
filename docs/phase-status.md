# Phase status and evidence

## Implemented and verified in software

- User registration/login/session restoration and role-aware routing
- Assigned-patient authorization for monitoring and ML data
- Explicit package discovery and installable backend image package
- Four-parameter synthetic simulator sessions
- Stable device-session duplicate protection and partial-measurement availability
- Rule-based prototype assessment, internal alerts, acknowledgement, and audit events
- Patient/professional dashboards, dated source-aware history, and unit-safe trend selection
- Reproducible PhysioNet Challenge 2012 acquisition, feature engineering, four-model comparison, and held-out evaluation
- Versioned and checksum-validated model artifact loaded once for inference
- Separate `ML_CLASSIFIER_V1` persistence and authenticated patient-scoped endpoints
- Responsive AI Analytics workspace with real evaluation evidence and explicit synthetic-data warnings

## Archived Phase 2 work

- MAX30102 heart-rate and estimated-SpO₂ acquisition prototype
- DS18B20 skin-temperature acquisition
- Finger-contact stability and LED/button state flow
- PPG baseline respiratory-rate estimation
- TLS connection to a deployed API using a provisioned CA certificate
- Retry behavior and device-to-dashboard transport prototype

These paths remain in Git history and archival hardware/firmware documents but are hidden from the final software-only user experience.

## Not implemented or not claimed

- Clinical accuracy, calibration, safety certification, or medical-device compliance
- Blood pressure from the Phase 2 physical device
- Clinical validation or medical-device claims for the research model
- Real patient recruitment/data collection
- SMS/email/emergency-service notifications
- Production deployment, fleet management, over-the-air updates, or secure hardware storage

Legacy blood-pressure records remain readable for migration compatibility, but new Phase 2 simulator and ESP32 sessions use only heart rate, estimated SpO₂, skin temperature, and experimental respiratory rate.

## Verification boundary

Automated backend, frontend, and ML tests cover authorization, ingestion, simulator output, authentication routing, trends, data-schema validation, leakage controls, reproducibility, serialization, model loading, provenance persistence, unavailable states, evidence rendering, and rule/ML separation. The held-out metrics are generated from official Set B, not fixtures. Docker Compose builds and starts PostgreSQL, FastAPI, and React successfully with migration `0003` applied without resetting historical volumes.
