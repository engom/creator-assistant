from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Per-agent typed input models — registered in the OpenAPI schema so
# Swagger shows the correct field names and descriptions for each agent.
# ---------------------------------------------------------------------------


class MonitoringAgentInput(BaseModel):
    """Input for the `monitoring-agent`."""

    creator_id: str = Field(..., description="Platform-scoped creator identifier.")
    post_id: str = Field(..., description="Platform-scoped post identifier.")
    platform: str = Field(default="tiktok", description="Platform slug, e.g. 'tiktok'.")
    detected_at: str = Field(
        ...,
        description="ISO-8601 UTC timestamp when the post was detected, e.g. '2026-07-07T10:00:00Z'.",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "detected_at": "2026-07-07T10:00:00Z",
            }
        }
    }


class AnalyticsAgentInput(BaseModel):
    """Input for the `analytics-agent`."""

    creator_id: str = Field(..., description="Platform-scoped creator identifier.")
    post_id: str = Field(..., description="Platform-scoped post identifier.")
    platform: str = Field(default="tiktok", description="Platform slug.")
    current_stats: dict = Field(
        ...,
        description=(
            "Post stats at the current poll window. "
            "Keys: views, likes, comments, shares, retention_pct."
        ),
    )
    historical_baseline: dict = Field(
        ...,
        description=(
            "Creator's rolling baseline. Keys: avg_*/std_* for each stat plus sample_size."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "current_stats": {
                    "views": 12400,
                    "likes": 890,
                    "comments": 134,
                    "shares": 67,
                    "retention_pct": 38.0,
                },
                "historical_baseline": {
                    "avg_views": 8900.0,
                    "std_views": 2100.0,
                    "avg_likes": 610.0,
                    "std_likes": 180.0,
                    "avg_comments": 88.0,
                    "std_comments": 25.0,
                    "avg_shares": 41.0,
                    "std_shares": 12.0,
                    "avg_retention_pct": 31.0,
                    "std_retention_pct": 4.5,
                    "sample_size": 10,
                },
            }
        }
    }


class InsightAgentInput(BaseModel):
    """Input for the `insight-agent`."""

    current_stats: str = Field(
        ...,
        description="Post stats string, e.g. 'views=12400 likes=890 comments=134 shares=67 retention=38%'.",
    )
    historical_baseline: str = Field(
        ...,
        description="Creator baseline string, e.g. 'avg_views=8900 avg_likes=610 avg_comments=88'.",
    )
    creator_id: str = Field(default="", description="Optional — passed through to output.")
    post_id: str = Field(default="", description="Optional — passed through to output.")
    platform: str = Field(default="tiktok", description="Optional — passed through to output.")
    signal: str = Field(default="", description="Optional — from analytics-agent output.")

    model_config = {
        "json_schema_extra": {
            "example": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "signal": "above_baseline",
                "current_stats": "views=12400 likes=890 comments=134 shares=67 retention=38%",
                "historical_baseline": "avg_views=8900 avg_likes=610 avg_comments=88 avg_shares=41 avg_retention=31%",
            }
        }
    }


class NotificationAgentInput(BaseModel):
    """Input for the `notification-agent`."""

    creator_id: str = Field(..., description="Creator identifier.")
    post_id: str = Field(..., description="Post identifier.")
    urgency: str = Field(..., description="low | medium | high")
    insight: str = Field(..., description="One-sentence comparative insight from insight-agent.")
    recommended_action: str = Field(default="", description="Recommended next step.")
    platform: str = Field(default="tiktok", description="Platform slug.")
    signal: str = Field(default="", description="Optional — from analytics-agent output.")

    model_config = {
        "json_schema_extra": {
            "example": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "urgency": "high",
                "insight": "Your engagement rate at T+45 is 2.4× your 30-day average.",
                "recommended_action": "Cross-post to Instagram Reels — awaiting your approval.",
            }
        }
    }


# ---------------------------------------------------------------------------
# Named examples injected into the OpenAPI spec for the invoke endpoint.
# Swagger renders these as a dropdown so users can pick an agent and see
# the correct input shape without reading source code.
# ---------------------------------------------------------------------------

INVOKE_EXAMPLES: dict[str, dict] = {
    "monitoring-agent": {
        "summary": "monitoring-agent — detect new post and schedule polls",
        "description": "Register a new post and get back an adaptive polling schedule (T+30/45/60/90 min).",
        "value": {
            "input": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "detected_at": "2026-07-07T10:00:00Z",
            }
        },
    },
    "analytics-agent": {
        "summary": "analytics-agent — z-score vs rolling baseline",
        "description": "Compute z-scores for early post stats against the creator's own rolling baseline.",
        "value": {
            "input": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "current_stats": {
                    "views": 12400,
                    "likes": 890,
                    "comments": 134,
                    "shares": 67,
                    "retention_pct": 38.0,
                },
                "historical_baseline": {
                    "avg_views": 8900.0,
                    "std_views": 2100.0,
                    "avg_likes": 610.0,
                    "std_likes": 180.0,
                    "avg_comments": 88.0,
                    "std_comments": 25.0,
                    "avg_shares": 41.0,
                    "std_shares": 12.0,
                    "avg_retention_pct": 31.0,
                    "std_retention_pct": 4.5,
                    "sample_size": 10,
                },
            }
        },
    },
    "insight-agent": {
        "summary": "insight-agent — stats delta → grounded insight + urgency",
        "description": "Turn early post stats vs rolling baseline into a comparative insight, urgency level, and recommended action.",
        "value": {
            "input": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "signal": "above_baseline",
                "current_stats": "views=12400 likes=890 comments=134 shares=67 retention=38%",
                "historical_baseline": "avg_views=8900 avg_likes=610 avg_comments=88 avg_shares=41 avg_retention=31%",
            }
        },
    },
    "notification-agent": {
        "summary": "notification-agent — dispatch creator alert",
        "description": "Route a creator alert based on urgency (low → log only, medium/high → notify).",
        "value": {
            "input": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "urgency": "high",
                "insight": "Your engagement rate at T+45 is 2.4× your 30-day average.",
                "recommended_action": "Cross-post to Instagram Reels — awaiting your approval.",
            }
        },
    },
}


