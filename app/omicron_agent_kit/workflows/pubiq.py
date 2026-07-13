"""Pub-IQ workflow — durable per-video monitoring at T+30, T+60, T+90 min.

Uses DBOS for durable execution: each checkpoint is a step, sleeps survive
process restarts. The workflow calls existing agents directly (no HTTP
round-trip) and persists results to Postgres.

Flow:
    1. Sleep until T+30 from detection
    2. Fetch TikTok metrics → compute z-score → save checkpoint
    3. If z exceeds threshold → run InsightAgent → send notification
    4. Sleep until T+60, repeat
    5. Sleep until T+90, repeat
    6. Welford-update the creator's rolling baseline

The LLM is only invoked when the math already decided to fire (z >= threshold).
Z-score computation is pure deterministic Python.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from functools import lru_cache
from typing import Any

from dbos import DBOS
from loguru import logger

from omicron_agent_kit.agents.analytics_agent import AnalyticsAgent
from omicron_agent_kit.agents.insight_agent import InsightAgent
from omicron_agent_kit.agents.notification_agent import NotificationAgent
from omicron_agent_kit.db import baselines, checkpoints
from omicron_agent_kit.platform.tiktok import TikTokStatsClient

_CHECKPOINT_OFFSETS_MIN = [30, 60, 90]

_MIN_SAMPLE_SIZE = 3

_THRESHOLDS = {
    30: 1.5,
    60: 1.5,
    90: 1.2,
}

# Module-level singletons — constructed once, reused across all DBOS step calls.
_analytics_agent = AnalyticsAgent()
_notification_agent = NotificationAgent()


@lru_cache(maxsize=4)
def _get_insight_agent(compiled_path: str | None) -> InsightAgent:
    """Return a cached InsightAgent for the given compiled artifact path."""
    return InsightAgent(compiled_path=compiled_path)


@dataclass
class PulseCheck:
    """Per-checkpoint result — shared by the workflow, DSPy signature, and notification payload."""

    creator_id: str
    post_id: str
    platform: str
    offset_min: int
    views: int
    likes: int
    comments: int
    shares: int
    retention_pct: float
    z_scores: dict[str, float | None]
    signal: str
    triggered: bool
    insight: str | None = None
    recommended_action: str | None = None


def _offset_delay_seconds(offset_min: int, elapsed_since_detection_s: float) -> float:
    """Seconds to sleep before this checkpoint, accounting for time already elapsed."""
    target_s = offset_min * 60
    remaining = target_s - elapsed_since_detection_s
    return max(remaining, 0)


@DBOS.step()
def fetch_metrics(creator_id: str, post_id: str, platform: str) -> dict[str, Any]:
    """Fetch current metrics from the platform API.

    Phase 1 stub: returns mock stats. Replace with real TikTokStatsClient
    once Research API approval lands.
    """
    stats = TikTokStatsClient.mock_stats(creator_id, post_id)
    return stats.to_dict()


@DBOS.step()
def compute_analytics(
    creator_id: str,
    post_id: str,
    platform: str,
    current_stats: dict,
    historical_baseline: dict,
) -> dict:
    """Run AnalyticsAgent synchronously — pure math, no I/O."""
    result = _analytics_agent.run(
        {
            "creator_id": creator_id,
            "post_id": post_id,
            "platform": platform,
            "current_stats": current_stats,
            "historical_baseline": historical_baseline,
        }
    )
    return result.output


@DBOS.step()
def generate_insight(
    current_stats_str: str,
    historical_baseline_str: str,
    creator_id: str,
    post_id: str,
    platform: str,
    signal: str,
    compiled_path: str | None = None,
) -> dict:
    """Run InsightAgent — single LLM call, only when z-score already triggered."""
    result = _get_insight_agent(compiled_path).run(
        {
            "creator_id": creator_id,
            "post_id": post_id,
            "platform": platform,
            "signal": signal,
            "current_stats": current_stats_str,
            "historical_baseline": historical_baseline_str,
        }
    )
    return result.output


@DBOS.step()
def send_notification(
    creator_id: str,
    post_id: str,
    platform: str,
    urgency: str,
    insight: str,
    recommended_action: str,
) -> dict:
    """Dispatch notification via NotificationAgent."""
    result = _notification_agent.run(
        {
            "creator_id": creator_id,
            "post_id": post_id,
            "platform": platform,
            "urgency": urgency,
            "insight": insight,
            "recommended_action": recommended_action,
        }
    )
    return result.output


@DBOS.step()
async def load_baseline(creator_id: str, platform: str) -> dict[str, baselines.BaselineStat]:
    """Load creator baseline from Postgres."""
    return await baselines.get_baseline(creator_id, platform)


@DBOS.step()
async def persist_checkpoint(
    *,
    creator_id: str,
    post_id: str,
    platform: str,
    offset_min: int,
    views: int,
    likes: int,
    comments: int,
    shares: int,
    retention_pct: float,
    z_scores: dict | None = None,
    signal: str | None = None,
) -> None:
    """Save a checkpoint snapshot to Postgres."""
    await checkpoints.save_checkpoint(
        creator_id=creator_id,
        post_id=post_id,
        platform=platform,
        offset_min=offset_min,
        views=views,
        likes=likes,
        comments=comments,
        shares=shares,
        retention_pct=retention_pct,
        z_scores=z_scores,
        signal=signal,
    )


@DBOS.step()
async def welford_update(creator_id: str, platform: str, stats: dict[str, float]) -> None:
    """Welford-update the creator's rolling baseline in Postgres."""
    await baselines.update_baseline(creator_id, platform, stats)


