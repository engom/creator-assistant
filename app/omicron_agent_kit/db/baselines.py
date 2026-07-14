"""Creator baseline repository — Welford online mean/variance.

Each creator×platform×stat maintains an incremental (count, mean, M2) triple.
Variance = M2 / count; std = sqrt(variance). This avoids recomputing over full
history after every video — O(1) update, O(1) read.

Reference: Welford (1962), "Note on a method for calculating corrected sums of
squares and products."
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import asyncpg

from omicron_agent_kit.db.connection import get_pool
from omicron_agent_kit.stats import STAT_NAMES as _STAT_NAMES


@dataclass
class BaselineStat:
    count: int
    mean: float
    std: float


async def get_baseline(creator_id: str, platform: str = "tiktok") -> dict[str, BaselineStat]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT stat_name, count, mean, m2
        FROM creator_baselines
        WHERE creator_id = $1 AND platform = $2
        """,
        creator_id,
        platform,
    )
    result: dict[str, BaselineStat] = {}
    for row in rows:
        count = row["count"]
        mean = row["mean"]
        m2 = row["m2"]
        std = math.sqrt(m2 / count) if count > 1 else 0.0
        result[row["stat_name"]] = BaselineStat(count=count, mean=mean, std=std)
    return result


def baseline_to_agent_input(baseline: dict[str, BaselineStat]) -> dict:
    """Convert BaselineStat dict to the shape AnalyticsAgent expects."""
    out: dict[str, float | int] = {}
    min_count = float("inf")
    for stat_name, bs in baseline.items():
        out[f"avg_{stat_name}"] = bs.mean
        out[f"std_{stat_name}"] = bs.std
        min_count = min(min_count, bs.count)
    out["sample_size"] = int(min_count) if min_count != float("inf") else 0
    return out


async def update_baseline(
    creator_id: str,
    platform: str,
    stats: dict[str, float],
) -> None:
    """Welford-update the baseline for each stat in the provided dict."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for stat_name in _STAT_NAMES:
                value = stats.get(stat_name)
                if value is None:
                    continue
                await _welford_upsert(conn, creator_id, platform, stat_name, float(value))


async def _welford_upsert(
    conn: asyncpg.Connection,
    creator_id: str,
    platform: str,
    stat_name: str,
    value: float,
) -> None:
    """Insert or Welford-update a single stat row."""
    await conn.execute(
        """
        INSERT INTO creator_baselines (creator_id, platform, stat_name, count, mean, m2, updated_at)
        VALUES ($1, $2, $3, 1, $4, 0.0, now())
        ON CONFLICT (creator_id, platform, stat_name)
        DO UPDATE SET
            count = creator_baselines.count + 1,
            mean = creator_baselines.mean
                   + ($4 - creator_baselines.mean) / (creator_baselines.count + 1),
            m2 = creator_baselines.m2
                 + ($4 - creator_baselines.mean)
                   * ($4 - (creator_baselines.mean
                            + ($4 - creator_baselines.mean) / (creator_baselines.count + 1))),
            updated_at = now()
        """,
        creator_id,
        platform,
        stat_name,
        value,
    )