# ---------------------------------------------------------------------------
# Pipeline request / response models
# ---------------------------------------------------------------------------


class AnalyzePostRequest(BaseModel):
    """Single-shot pipeline request: one new post → monitoring → analytics → insight → notification."""

    creator_id: str = Field(..., description="Platform-scoped creator identifier.")
    post_id: str = Field(..., description="Platform-scoped post identifier.")
    platform: str = Field(default="tiktok", description="Platform slug, e.g. 'tiktok'.")
    detected_at: str = Field(
        ...,
        description="ISO-8601 UTC timestamp when the post was detected, e.g. '2026-07-07T10:00:00Z'.",
    )
    current_stats: dict = Field(
        ...,
        description=(
            "Post stats at the current poll window. "
            "Keys: views (int), likes (int), comments (int), shares (int), retention_pct (float)."
        ),
    )
    historical_baseline: dict = Field(
        ...,
        description=(
            "Creator's rolling baseline (last N posts). "
            "Keys: avg_views, std_views, avg_likes, std_likes, avg_comments, std_comments, "
            "avg_shares, std_shares, avg_retention_pct, std_retention_pct (all float), sample_size (int)."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
                "detected_at": "2026-07-07T10:00:00Z",
                "current_stats": {
                    "views": 12400,
                    "likes": 890,
                    "comments": 134,
                    "shares": 67,
                    "retention_pct": 38.0,
                },
                "historical_baseline": {
                    "avg_views": 8900.0,
                    "std_views": 2100.0,
                    "avg_likes": 610.0,
                    "std_likes": 180.0,
                    "avg_comments": 88.0,
                    "std_comments": 25.0,
                    "avg_shares": 41.0,
                    "std_shares": 12.0,
                    "avg_retention_pct": 31.0,
                    "std_retention_pct": 4.5,
                    "sample_size": 10,
                },
            }
        }
    }


class AnalyzePostResponse(BaseModel):
    """Full pipeline result for a single post analysis."""

    creator_id: str = Field(..., description="Creator identifier passed through from the request.")
    post_id: str = Field(..., description="Post identifier passed through from the request.")
    platform: str = Field(..., description="Platform slug.")
    poll_offsets_min: list[int] = Field(
        ..., description="Adaptive polling schedule offsets in minutes from detection time."
    )
    z_scores: dict = Field(
        ..., description="Z-score per stat (views, likes, comments, shares, retention_pct)."
    )
    signal: str = Field(
        ...,
        description="Primary signal: above_baseline | within_baseline | below_baseline | insufficient_data.",
    )
    insight: str = Field(
        ..., description="One-sentence comparative insight from the insight agent."
    )
    urgency: str = Field(..., description="Urgency level: low | medium | high.")
    recommended_action: str = Field(
        ..., description="Concrete next step recommended by the insight agent."
    )
    notification_dispatched: bool = Field(
        ..., description="True when medium/high urgency triggered a notification dispatch."
    )
    trace_ids: dict = Field(
        ..., description="Audit trace ID per agent stage (agent_name → trace_id)."
    )
    total_latency_ms: float = Field(
        ..., description="End-to-end pipeline wall-clock time in milliseconds."
    )


# ---------------------------------------------------------------------------
# API request / response models
# ---------------------------------------------------------------------------


class AgentInvokeRequest(BaseModel):
    """Invoke an agent.

    The shape of `input` depends on the agent selected in the URL path.
    Use the **Examples** dropdown in Swagger to see the correct payload
    for each agent.

    | agent                | required fields                              | optional fields          |
    |----------------------|----------------------------------------------|--------------------------|
    | `monitoring-agent`   | `creator_id`, `post_id`, `detected_at`       | `platform`               |
    | `analytics-agent`    | `creator_id`, `post_id`, `current_stats`, `historical_baseline` | `platform` |
    | `insight-agent`      | `current_stats`, `historical_baseline`       | `creator_id`, `post_id`, `platform`, `signal` |
    | `notification-agent` | `creator_id`, `post_id`, `urgency`, `insight`| `recommended_action`, `platform` |
    """

    input: dict[str, Any] = Field(
        ...,
        description=(
            "Agent-specific input payload. "
            "Select an example from the Swagger dropdown to see the correct shape."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "input": {
                    "creator_id": "creator_abc123",
                    "post_id": "post_xyz789",
                    "platform": "tiktok",
                    "detected_at": "2026-07-07T10:00:00Z",
                }
            }
        }
    }


class AgentInvokeResponse(BaseModel):
    agent: str = Field(..., description="Name of the agent that handled the request.")
    output: dict[str, Any] = Field(..., description="Agent-specific output payload.")
    latency_ms: float = Field(..., description="End-to-end agent execution time in milliseconds.")
    trace_id: str = Field(..., description="EU AI Act audit trace identifier.")


class AgentSummary(BaseModel):
    name: str
    description: str
