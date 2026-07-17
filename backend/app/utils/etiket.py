import re
from collections import Counter
from typing import Any, Iterable, Optional

DEFAULT_ETIKET_DIGIT_LENGTH = 10
DEFAULT_ETIKET_PATTERN = rf"^\d{{{DEFAULT_ETIKET_DIGIT_LENGTH}}}$"


def infer_etiket_format(etikets: Iterable[str]) -> dict[str, Any]:
    """Excel etiket listesinden ortak formatı çıkar (ör. tam 10 haneli rakam)."""
    codes = [str(e).strip() for e in etikets if e and str(e).strip()]
    if not codes:
        return {
            "digit_length": DEFAULT_ETIKET_DIGIT_LENGTH,
            "pattern": DEFAULT_ETIKET_PATTERN,
        }

    numeric = [c for c in codes if c.isdigit()]
    if not numeric:
        return {
            "digit_length": DEFAULT_ETIKET_DIGIT_LENGTH,
            "pattern": DEFAULT_ETIKET_PATTERN,
        }

    length_counts = Counter(len(c) for c in numeric)
    dominant_length, dominant_count = length_counts.most_common(1)[0]

    if dominant_count == len(numeric) and len(length_counts) == 1:
        return {
            "digit_length": dominant_length,
            "pattern": rf"^\d{{{dominant_length}}}$",
        }

    if dominant_count >= len(numeric) * 0.95:
        return {
            "digit_length": dominant_length,
            "pattern": rf"^\d{{{dominant_length}}}$",
        }

    return {
        "digit_length": DEFAULT_ETIKET_DIGIT_LENGTH,
        "pattern": DEFAULT_ETIKET_PATTERN,
    }


def compile_etiket_pattern(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern)


def matches_etiket_format(code: str, pattern: re.Pattern[str]) -> bool:
    return bool(code and pattern.fullmatch(code))


def default_etiket_pattern() -> re.Pattern[str]:
    return compile_etiket_pattern(DEFAULT_ETIKET_PATTERN)


def normalize_etiket(val: Any) -> str:
    """Barkod okutulabilir etiket kodu — sayısal hücrelerde bilimsel gösterim/bozulma önlenir."""
    if val is None:
        return ""
    if isinstance(val, bool):
        return ""
    if isinstance(val, int):
        return str(val)
    if isinstance(val, float):
        if val == int(val):
            return str(int(val))
        return str(val).rstrip("0").rstrip(".")
    s = str(val).strip()
    if not s or s.lower() in ("none", "nan"):
        return ""
    if re.fullmatch(r"\d+\.0+", s):
        return s.split(".")[0]
    return s


def normalize_scanned_code(raw: str) -> str:
    """Okuyucudan gelen barkodu normalize eder."""
    code = raw.strip()
    if not code:
        return ""
    if re.fullmatch(r"\d+\.0+", code):
        return code.split(".")[0]
    return code
