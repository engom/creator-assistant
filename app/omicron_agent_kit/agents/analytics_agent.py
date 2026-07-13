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

_STAT_PAIRS = [
    ("views", "avg_views", "std_views"),
    ("likes", "avg_likes", "std_likes"),
    ("comments", "avg_comments", "std_comments"),
    ("shares", "avg_shares", "std_shares"),
    ("retention_pct", "avg_retention_pct", "std_retention_pct"),
]

_STAT_DISPLAY = [
    ("views", "avg_views"),
    ("likes", "avg_likes"),
    ("comments", "avg_comments"),
    ("shares", "avg_shares"),
    ("retention_pct", "avg_retention_pct"),
]

_DISPLAY_NAMES = {
    "views": "views",
    "avg_views": "avg_views",
    "likes": "likes",
    "avg_likes": "avg_likes",
    "comments": "comments",
    "avg_comments": "avg_comments",
    "shares": "shares",
    "avg_shares": "avg_shares",
    "retention_pct": "retention",
    "avg_retention_pct": "avg_retention",
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
            # Formatted strings ready to pass into PostPerformanceInsight
            "current_stats_str": current_str,
            "historical_baseline_str": baseline_str,
        }
