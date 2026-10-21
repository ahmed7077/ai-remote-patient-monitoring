from __future__ import annotations

import argparse
import hashlib
import shutil
import urllib.request
import zipfile
from pathlib import Path

BASE_URL = "https://physionet-open.s3.amazonaws.com/challenge-2012/1.0.0"
FILES = ("set-a.zip", "Outcomes-a.txt", "set-b.zip", "Outcomes-b.txt")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def acquire(destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        target = destination / name
        if not target.exists():
            with (
                urllib.request.urlopen(f"{BASE_URL}/{name}", timeout=120) as response,
                target.open("wb") as output,
            ):
                shutil.copyfileobj(response, output)
        print(f"{name}: {sha256(target)}")
        if target.suffix == ".zip":
            with zipfile.ZipFile(target) as archive:
                archive.extractall(destination)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download the open PhysioNet 2012 partitions")
    parser.add_argument("--destination", type=Path, default=Path("data/raw"))
    args = parser.parse_args()
    acquire(args.destination)


if __name__ == "__main__":
    main()
