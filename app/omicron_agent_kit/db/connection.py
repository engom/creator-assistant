"""Async connection pool for Postgres.

Provides a single shared pool created at app startup and closed at shutdown.
All database access goes through this pool — never create ad-hoc connections.
"""

from __future__ import annotations

import asyncpg

_pool: asyncpg.Pool | None = None


async def init_pool(database_url: str, *, min_size: int = 2, max_size: int = 10) -> asyncpg.Pool:
    global _pool
    _pool = await asyncpg.create_pool(database_url, min_size=min_size, max_size=max_size)
    return _pool


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized — call init_pool() at startup.")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
