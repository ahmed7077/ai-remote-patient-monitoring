# PulseBridge — Remote Patient Monitoring

PulseBridge is an academic remote-patient-monitoring prototype with two explicitly identified data paths: a reviewer-friendly software simulator and an ESP32 finger-rest device. Both paths use the same authenticated ingestion, quality, persistence, prototype risk, alert, and role-based dashboard pipeline.

> PulseBridge is not a medical device, diagnostic system, or clinically validated model. It must not be used for clinical decisions or with real patient data.

## Current phase

The project now has a complete software demonstration path and a compile-verified physical-device prototype foundation:

- FastAPI, PostgreSQL, Alembic, React, and role-based patient/professional workspaces
- Argon2id passwords, short-lived JWT access tokens, rotating hashed refresh tokens, RBAC, and audit events
- Simulator and ESP32 sources identified separately throughout persisted sessions and the UI
- Per-device ESP32 credentials stored only as hashes, with professional-only issue, rotate, and revoke operations
- Idempotent physical sessions, quality/availability metadata, and offline/stale/online device state
- Four active measurements: heart rate, estimated SpO₂, skin temperature, and experimental respiratory rate
- One-click normal/warning/high-risk simulated reviewer scenarios with no tokens exposed in the browser
- Trends with dates, a visible metric legend/selector, and separate axes for incompatible units
- PlatformIO firmware for ESP32 + MAX30102 + DS18B20, including HTTPS upload and a PPG-derived respiratory-rate experiment

Physical sensor accuracy, electrical assembly, on-device test execution, calibration, clinical validation, and the final ML work remain incomplete. See [phase status](docs/phase-status.md) for the exact boundary.

## Architecture

```text
Software simulator ── shared development key ─┐
                                              ├─ HTTPS REST ingestion
ESP32 finger-rest ── per-device credential ───┘
        → server-derived source identity
        → technical quality and duplicate checks
        → PostgreSQL sessions + measurement availability/quality metadata
             ├─ prototype rule-based assessment → internal alerts
             └─ historical measurements and source-aware trends
        → role-scoped FastAPI endpoints
        → patient and healthcare-professional React workspaces
```

The backend never trusts a client-supplied source label. Physical devices authenticate with `X-Device-Credential`; the shared `X-Device-Key` is retained only for the controlled simulator path.

## Repository

```text
backend/       FastAPI API, domain model, services, migrations, and tests
frontend/      React application and browser-level component tests
firmware/      ESP32 finger-rest PlatformIO project
simulator/     Opt-in synthetic data generator
ml/            Research scaffold and guardrails; no final trained model
docs/          Hardware, firmware, security, architecture, and phase notes
.github/       Free CI workflow
compose.yaml   PostgreSQL, backend, and frontend development stack
```

## Run the web platform

Prerequisite: Docker Desktop with Compose. Copy `.env.example` to `.env` and replace every development secret, then run:

```bash
docker compose up --build
```

Open the frontend at `http://localhost:5173`, API documentation at `http://localhost:8000/docs`, and health endpoint at `http://localhost:8000/health`. The backend runs `alembic upgrade head` during container startup.

Docker Desktop was unavailable on the implementation machine during final validation, so Compose configuration was parsed but the full container runtime still requires verification on a Docker-enabled host.

## Fast reviewer demo

1. Register or sign in as a healthcare professional.
2. Open **Patients**, create a patient profile, then open that patient.
3. Under **Generate simulated reading**, choose **Normal**, **Warning**, or **High risk**.
4. Show the four current readings, prototype assessment, and any alert.
5. Generate a second reading and open **Trends**. Select each colored metric tab to show its dated graph and unit.
6. Open **Devices** to show the source state and physical-device registration workflow.

Every synthetic session is labelled `SIMULATED`. The one-click control uses the real server pipeline but is restricted to an assigned healthcare professional.

For a physical demo, follow the [hardware guide](docs/hardware-guide.md) and [firmware guide](docs/firmware-guide.md). Registering an ESP32 reveals its credential once; copy it immediately into the device’s ignored local configuration.

## Development checks

```bash
python -m venv .venv
.venv/Scripts/pip install -e "backend[dev]"
ruff check backend simulator
ruff format --check backend simulator
mypy backend/app
pytest backend simulator -q
```

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

```bash
cd firmware/esp32-finger-rest
platformio test -e native
platformio run -e esp32dev
```

The native firmware tests exercise only the transport-independent respiratory estimator. A connected ESP32 and sensors are still required for acquisition and end-to-end physical validation.

## Security and data claims

- Never commit `.env`, `pulsebridge_config.h`, Wi-Fi credentials, device credentials, JWT secrets, or certificates containing private keys.
- Simulator output is synthetic and must not be used to train, validate, or report final ML performance.
- Respiratory rate is an experimental estimate from PPG baseline modulation, not a validated clinical measurement.
- Estimated SpO₂, heart rate, and skin temperature require hardware-specific calibration and comparison against reference equipment.
- The current `PROTOTYPE_RULE_BASED` assessment is replaceable decision-support plumbing, not AI diagnosis.

More detail: [API and security](docs/api-security.md), [architecture](docs/architecture/README.md), and [phase status](docs/phase-status.md).

## Team

| Name | USN |
|---|---|
| Ayush Kumar Pandey | 20231ISE0057 |
| Ansit Pradhan | 20232ISE0058 |
| Muhammad Ahmed | 20231ISE0061 |

Literature sources are tracked in [docs/literature-review/references.md](docs/literature-review/references.md).