@DBOS.workflow()
async def pubiq_workflow(
    creator_id: str,
    post_id: str,
    platform: str = "tiktok",
    compiled_insight_path: str | None = None,
) -> list[dict]:
    """Durable per-video monitoring workflow.

    Sleeps to each checkpoint, fetches metrics, computes z-score, and fires
    the insight+notification chain only when the threshold is exceeded.
    Returns the list of PulseCheck results (one per checkpoint).
    """
    results: list[dict] = []
    elapsed_s = 0.0

    for offset_min in _CHECKPOINT_OFFSETS_MIN:
        delay = _offset_delay_seconds(offset_min, elapsed_s)
        if delay > 0:
            await DBOS.sleep_async(delay)
        elapsed_s = offset_min * 60.0

        metrics = fetch_metrics(creator_id, post_id, platform)

        baseline = await load_baseline(creator_id, platform)
        if not baseline or min(bs.count for bs in baseline.values()) < _MIN_SAMPLE_SIZE:
            pulse = PulseCheck(
                creator_id=creator_id,
                post_id=post_id,
                platform=platform,
                offset_min=offset_min,
                z_scores={},
                signal="insufficient_data",
                triggered=False,
                **metrics,
            )
            results.append(asdict(pulse))
            continue

        historical_input = baselines.baseline_to_agent_input(baseline)
        analytics_output = compute_analytics(
            creator_id, post_id, platform, metrics, historical_input
        )

        z_scores = analytics_output.get("z_scores", {})
        signal = analytics_output.get("signal", "within_baseline")

        views_z = z_scores.get("views")
        threshold = _THRESHOLDS.get(offset_min, 1.5)
        triggered = views_z is not None and abs(views_z) >= threshold

        pulse = PulseCheck(
            creator_id=creator_id,
            post_id=post_id,
            platform=platform,
            offset_min=offset_min,
            z_scores=z_scores,
            signal=signal,
            triggered=triggered,
            **metrics,
        )

        if triggered:
            current_str = analytics_output.get("current_stats_str", "")
            baseline_str = analytics_output.get("historical_baseline_str", "")

            try:
                insight_output = generate_insight(
                    current_stats_str=current_str,
                    historical_baseline_str=baseline_str,
                    creator_id=creator_id,
                    post_id=post_id,
                    platform=platform,
                    signal=signal,
                    compiled_path=compiled_insight_path,
                )
            except Exception as exc:
                logger.warning(
                    "InsightAgent failed for {post_id} at T+{offset}min: {exc}",
                    post_id=post_id,
                    offset=offset_min,
                    exc=exc,
                )
                insight_output = None

            if insight_output is not None:
                pulse.insight = insight_output.get("insight")
                pulse.recommended_action = insight_output.get("recommended_action")

                try:
                    send_notification(
                        creator_id=creator_id,
                        post_id=post_id,
                        platform=platform,
                        urgency=insight_output.get("urgency", "medium"),
                        insight=pulse.insight or "",
                        recommended_action=pulse.recommended_action or "",
                    )
                except Exception as exc:
                    logger.warning(
                        "Notification failed for {post_id} at T+{offset}min: {exc}",
                        post_id=post_id,
                        offset=offset_min,
                        exc=exc,
                    )

        await persist_checkpoint(
            creator_id=creator_id,
            post_id=post_id,
            platform=platform,
            offset_min=offset_min,
            views=metrics["views"],
            likes=metrics["likes"],
            comments=metrics["comments"],
            shares=metrics["shares"],
            retention_pct=metrics["retention_pct"],
            z_scores=z_scores,
            signal=signal,
        )

        results.append(asdict(pulse))
        await welford_update(creator_id, platform, metrics)

    return results
