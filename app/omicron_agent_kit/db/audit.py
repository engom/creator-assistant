"""Postgres-backed audit logger — replaces file-based audit.log.

Satisfies EU AI Act Article 12 with proper indexed storage instead of
an append-only file. The interface matches the original AuditLogger so
the switch is transparent to route handlers.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from omicron_agent_kit.api.audit import _hash
from omicron_agent_kit.db.connection import get_pool


class PgAuditLogger:
    """Audit logger backed by Postgres audit_records table."""

    async def log(
        self,
        *,
        tenant_id: str,
        agent: str,
        input_payload: dict,
        output_payload: dict,
        latency_ms: float,
        model: str,
        status: str = "success",
        retriever_backend: str = "n/a",
    ) -> str:
        trace_id = uuid.uuid4()
        timestamp = datetime.now(timezone.utc)
        pool = await get_pool()
        await pool.execute(
            """
            INSERT INTO audit_records
                (trace_id, timestamp, tenant_id, agent, input_hash, output_hash,
                 latency_ms, model, status, retriever_backend)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            trace_id,
            timestamp,
            tenant_id,
            agent,
            _hash(input_payload),
            _hash(output_payload),
            round(latency_ms, 2),
            model,
            status,
            retriever_backend,
        )
        return str(trace_id)

    async def close(self) -> None:
        pass
