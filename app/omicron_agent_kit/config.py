"""Central configuration.

Everything the API and the DSPy agents need is read from the
environment (or a local .env file). Nothing here is optional-but-
implicit: if a value is missing, callers get a clear error at
startup rather than a confusing failure mid-request.
"""

from functools import cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- LLM provider -------------------------------------------------
    # Supported: "anthropic/claude-*" and "bedrock/anthropic.claude-*".
    # DSPy 3.x uses LiteLLM-style "provider/model" strings.
    llm_model: str = Field(default="anthropic/claude-sonnet-4-6")
    anthropic_api_key: str | None = None
    aws_region: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    # --- TikTok platform adapter ----------------------------------------
    tiktok_client_id: str | None = Field(default=None, alias="TIKTOK_CLIENT_ID")
    tiktok_client_secret: str | None = Field(default=None, alias="TIKTOK_CLIENT_SECRET")
    tiktok_redirect_uri: str = Field(
        default="http://localhost:8000/auth/tiktok/callback",
        alias="TIKTOK_REDIRECT_URI",
    )

    # --- API auth -------------------------------------------------------
    # Comma-separated API keys, one per tenant, for local dev / early
    # pilots. Swap for a real identity provider before GA.
    # Set API_KEYS in .env — no default is provided so a missing value fails
    # loudly at startup rather than silently accepting a known public credential.
    api_keys_raw: str = Field(alias="API_KEYS")

    # --- Audit / EU AI Act compliance -----------------------------------
    audit_log_path: str = Field(default="./audit.log")

    # --- Database (Postgres) -----------------------------------------------
    # Required for DBOS durable workflows, baseline storage, audit, tokens.
    database_url: str = Field(
        default="postgresql://postgres:dev@localhost:5432/omicron",
        alias="DATABASE_URL",
    )

    # --- Agent execution timeout ----------------------------------------
    # Maximum wall-clock seconds for a single agent.run() call.
    # Raise HTTPException(504) if exceeded.
    agent_timeout_s: float = Field(default=120.0, alias="AGENT_TIMEOUT_S")

    # --- Compiled DSPy artifacts ----------------------------------------
    compiled_insight_path: str = Field(
        default="data/compiled/insight_agent.json",
        alias="COMPILED_INSIGHT_PATH",
    )

    @computed_field
    @property
    def api_keys(self) -> set[str]:
        return {k.strip() for k in self.api_keys_raw.split(",") if k.strip()}


@cache
def get_settings() -> Settings:
    return Settings()
