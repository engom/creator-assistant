"""OAuth token store — Postgres-backed replacement for InMemoryTokenStore."""

from __future__ import annotations

from datetime import datetime, timezone

from omicron_agent_kit.db.connection import get_pool


async def store_tokens(
    creator_id: str,
    platform: str,
    access_token: str,
    refresh_token: str,
    expires_at: datetime,
    open_id: str | None = None,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO oauth_tokens
            (creator_id, platform, access_token, refresh_token, expires_at, open_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (creator_id, platform)
        DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            open_id = EXCLUDED.open_id,
            updated_at = now()
        """,
        creator_id,
        platform,
        access_token,
        refresh_token,
        expires_at,
        open_id,
    )


async def get_tokens(creator_id: str, platform: str = "tiktok") -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT access_token, refresh_token, expires_at, open_id
        FROM oauth_tokens
        WHERE creator_id = $1 AND platform = $2
        """,
        creator_id,
        platform,
    )
    if row is None:
        return None
    return {
        "access_token": row["access_token"],
        "refresh_token": row["refresh_token"],
        "expires_at": row["expires_at"].isoformat(),
        "open_id": row["open_id"],
    }


async def is_token_expired(creator_id: str, platform: str = "tiktok") -> bool:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT expires_at FROM oauth_tokens WHERE creator_id = $1 AND platform = $2",
        creator_id,
        platform,
    )
    if row is None:
        return True
    return row["expires_at"] < datetime.now(timezone.utc)


async def delete_tokens(creator_id: str, platform: str = "tiktok") -> None:
    pool = await get_pool()
    await pool.execute(
        "DELETE FROM oauth_tokens WHERE creator_id = $1 AND platform = $2",
        creator_id,
        platform,
    )
