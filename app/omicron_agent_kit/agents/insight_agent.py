"""Insight agent — stats delta → grounded language, urgency, and recommended action.

Uses DSPy ChainOfThought over the PostPerformanceInsight signature to translate
a creator's early performance delta into a one-sentence comparative insight plus
an urgency level and a concrete recommended action.

Required input fields:
    current_stats       (str) — e.g. "views=12400 likes=890 comments=134 shares=67 retention=38%"
    historical_baseline (str) — e.g. "avg_views=8900 avg_likes=610 avg_comments=88 avg_shares=41 avg_retention=31%"

Optional:
    creator_id          (str)
    post_id             (str)
    platform            (str)
    signal              (str) — from analytics-agent: above_baseline | within_baseline | below_baseline
    checkpoint_history  (list[dict]) — prior checkpoints from db.checkpoints.get_checkpoints;
                         when provided, a HistGBR model is fitted and a T+60 forecast is
                         injected into the DSPy prompt as forecast_context
"""

from collections import OrderedDict

import dspy

from omicron_agent_kit.agents.base import BaseAgent
from omicron_agent_kit.api.schemas import InsightAgentInput
from omicron_agent_kit.ml.forecast import PostPerformanceForecast
from omicron_agent_kit.signatures.post_performance_insight import PostPerformanceInsight

_FORECAST_CACHE_MAX = 128
# Bounded LRU cache: (post_id, n_checkpoints) → forecast context string.
_forecast_cache: OrderedDict[tuple[str, int], str] = OrderedDict()


class InsightAgent(BaseAgent):
    """Turn early post stats vs rolling baseline into a grounded insight, urgency, and recommended action."""

    name = "insight-agent"
    input_schema = InsightAgentInput

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

        checkpoint_history = inputs.get("checkpoint_history") or []
        post_id = inputs.get("post_id") or ""
        n = len(checkpoint_history)
        cache_key = (post_id, n)
        if cache_key in _forecast_cache:
            _forecast_cache.move_to_end(cache_key)
        else:
            _forecast_cache[cache_key] = _build_forecast_context(
                current_stats=inputs.get("current_stats_dict") or current_stats,
                historical_baseline=inputs.get("historical_baseline_dict") or historical_baseline,
                checkpoint_history=checkpoint_history,
                signal=inputs.get("signal") or "within_baseline",
            )
            if len(_forecast_cache) > _FORECAST_CACHE_MAX:
                _forecast_cache.popitem(last=False)
        forecast_context = _forecast_cache[cache_key]

        prediction = self._program(
            current_stats=current_stats,
            historical_baseline=historical_baseline,
            forecast_context=forecast_context,
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
            "forecast_context": forecast_context,
        }


def _build_forecast_context(
    current_stats: dict | str,
    historical_baseline: dict | str,
    checkpoint_history: list[dict],
    signal: str,
) -> str:
    """Fit the forecaster on checkpoint history and return a context string.

    Accepts raw dicts (from analytics_agent's current_stats_dict /
    historical_baseline_dict) or formatted strings — the forecaster handles both.
    Returns an empty string when there is no checkpoint data — signals the LLM
    to omit the forecast section rather than citing generic benchmark ratios.
    """
    forecaster = PostPerformanceForecast()
    forecaster.fit(checkpoint_history, historical_baseline)
    result = forecaster.predict(current_stats, historical_baseline, signal)
    return result.context_str if result.is_meaningful else ""
