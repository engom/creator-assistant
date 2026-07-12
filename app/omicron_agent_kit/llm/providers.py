"""LLM provider abstraction.

DSPy 3.x already speaks LiteLLM's unified "provider/model" strings,
so this module is intentionally thin: its job is to read the model
string once from settings, fail loudly if the matching credential is
missing, and hand back a single configured dspy.LM. Agents never
import a provider SDK directly.

Supported providers in this version: Anthropic, Amazon Bedrock.
"""

import os

import dspy

from omicron_agent_kit.config import Settings, get_settings


def build_lm(settings: Settings | None = None) -> dspy.LM:
    settings = settings or get_settings()
    model = settings.llm_model

    if model.startswith("anthropic/") and not settings.anthropic_api_key:
        raise RuntimeError("LLM_MODEL is anthropic/* but ANTHROPIC_API_KEY is not set.")
    if model.startswith("bedrock/"):
        if not settings.aws_region:
            raise RuntimeError("LLM_MODEL is bedrock/* but AWS_REGION is not set.")
        # boto3 is an optional extra — fail loudly here rather than mid-request.
        try:
            import boto3  # noqa: F401
        except ImportError:
            raise RuntimeError(
                "LLM_MODEL is bedrock/* but boto3 is not installed. "
                "Run: uv pip install 'omicron-agent-kit[bedrock]'"
            )
        # LiteLLM/boto3 reads credentials from os.environ directly, not
        # from the Settings object. Propagate here so pydantic-settings
        # .env loading is honoured even when variables were not exported.
        os.environ.setdefault("AWS_REGION", settings.aws_region)
        if settings.aws_access_key_id:
            os.environ.setdefault("AWS_ACCESS_KEY_ID", settings.aws_access_key_id)
        if settings.aws_secret_access_key:
            os.environ.setdefault("AWS_SECRET_ACCESS_KEY", settings.aws_secret_access_key)

    return dspy.LM(model, num_retries=3)


def configure_dspy(settings: Settings | None = None) -> dspy.LM:
    """Configure the global DSPy context with the active LM and return it."""
    lm = build_lm(settings)
    dspy.configure(lm=lm)
    return lm
