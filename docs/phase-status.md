# Phase status and evidence

## Implemented and verified in software

- User registration/login/session restoration and role-aware routing
- Assigned-patient authorization for patient data and device administration
- Explicit package discovery and installable backend image package
- Simulator and physical-device authentication paths with server-derived source identity
- Hashed, one-time per-device credentials with rotation and revocation
- Four-parameter simulator sessions and physical ingestion contracts
- Stable device-session duplicate protection and partial-measurement availability
- Rule-based prototype assessment, internal alerts, acknowledgement, and audit events
- Patient/professional dashboards, dated source-aware history, and unit-safe trend selection
- Clinician ESP32 provisioning UI with one-time credential reveal
- Compile-verified ESP32 production firmware target

## Implemented but awaiting physical verification

- MAX30102 heart-rate and estimated-SpO₂ acquisition
- DS18B20 skin-temperature acquisition
- Finger-contact stability and LED/button state flow
- PPG baseline respiratory-rate estimation
- TLS connection to a deployed API using a provisioned CA certificate
- Retry behavior and full device-to-dashboard latency on real Wi-Fi

## Not implemented or not claimed

- Clinical accuracy, calibration, safety certification, or medical-device compliance
- Blood pressure from the Phase 2 physical device
- A trained or validated machine-learning model
- Real patient recruitment/data collection
- SMS/email/emergency-service notifications
- Production deployment, fleet management, over-the-air updates, or secure hardware storage

Legacy blood-pressure records remain readable for migration compatibility, but new Phase 2 simulator and ESP32 sessions use only heart rate, estimated SpO₂, skin temperature, and experimental respiratory rate.

## Verification boundary

Automated backend and frontend tests cover authorization, credentials, ingestion, simulator output, authentication routing, trend selection, and provisioning behavior. PlatformIO compiles the ESP32 firmware. The respiratory estimator has native unit tests for synthetic-wave and flat-signal cases; CI runs these on Linux. The local Windows machine lacked a host C++ compiler, and no physical board was connected, so those two runtime validations are explicitly outstanding locally.
