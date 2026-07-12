"""Monitoring agent — detects new posts and schedules the adaptive polling sequence.

Phase 1 scope (TikTok only): receives a new-post event payload (from a webhook stub or
initial poll) and returns a polling schedule aligned with TikTok's real 30–90 min
algorithm window: T+30, T+45, T+60, T+90 min.

No LLM call is made here — detection and scheduling are deterministic. This agent
acts as the entry point that downstream agents (analytics, insight, notification) are
chained from.

Required input fields:
    creator_id  (str) — platform-scoped creator identifier
    post_id     (str) — platform-scoped post identifier
    platform    (str) — e.g. "tiktok" (Phase 1 only)
    detected_at (str) — ISO-8601 UTC timestamp of post detection
"""

from omicron_agent_kit.agents.base import BaseAgent
from omicron_agent_kit.platform.tiktok import _CHECKPOINT_OFFSETS_MIN


class MonitoringAgent(BaseAgent):
    """Detect a new creator post and emit the adaptive polling schedule for downstream agents."""

    name = "monitoring-agent"

    def _run(self, inputs: dict) -> dict:
        creator_id = inputs.get("creator_id")
        post_id = inputs.get("post_id")
        platform = inputs.get("platform", "tiktok")
        detected_at = inputs.get("detected_at")

        if not creator_id:
            raise ValueError("creator_id is required")
        if not post_id:
            raise ValueError("post_id is required")
        if not detected_at:
            raise ValueError("detected_at is required")

        return {
            "creator_id": creator_id,
            "post_id": post_id,
            "platform": platform,
            "detected_at": detected_at,
            "poll_offsets_min": list(_CHECKPOINT_OFFSETS_MIN),
            "status": "scheduled",
        }
