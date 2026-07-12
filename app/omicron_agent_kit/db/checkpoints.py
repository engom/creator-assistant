"""Post checkpoint repository — immutable time-series of per-video metrics snapshots."""

from __future__ import annotations

import json

import asyncpg

from omicron_agent_kit.db.connection import get_pool


async def save_checkpoint(
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
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO post_checkpoints
            (creator_id, post_id, platform, offset_min,
             views, likes, comments, shares, retention_pct,
             z_scores, signal, fetched_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, now())
        """,
        creator_id,
        post_id,
        platform,
        offset_min,
        views,
        likes,
        comments,
        shares,
        retention_pct,
        json.dumps(z_scores) if z_scores else None,
        signal,
    )


async def get_checkpoints(
    creator_id: str, post_id: str, platform: str = "tiktok"
) -> list[asyncpg.Record]:
    pool = await get_pool()
    return await pool.fetch(
        """
        SELECT offset_min, views, likes, comments, shares, retention_pct,
               z_scores, signal, fetched_at
        FROM post_checkpoints
        WHERE creator_id = $1 AND post_id = $2 AND platform = $3
        ORDER BY offset_min
        """,
        creator_id,
        post_id,
        platform,
    )
