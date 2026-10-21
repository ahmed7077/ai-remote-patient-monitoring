from pathlib import Path

import numpy as np
import pytest

from pulsebridge_ml.dataset import load_partition, parse_elapsed_minutes, read_record


def write_record(path: Path, record_id: str) -> None:
    path.write_text(
        "Time,Parameter,Value\n"
        f"00:00,RecordID,{record_id}\n"
        "00:15,HR,70\n"
        "01:15,HR,80\n"
        "00:30,Temp,36.5\n",
        encoding="utf-8",
    )


def test_elapsed_time_parser() -> None:
    assert parse_elapsed_minutes("35:19") == 2119


def test_partition_loading_preserves_record_and_target_alignment(tmp_path: Path) -> None:
    records = tmp_path / "records"
    records.mkdir()
    write_record(records / "100.txt", "100")
    write_record(records / "200.txt", "200")
    outcomes = tmp_path / "outcomes.txt"
    outcomes.write_text(
        "RecordID,SAPS-I,SOFA,Length_of_stay,Survival,In-hospital_death\n"
        "200,1,1,3,-1,1\n100,1,1,3,-1,0\n",
        encoding="utf-8",
    )

    dataset = load_partition(records, outcomes)

    assert dataset.record_ids.tolist() == ["100", "200"]
    assert dataset.targets.tolist() == [0, 1]
    assert dataset.features.shape == (2, 14)
    assert np.array_equal(dataset.features[0], dataset.features[1], equal_nan=True)


def test_partition_rejects_missing_record(tmp_path: Path) -> None:
    outcomes = tmp_path / "outcomes.txt"
    outcomes.write_text(
        "RecordID,SAPS-I,SOFA,Length_of_stay,Survival,In-hospital_death\n100,1,1,3,-1,0\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Missing 1 record files"):
        load_partition(tmp_path, outcomes)


def test_negative_missing_sentinel_is_ignored(tmp_path: Path) -> None:
    record = tmp_path / "100.txt"
    record.write_text(
        "Time,Parameter,Value\n00:00,RecordID,100\n00:05,HR,-1\n",
        encoding="utf-8",
    )

    features = read_record(record)

    assert np.isnan(features[:6]).all()
    assert features[6] == 0.0
