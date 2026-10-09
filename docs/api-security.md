# Device API and security

## Professional provisioning endpoints

- `POST /api/v1/devices` registers a device. An ESP32 response includes `device_credential` once.
- `POST /api/v1/devices/{device_id}/credentials/rotate` revokes old credentials and issues a replacement once.
- `POST /api/v1/devices/{device_id}/credentials/revoke` revokes active credentials.
- `GET /api/v1/patients/{patient_id}/devices` returns device metadata only; it never returns a credential.

All operations require a healthcare professional assigned to the target patient.

## Physical ingestion

`POST /api/v1/ingestion/vitals` uses the `X-Device-Credential` header. The credential must belong to the `device_uid` in the payload and must not be revoked. Physical source identity is assigned by the server.

The payload can include:

- `recorded_at` in UTC
- stable `device_session_id`
- `acquisition_duration_seconds`
- `algorithm_version`
- non-sensitive `signal_quality`
- four-parameter `measurement_availability`
- an optional bounded `device_error_code`
- only the measurements actually available

The Phase 2 physical path rejects systolic and diastolic blood pressure. Supported units are `bpm`, `%`, `°C`, and `breaths/min`.

## Operational rules

- Treat the one-time device credential like a password.
- Provision over a trusted workstation and network.
- Rotate a credential if it may have been exposed; revoke it when a device is retired.
- Use HTTPS with certificate validation outside isolated local development.
- Do not put credentials in query strings, logs, screenshots, source control, firmware documentation, or browser storage.
- Use synthetic identities and measurements for reviews.
