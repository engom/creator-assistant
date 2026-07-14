"""Analytics agent — rolling baseline and z-score computation.

Compares a post's current stats to the creator's rolling baseline (last N posts)
and returns a z-score per stat plus a summary delta. No LLM call — pure statistics.

The rolling baseline is passed in directly for Phase 1. In production this comes
from a Redis time-series store keyed by (creator_id, platform, stat_name).

Required input fields:
    creator_id          (str)   — platform-scoped creator identifier
    post_id             (str)   — platform-scoped post identifier
    platform            (str)   — e.g. "tiktok"
    current_stats       (dict)  — {'views': int, 'likes': int, 'comments': int,
                                    'shares': int, 'retention_pct': float}
    historical_baseline (dict)  — {'avg_views': float, 'std_views': float,
                                    'avg_likes': float, 'std_likes': float,
                                    'avg_comments': float, 'std_comments': float,
                                    'avg_shares': float, 'std_shares': float,
                                    'avg_retention_pct': float, 'std_retention_pct': float,
                                    'sample_size': int}
"""

from omicron_agent_kit.agents.base import BaseAgent
from omicron_agent_kit.stats import STAT_DISPLAY_ALIASES, STAT_NAMES

_STAT_PAIRS = [
    (s, f"avg_{s}", f"std_{s}") for s in STAT_NAMES
]

_STAT_DISPLAY = [
    (s, f"avg_{s}") for s in STAT_NAMES
]

# Display names for the formatted strings passed to DSPy prompts.
# Identical to canonical key except for the two aliases in STAT_DISPLAY_ALIASES.
_DISPLAY_NAMES: dict[str, str] = {
    key: STAT_DISPLAY_ALIASES.get(key, key)
    for s in STAT_NAMES
    for key in (s, f"avg_{s}")
}


def _z_score(value: float, mean: float, std: float) -> float | None:
    """Return z-score, or None when std is 0 (all historical values identical)."""
    if std == 0:
        return None
    return round((value - mean) / std, 2)


class AnalyticsAgent(BaseAgent):
    """Compute z-scores for a post's early stats against the creator's own rolling baseline."""

    name = "analytics-agent"

    def _run(self, inputs: dict) -> dict:
        creator_id = inputs.get("creator_id")
        post_id = inputs.get("post_id")
        platform = inputs.get("platform", "tiktok")
        current = inputs.get("current_stats")
        baseline = inputs.get("historical_baseline")

        if not creator_id:
            raise ValueError("creator_id is required")
        if not post_id:
            raise ValueError("post_id is required")
        if not current:
            raise ValueError("current_stats is required")
        if not baseline:
            raise ValueError("historical_baseline is required")

        sample_size = int(baseline.get("sample_size", 0))

        z_scores: dict[str, float | None] = {}
        if sample_size >= 3:
            for stat, avg_key, std_key in _STAT_PAIRS:
                val = current.get(stat)
                avg = baseline.get(avg_key)
                std = baseline.get(std_key)
                if val is not None and avg is not None and std is not None:
                    z_scores[stat] = _z_score(float(val), float(avg), float(std))

        # Primary signal: views z-score drives the urgency decision in the next stage.
        views_z = z_scores.get("views")
        if sample_size < 3 or views_z is None:
            signal = "insufficient_data"
        elif views_z >= 1.5:
            signal = "above_baseline"
        elif views_z <= -1.5:
            signal = "below_baseline"
        else:
            signal = "within_baseline"

        def _fmt_val(key: str, val) -> str:
            if key in ("retention_pct", "avg_retention_pct"):
                return f"{float(val):.0f}%"
            return str(val)

        current_str = " ".join(
            f"{_DISPLAY_NAMES[stat]}={_fmt_val(stat, current[stat])}"
            for stat, _ in _STAT_DISPLAY
            if current.get(stat) is not None
        )
        baseline_str = " ".join(
            f"{_DISPLAY_NAMES[avg_key]}={_fmt_val(avg_key, baseline[avg_key])}"
            for _, avg_key in _STAT_DISPLAY
            if baseline.get(avg_key) is not None
        )

        return {
            "creator_id": creator_id,
            "post_id": post_id,
            "platform": platform,
            "z_scores": z_scores,
            "signal": signal,
            "sample_size": baseline.get("sample_size", 0),
            # Formatted strings ready to pass into PostPerformanceInsight (DSPy)
            "current_stats_str": current_str,
            "historical_baseline_str": baseline_str,
            # Raw numeric dicts for the ML forecaster (avoids string round-trip)
            "current_stats_dict": {k: v for k, v in current.items() if k in STAT_NAMES},
            "historical_baseline_dict": {k: v for k, v in baseline.items() if k != "sample_size"},
        }
