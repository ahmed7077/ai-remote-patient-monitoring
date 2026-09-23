# PulseBridge — AI-Powered Remote Patient Monitoring

PulseBridge is a software-first academic Remote Patient Monitoring prototype. It collects explicitly synthetic vital measurements through a device-agnostic REST pipeline, performs technical data-quality checks, persists history, runs a clearly labelled prototype rule-based risk assessment, and presents role-scoped patient and healthcare-professional experiences.

> This is not a medical device, diagnosis system, or clinically validated risk model. Simulator output is synthetic and must never be used to train, validate, or report the performance of the final ML model.

## Phase status

**PHASE 1 — SOFTWARE PROTOTYPE (approximately 50%)**

Implemented:

- Full-stack FastAPI and React foundation
- PostgreSQL persistence and Alembic migration
- Argon2id authentication, JWT access tokens, rotating refresh tokens, and RBAC
- Separate User, Patient, professional assignment, Device, Session, Measurement, Risk, Alert, and Audit concepts
- Assigned-patient authorization boundaries
- Simulator registration and authenticated, device-agnostic REST ingestion
- Technical quality states: `VALID`, `SUSPECT`, `INVALID`
- Historical measurements and genuine empty states
- Replaceable `PrototypeRuleBasedRiskAssessmentService`
- Internal alert generation and professional acknowledgement
- Security audit events for material actions
- Responsive patient and professional interfaces using real API data
- Docker Compose environment, free GitHub Actions CI, and ML research scaffold

Remaining for Phase 2:

- Physical ESP32, MAX30102, temperature, and blood-pressure integration
- Firmware, stronger per-device credentials, and optional MQTT evaluation
- Real physiological dataset and research target/window/labels
- Logistic Regression, SVM, Random Forest, and XGBoost experiments
- Comparison, error analysis, tuning, SHAP, and final ML integration
- Advanced hardening, performance testing, deployment, and physical validation

## Architecture

```text
Intentional synthetic simulator
        → authenticated REST adapter
        → VitalIngestionService
        → technical quality checks
        → PostgreSQL history
             ├─ prototype risk assessment → alerts
             └─ historical measurements
        → FastAPI /api/v1
        → patient and professional React experiences
```

The ingestion service is transport-independent so a future ESP32 REST client or MQTT adapter can reuse its validation and persistence logic.

## Stack and structure

- React 19, TypeScript, Vite, React Router, TanStack Query, Recharts, Tailwind CSS
- Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, psycopg 3
- PostgreSQL 16, Docker Compose, pytest, Ruff, mypy, ESLint, Vitest, GitHub Actions
- Entirely local, free, and open-source; no paid API or hosted service is required

```text
backend/       API, models, services, migrations, tests
frontend/      responsive React product interface
simulator/     opt-in synthetic device process
ml/            Phase 2 research scaffold and guardrails
docs/          architecture, planning, literature review
.github/       free CI workflow
compose.yaml   frontend, backend, PostgreSQL
```

## Docker setup

Prerequisites: Docker Desktop with Compose. Copy `.env.example` to `.env` and replace every development secret.

```bash
docker compose up --build
```

The backend applies `alembic upgrade head` on startup. Open the frontend at `http://localhost:5173`, API documentation at `http://localhost:8000/docs`, and health endpoint at `http://localhost:8000/health`.

Docker was unavailable on the implementation machine, so the configuration is supplied but the composed runtime still needs verification on a Docker-enabled host.

## Native development and checks

```bash
python -m venv .venv
.venv/Scripts/pip install -e "backend[dev]"
cd backend
alembic upgrade head
uvicorn app.main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

```bash
ruff check backend simulator
ruff format --check backend simulator
mypy backend/app
pytest backend simulator -q
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
```

## Demo workflow

1. Register healthcare-professional and patient accounts.
2. Create a synthetic patient through `POST /api/v1/patients` and link the patient user ID.
3. Register a `SIMULATOR` device through `POST /api/v1/devices`.
4. Run the simulator intentionally:

```bash
python simulator/simulator.py --device-key YOUR_DEVICE_INGESTION_KEY --device-uid SIM-DEMO-001 --scenario normal
```

Use `--scenario warning`, `--scenario high-risk`, or `--once` for controlled demonstrations. Stop with Ctrl+C. The simulator always labels data `SIMULATED`; it does not start automatically or fabricate dashboard history.

## Security, quality, and risk

Passwords use Argon2id. Access tokens are short lived; opaque refresh tokens are hashed at rest and rotated. Patients see only their linked record. Professionals see only explicitly assigned patients. The development ingestion key protects the simulator endpoint; stronger per-device credentials remain Phase 2 work. Secrets belong in `.env`, ignored by Git.

Audit events cover registration, login/logout, patient creation/assignment, device registration, viewing vitals, and alert acknowledgement. Passwords, tokens, and vital payloads are not stored in audit metadata.

`DataQualityService` checks expected units, broad structural ranges, stale timestamps, and duplicate sessions. These are software checks—not clinical validation. The temporary risk service centralizes demonstration thresholds and stores `assessment_method=PROTOTYPE_RULE_BASED`. The interface does not describe it as AI diagnosis or clinical prediction.

## Team and limitations

| Name | USN |
|---|---|
| Ayush Kumar Pandey | 20231ISE0057 |
| Ansit Pradhan | 20232ISE0058 |
| Muhammad Ahmed | 20231ISE0061 |

Literature sources remain in [docs/literature-review/references.md](docs/literature-review/references.md).

This phase has no physical sensors, real patient records, final ML dataset/model, clinical validation, certification, external notifications, deployment, or real-world healthcare usage. Use only synthetic identities and measurements.
