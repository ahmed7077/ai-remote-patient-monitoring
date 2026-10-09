# System architecture

PulseBridge keeps transport, identity, quality, and decision support separate:

1. A simulator or physical device submits a measurement session.
2. The authentication method resolves the registered device and determines the source. Payload source claims are ignored.
3. `VitalIngestionService` rejects stale timestamps, contradictory availability, duplicates, unsupported physical blood-pressure readings, and structurally invalid data.
4. The session, measurements, quality states, acquisition metadata, and device last-contact time are persisted atomically.
5. The replaceable `PrototypeRuleBasedRiskAssessmentService` creates a stored assessment and, only for actionable warning/high-risk results, an internal alert.
6. FastAPI enforces patient linkage or professional assignment before returning data.
7. React Query supplies the patient and professional workspaces and invalidates affected views after writes.

## Trust boundaries

- Browser users authenticate with access/refresh tokens and RBAC.
- Each ESP32 receives a high-entropy credential exactly once. Only its SHA-256 digest and a non-secret prefix are stored.
- The controlled simulator uses the environment-scoped development key and can authenticate only registered `SIMULATOR` devices.
- Device UID alone is never authentication.
- Audit metadata excludes credentials, tokens, passwords, and vital payloads.

## Availability semantics

Missing sensor output is represented as unavailable, not as zero. `measurement_availability` records the expected four parameters for a session, while the measurements list contains only values that the device could calculate. Invalid-only sessions do not create actionable alerts.

## Connectivity semantics

Device state is derived when devices are read: never-contacted devices are `OFFLINE`, contact older than `DEVICE_STALE_MINUTES` is `STALE`, and recent contact is `ONLINE`. This avoids presenting historical state as live connectivity.
