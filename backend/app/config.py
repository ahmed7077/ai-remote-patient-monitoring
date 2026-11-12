from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "PulseBridge RPM"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://rpm:change-me-locally@localhost:5432/rpm"
    jwt_secret: str = Field(
        default="development-only-secret-change-before-deployment", min_length=32
    )
    device_ingestion_key: str = "development-device-ingestion-key"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    device_stale_minutes: int = Field(default=10, ge=1, le=1440)
    care_ai_provider: Literal["ollama", "gemini"] = "ollama"
    care_ai_api_key: SecretStr | None = None
    care_ai_url: str | None = None
    care_ai_model: str | None = None
    frontend_origin: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
