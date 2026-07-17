from typing import Any


def normalize_depo(val: Any) -> str:
    """Depo/raf kodu — trim + uppercase, boş/null güvenli."""
    if val is None:
        return ""
    s = str(val).strip()
    if not s or s.lower() in ("none", "nan"):
        return ""
    return s.upper()
