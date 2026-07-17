import os
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()


def _parse_origins(raw: str | None) -> list[str]:
    if raw is None:
        if _ENVIRONMENT == "production":
            return []
        return ["*"]
    value = raw.strip()
    if not value or value == "*":
        return ["*"]
    return [part.strip() for part in value.split(",") if part.strip()]


def _ensure_dir(path: Path) -> None:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


class Settings:
    app_name: str = os.getenv("APP_NAME", "Depo Sayım Sistemi")
    environment: str = _ENVIRONMENT
    secret_key: str = os.getenv("SECRET_KEY", "depo-sayim-dev-secret-change-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    cors_origins: list[str] = _parse_origins(os.getenv("ALLOWED_ORIGINS"))

    data_dir: Path = _DATA_DIR
    upload_dir: Path = (
        Path(os.getenv("UPLOAD_DIR"))
        if os.getenv("UPLOAD_DIR")
        else _DATA_DIR / "uploads"
    )
    report_dir: Path = (
        Path(os.getenv("REPORT_DIR"))
        if os.getenv("REPORT_DIR")
        else _DATA_DIR / "reports"
    )
    log_dir: Path = (
        Path(os.getenv("LOG_DIR"))
        if os.getenv("LOG_DIR")
        else (_DATA_DIR / "logs" if _ENVIRONMENT == "production" else Path("./logs"))
    )
    database_path: Path = Path(
        os.getenv("DATABASE_PATH", str(_DATA_DIR / "depo_sayim.db"))
    )
    static_dir: Path = Path(
        os.getenv("STATIC_DIR", str(_BACKEND_ROOT / "static"))
    )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()

_ensure_dir(settings.data_dir)
_ensure_dir(settings.upload_dir)
_ensure_dir(settings.report_dir)
_ensure_dir(settings.log_dir)
_ensure_dir(settings.database_path.parent)

if settings.is_production and settings.secret_key == "depo-sayim-dev-secret-change-in-production":
    raise RuntimeError(
        "Production ortamında SECRET_KEY ayarlanmalıdır. backend/.env.example dosyasına bakın."
    )
