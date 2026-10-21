# Dataset provenance

PulseBridge uses **Predicting Mortality of ICU Patients: The PhysioNet/Computing in Cardiology Challenge 2012, version 1.0.0** for research-model development. The original publication is:

> Silva, I., Moody, G., Scott, D. J., Celi, L. A., & Mark, R. G. (2012). Predicting in-hospital mortality of ICU patients: The PhysioNet/Computing in Cardiology Challenge 2012. *Computing in Cardiology*, 39, 245–248.

- Official source: <https://physionet.org/content/challenge-2012/1.0.0/>
- Programmatic mirror: `https://physionet-open.s3.amazonaws.com/challenge-2012/1.0.0/`
- License: Open Data Commons Attribution License v1.0 (ODC-By 1.0)
- Access: open; no credential or data-use application is required
- Population: 12,000 adult ICU stays of at least 48 hours across cardiac, medical, surgical, and trauma ICUs
- Available labelled partitions used here: Set A (4,000 stays) and Set B (4,000 stays)
- Subject identifier: `RecordID`; the publication describes the first available ICU stay for each selected patient
- Genuine target: `In-hospital_death` (`0` survived hospitalization, `1` died in hospital)
- Observation window: the first 48 hours after ICU admission

The PulseBridge model intentionally uses only `HR` (heart rate, beats/min) and `Temp` (temperature, °C). Set A inspection found HR in 3,937/4,000 stays and temperature in 3,936/4,000 stays. Although the dataset also contains `SaO2` and `RespRate`, they occur in only 1,792 and 1,101 Set A stays respectively; just 171 stays contain all four PulseBridge vital families. Training a nominal four-vital model would therefore create a misleading completeness claim and a severe mismatch with the fully populated simulator.

## Reproducible acquisition

From `ml/` after installing the package:

```bash
python -m pulsebridge_ml.acquire --destination data/raw
```

Expected SHA-256 checksums for version 1.0.0:

| File | SHA-256 |
|---|---|
| `set-a.zip` | `1433638192fda622e8bb11a4559b8af2dbb1c69f0e1c3b5b606cc12aabd0a4c5` |
| `set-b.zip` | `54094c39631797af554ad4233164e004a699521351bd2f2bed50d6564ebc56dc` |
| `Outcomes-a.txt` | `2613ea60ccda29f87571a7d6b09ad130858a8ccd66325bd073365925026883c2` |
| `Outcomes-b.txt` | `1305f29734da374a809483229a99f33a9230aa8d4fa74b1a2d6ad788136423d5` |

Raw records are excluded from Git. Do not commit extracted ICU records or substitute simulator-generated labels.

## Data dictionary used by the model

| Field | Meaning | Unit |
|---|---|---|
| `RecordID` | Unique ICU-stay/patient record | identifier |
| `Time` | Elapsed time after ICU admission | `HH:MM` |
| `HR` | Heart rate | beats/min |
| `Temp` | Temperature | °C |
| `In-hospital_death` | Hospital outcome | 0/1 |

For each supported vital, the pipeline calculates minimum, maximum, mean, standard deviation, last observed value, linear slope per hour, and observation count. Missing values remain missing until the scikit-learn pipeline learns median imputation using training folds only.

## Inclusion, splitting, and limitations

- Include every labelled Set A/Set B record with its original target; do not select complete cases.
- Model comparison and threshold selection use Set A only with stratified five-fold cross-validation.
- Set B remains untouched until the selected pipeline is fitted on all of Set A and evaluated once.
- Each record contains one patient’s first available ICU stay, preventing cross-partition patient leakage under the published sampling design.
- The cohort is historical, adult, ICU-based, and highly imbalanced; it does not represent general remote-monitoring patients.
- Missingness and observation frequency can encode clinical workflow as well as physiology.
- The output is a research estimate of in-hospital mortality after a 48-hour ICU observation window. It is not contemporaneous vital status, diagnosis, or a claim of future deterioration in PulseBridge users.
