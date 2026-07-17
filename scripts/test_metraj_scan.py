"""Metraj okutma — tekrar okutma miktarı şişirmemeli."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.services.count_service import CountService


def test_apply_metraj_scan_does_not_stack() -> None:
    expected = 52.5
    first = CountService._apply_metraj_scan(0.0, expected)
    assert first == expected, f"ilk okutma {expected} olmalı, got {first}"

    second = CountService._apply_metraj_scan(first, expected)
    assert second == expected, f"tekrar okutma {expected} kalmalı, got {second}"

    fifth = expected
    for _ in range(3):
        fifth = CountService._apply_metraj_scan(fifth, expected)
    assert fifth == expected, f"5. okutma sonrası hâlâ {expected} olmalı, got {fifth}"


if __name__ == "__main__":
    test_apply_metraj_scan_does_not_stack()
    print("OK: metraj tekrar okutma testi geçti")
