from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "PulseBridge RPM"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://rpm:change-me-locally@localhost:5432/rpm"
    jwt_secret: str = Field(
        default="development-only-secret-change-before-deployment", min_length=32
    )
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    frontend_origin: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
