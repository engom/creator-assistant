"""Insight agent — stats delta → grounded language, urgency, and recommended action.

Uses DSPy ChainOfThought over the PostPerformanceInsight signature to translate
a creator's early performance delta into a one-sentence comparative insight plus
an urgency level and a concrete recommended action.

Required input fields:
    current_stats       (str) — e.g. "views=12400 likes=890 comments=134 shares=67 retention=38%"
    historical_baseline (str) — e.g. "avg_views=8900 avg_likes=610 avg_comments=88 avg_shares=41 avg_retention=31%"

Optional (passed through to output for chaining):
    creator_id  (str)
    post_id     (str)
    platform    (str)
    signal      (str) — from analytics-agent: above_baseline | within_baseline | below_baseline
"""

import dspy

from omicron_agent_kit.agents.base import BaseAgent
from omicron_agent_kit.signatures.post_performance_insight import PostPerformanceInsight


class InsightAgent(BaseAgent):
    """Turn early post stats vs rolling baseline into a grounded insight, urgency, and recommended action."""

    name = "insight-agent"

    @staticmethod
    def build_program() -> dspy.ChainOfThought:
        return dspy.ChainOfThought(PostPerformanceInsight)

    def __init__(self, compiled_path: str | None = None):
        self._program = InsightAgent.build_program()
        InsightAgent._load_compiled(self._program, compiled_path, "InsightAgent")

    def _run(self, inputs: dict) -> dict:
        current_stats = inputs.get("current_stats")
        historical_baseline = inputs.get("historical_baseline")

        if not current_stats:
            raise ValueError("current_stats is required")
        if not historical_baseline:
            raise ValueError("historical_baseline is required")

        prediction = self._program(
            current_stats=current_stats,
            historical_baseline=historical_baseline,
        )

        urgency = (getattr(prediction, "urgency", "") or "").strip().lower()
        if urgency not in ("low", "medium", "high"):
            urgency = "low"

        return {
            "creator_id": inputs.get("creator_id") or "",
            "post_id": inputs.get("post_id") or "",
            "platform": inputs.get("platform") or "tiktok",
            "signal": inputs.get("signal") or "",
            "insight": getattr(prediction, "insight", None) or "",
            "urgency": urgency,
            "recommended_action": getattr(prediction, "recommended_action", None) or "",
            "reasoning": getattr(prediction, "reasoning", None),
        }
