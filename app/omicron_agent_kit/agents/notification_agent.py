"""Notification agent — dispatches creator alerts to Telegram / email.

Phase 1 scope: formats and routes the insight-agent output based on urgency.

  low    → no-op (log only)
  medium → notify creator (inform of performance signal)
  high   → notify creator with recommended action (positive: approval request for cross-post;
            negative: alert to moderate comments / review hook)

The actual transport (Telegram Bot API, SMTP, etc.) is injected via the `dispatch`
callable so the agent stays testable without live credentials.

Required input fields:
    creator_id         (str)
    post_id            (str)
    urgency            (str)  — low | medium | high
    insight            (str)
    recommended_action (str)

Optional:
    platform   (str)
    signal     (str)
"""

from collections.abc import Callable

from omicron_agent_kit.agents.base import BaseAgent


def _noop_dispatch(channel: str, message: str) -> dict:
    """Stub dispatcher: logs the call, returns a receipt. Replace with real transport."""
    return {"channel": channel, "status": "dispatched_noop", "preview": message[:120]}


class NotificationAgent(BaseAgent):
    """Route creator performance alerts based on urgency level (low → no-op, medium/high → notify)."""

    name = "notification-agent"

    def __init__(self, dispatch: Callable[[str, str], dict] | None = None):
        self._dispatch = dispatch or _noop_dispatch

    def _run(self, inputs: dict) -> dict:
        urgency = (inputs.get("urgency") or "low").strip().lower()
        creator_id = inputs.get("creator_id", "unknown")
        post_id = inputs.get("post_id", "unknown")
        insight = inputs.get("insight", "")
        recommended_action = inputs.get("recommended_action", "")
        platform = inputs.get("platform", "tiktok")

        if urgency == "low":
            return {
                "creator_id": creator_id,
                "post_id": post_id,
                "action": "log_only",
                "dispatched": False,
            }

        if urgency == "medium":
            message = f"[{platform.upper()}] Post {post_id}: {insight}"
        else:
            message = (
                f"[{platform.upper()}] Post {post_id}: {insight}\n\n"
                f"Recommended action: {recommended_action}"
            )

        receipt = self._dispatch("creator", message)

        return {
            "creator_id": creator_id,
            "post_id": post_id,
            "action": "notified",
            "dispatched": True,
            "urgency": urgency,
            "dispatch_receipt": receipt,
        }
