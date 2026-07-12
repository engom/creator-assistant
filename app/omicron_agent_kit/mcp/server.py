"""MCP adapter — thin wrapper over the REST API, not a second implementation.

Every MCP tool call becomes one HTTP request to the API so auth, audit logging,
and billing metering all happen in exactly one place.

Install: uv pip install omicron-agent-kit[mcp]
Run:     python -m omicron_agent_kit.mcp.server

Note: the MCP spec revision (2026-07-28) introduces a stateless transport core.
Re-validate this adapter against that spec once it's final.
"""

import atexit
import os
import warnings

import httpx
from mcp.server.fastmcp import FastMCP

# Load .env so variables set only there are picked up.
# The MCP adapter is a separate process from the API server and cannot
# use get_settings() directly (API_KEYS is not required here).
# dotenv is already a transitive dep via pydantic-settings.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

API_BASE_URL = os.environ.get("OMICRON_API_BASE_URL", "http://localhost:8000")
API_KEY = os.environ.get("OMICRON_API_KEY", "")

if not API_KEY:
    warnings.warn(
        "OMICRON_API_KEY is not set — all MCP tool calls will be rejected with 401.",
        stacklevel=1,
    )

mcp = FastMCP("omicron-creator-agent")

_http_client = httpx.Client(
    base_url=API_BASE_URL,
    timeout=120.0,
    headers={"X-API-Key": API_KEY},
)
atexit.register(_http_client.close)


def _invoke(agent_name: str, payload: dict) -> dict:
    resp = _http_client.post(
        f"/v1/agents/{agent_name}/invoke",
        json={"input": payload},
    )
    resp.raise_for_status()
    return resp.json()


@mcp.tool()
def detect_new_post(
    creator_id: str, post_id: str, detected_at: str, platform: str = "tiktok"
) -> dict:
    """Detect a new creator post and get back an adaptive polling schedule (T+30/45/60/90 min).

    Args:
        creator_id:   Platform-scoped creator identifier.
        post_id:      Platform-scoped post identifier.
        detected_at:  ISO-8601 UTC timestamp when the post was detected.
        platform:     Platform slug, e.g. "tiktok".
    """
    return _invoke(
        "monitoring-agent",
        {
            "creator_id": creator_id,
            "post_id": post_id,
            "detected_at": detected_at,
            "platform": platform,
        },
    )["output"]


@mcp.tool()
def analyze_post_performance(
    creator_id: str,
    post_id: str,
    current_stats: dict,
    historical_baseline: dict,
    platform: str = "tiktok",
) -> dict:
    """Compute z-scores for a post's early stats against the creator's own rolling baseline.

    Args:
        creator_id:           Platform-scoped creator identifier.
        post_id:              Platform-scoped post identifier.
        current_stats:        Dict with keys: views, likes, comments, shares, retention_pct.
        historical_baseline:  Dict with keys: avg_*/std_* for each stat plus sample_size.
        platform:             Platform slug.
    """
    return _invoke(
        "analytics-agent",
        {
            "creator_id": creator_id,
            "post_id": post_id,
            "current_stats": current_stats,
            "historical_baseline": historical_baseline,
            "platform": platform,
        },
    )["output"]


@mcp.tool()
def generate_insight(
    current_stats: str,
    historical_baseline: str,
    creator_id: str = "",
    post_id: str = "",
    platform: str = "tiktok",
    signal: str = "",
) -> dict:
    """Turn early post stats vs rolling baseline into a grounded insight, urgency, and recommended action.

    Args:
        current_stats:        Stat string, e.g. "views=12400 likes=890 retention=38%".
        historical_baseline:  Baseline string, e.g. "avg_views=8900 avg_likes=610".
        creator_id:           Optional — passed through to output.
        post_id:              Optional — passed through to output.
        platform:             Optional — passed through to output.
        signal:               Optional — from analytics-agent: above_baseline | within_baseline | below_baseline.
    """
    return _invoke(
        "insight-agent",
        {
            "current_stats": current_stats,
            "historical_baseline": historical_baseline,
            "creator_id": creator_id,
            "post_id": post_id,
            "platform": platform,
            "signal": signal,
        },
    )["output"]


@mcp.tool()
def notify_creator(
    creator_id: str,
    post_id: str,
    urgency: str,
    insight: str,
    recommended_action: str = "",
    platform: str = "tiktok",
) -> dict:
    """Route a creator performance alert based on urgency level.

    low → log only (no dispatch). medium/high → notify creator.

    Args:
        creator_id:          Creator identifier.
        post_id:             Post identifier.
        urgency:             low | medium | high
        insight:             One-sentence comparative insight from insight-agent.
        recommended_action:  Recommended next step (required for high urgency).
        platform:            Platform slug.
    """
    return _invoke(
        "notification-agent",
        {
            "creator_id": creator_id,
            "post_id": post_id,
            "urgency": urgency,
            "insight": insight,
            "recommended_action": recommended_action,
            "platform": platform,
        },
    )["output"]


if __name__ == "__main__":
    mcp.run()
