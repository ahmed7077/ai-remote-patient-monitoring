# PulseBridge — Remote Patient Monitoring

PulseBridge is a software-only academic remote-patient-monitoring research prototype. A clearly labelled physiological simulator drives the monitoring demonstration, while an independently trained and evaluated model provides a separate ICU mortality research outcome when a complete 48-hour input window exists.

> PulseBridge is not a medical device, diagnostic system, or clinically validated model. It must not be used for clinical decisions or with real patient data.

## Current phase

The project now has a complete software demonstration path and a reproducible ML research pipeline:

- FastAPI, PostgreSQL, Alembic, React, and role-based patient/professional workspaces
- Argon2id passwords, short-lived JWT access tokens, rotating hashed refresh tokens, RBAC, and audit events
- Clearly identified synthetic monitoring sessions with persisted quality metadata
- Four active measurements: heart rate, estimated SpO₂, skin temperature, and experimental respiratory rate
- One-click normal/warning/high-risk simulated reviewer scenarios with no tokens exposed in the browser
- Trends with dates, a visible metric legend/selector, and separate axes for incompatible units
- A versioned random-forest model trained on PhysioNet Challenge 2012 Set A and evaluated once on official Set B
- Authenticated, patient-scoped ML inference with persisted model version, probability, threshold, input window, source, and feature snapshot
- Separate AI Analytics views for patients and professionals, including actual metrics, model comparison, global feature importance, and limitations

Historical physical-device work remains in Git and archival documentation, but provisioning is hidden from the submitted user experience. Clinical validation and real-patient evaluation remain explicitly out of scope. See [phase status](docs/phase-status.md) for the exact boundary.

## Architecture

```text
Software simulator → authenticated FastAPI ingestion
        → technical quality and duplicate checks
        → PostgreSQL sessions + measurement availability/quality metadata
             ├─ prototype rule-based assessment → internal alerts
             ├─ 48-hour HR/temperature summaries → versioned ML inference
             └─ historical measurements and dated trends
        → role-scoped FastAPI endpoints
        → patient and healthcare-professional React workspaces
```

The backend never treats simulator labels as ML ground truth. `PROTOTYPE_RULE_BASED` and `ML_CLASSIFIER_V1` remain separate persisted methods with different labels and claims.

## Repository

```text
backend/       FastAPI API, domain model, services, migrations, and tests
frontend/      React application and browser-level component tests
firmware/      Archived Phase 2 physical-device prototype
simulator/     Opt-in synthetic data generator
ml/            Reproducible acquisition, training, evaluation, reports, and model artifact
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

The complete Compose build, migration to revision `0003`, service startup, and health endpoints have been verified on Docker Desktop.

## Fast reviewer demo

1. Register or sign in as a healthcare professional.
2. Open **Patients**, create a patient profile, then open that patient.
3. Under **Generate simulated reading**, choose **Normal**, **Warning**, or **High risk**.
4. Show the four current readings, prototype assessment, and any alert.
5. Generate a second reading and open **Trends**. Select each colored metric tab to show its dated graph and unit.
6. Open **AI analytics** to show the real model card, held-out metrics, candidate comparison, explainability, limitations, and any eligible research inference.

Every synthetic session is labelled `SIMULATED`. The one-click control uses the real server pipeline but is restricted to an assigned healthcare professional.

The AI page will report inference as unavailable until the patient has a nearly complete 48-hour heart-rate and temperature history. It never substitutes the rule-based result while calling it ML.

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

See [ML methodology](docs/ml-methodology.md) for reproduction commands and [ML results](docs/ml-results.md) for the executed evaluation.

## Security and data claims

- Never commit `.env`, `pulsebridge_config.h`, Wi-Fi credentials, device credentials, JWT secrets, or certificates containing private keys.
- Simulator output is synthetic and must not be used to train, validate, or report final ML performance.
- Simulator respiratory rate is synthetic and must not be interpreted as a clinical measurement.
- The current `PROTOTYPE_RULE_BASED` assessment is replaceable decision-support plumbing, not AI diagnosis.
- `ML_CLASSIFIER_V1` predicts an ICU research outcome from HR and temperature only; it does not validate PulseBridge simulator readings or assess SpO₂/respiratory rate.

More detail: [API and security](docs/api-security.md), [architecture](docs/architecture/README.md), [phase status](docs/phase-status.md), and [ML limitations](docs/ml-limitations.md).

## Team

| Name | USN |
|---|---|
| Ayush Kumar Pandey | 20231ISE0057 |
| Ansit Pradhan | 20232ISE0058 |
| Muhammad Ahmed | 20231ISE0061 |

Literature sources are tracked in [docs/literature-review/references.md](docs/literature-review/references.md).
