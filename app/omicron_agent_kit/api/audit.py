"""Audit logging.

This is the piece most PoC-grade agent wrappers skip, and the one
EU AI Act Article 12 (record-keeping / logging for high-risk systems)
actually asks for: every agent invocation logged with enough detail
to reconstruct what happened, without storing raw user content by
default. Swap `write` for a real sink (a managed log store, a SIEM)
before production — this file-based version is for local dev only.
"""

import hashlib
import json
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


def _json_default(obj):
    # Reject sets: their str() repr is non-deterministic across PYTHONHASHSEED values.
    if isinstance(obj, set):
        raise TypeError(
            f"Object of type {type(obj).__name__} is not JSON serializable — convert to list first"
        )
    return str(obj)


def _hash(payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, default=_json_default).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


@dataclass
class AuditRecord:
    trace_id: str
    timestamp: str
    tenant_id: str
    agent: str
    input_hash: str
    output_hash: str
    latency_ms: float
    model: str
    status: str
    retriever_backend: str = "n/a"


class AuditLogger:
    def __init__(self, path: str):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self._path.open("a", encoding="utf-8", buffering=1)
        self._lock = threading.Lock()

    def log(
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
        record = AuditRecord(
            trace_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(timespec="microseconds"),
            tenant_id=tenant_id,
            agent=agent,
            input_hash=_hash(input_payload),
            output_hash=_hash(output_payload),
            latency_ms=round(latency_ms, 2),
            model=model,
            status=status,
            retriever_backend=retriever_backend,
        )
        line = json.dumps(asdict(record))
        with self._lock:
            self._fh.write(line + "\n")
        return record.trace_id

    def close(self) -> None:
        with self._lock:
            self._fh.close()
