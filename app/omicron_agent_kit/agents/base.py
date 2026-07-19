"""Base agent contract.

Every agent in this kit exposes the same `run(inputs: dict) -> dict`
shape regardless of what DSPy module it wraps internally. This is
what lets the API layer (and, later, the MCP wrapper) treat every
agent identically instead of special-casing each one.
"""

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from loguru import logger

if TYPE_CHECKING:
    from pydantic import BaseModel


@dataclass
class AgentResult:
    output: dict[str, Any]
    latency_ms: float


def _coerce_bool(value: Any) -> bool:
    """Coerce a DSPy OutputField bool value that may arrive as a string.

    DSPy occasionally returns the string "False" when bool coercion of a
    malformed LM response fails. bool("False") == True in Python, so a
    plain bool() cast is wrong. This function handles the string case
    explicitly so all agents with bool output fields behave consistently.
    """
    if isinstance(value, str):
        return value.strip().lower() not in ("false", "0", "", "no", "none")
    return bool(value)


class BaseAgent(ABC):
    """Subclass this and implement `_run`. `run` adds timing for free."""

    name: str
    input_schema: "type[BaseModel] | None" = None

    @abstractmethod
    def _run(self, inputs: dict[str, Any]) -> dict[str, Any]: ...

    def run(self, inputs: dict[str, Any]) -> AgentResult:
        if self.input_schema is not None:
            self.input_schema.model_validate(inputs)
        start = time.perf_counter()
        output = self._run(inputs)
        latency_ms = (time.perf_counter() - start) * 1000
        return AgentResult(output=output, latency_ms=latency_ms)

    @staticmethod
    def _load_compiled(program: Any, path: str | None, label: str) -> None:
        """Load a compiled DSPy artifact into program in-place, with fallback logging."""
        if not path:
            return
        if Path(path).exists():
            try:
                program.load(path)
                logger.info("Loaded compiled {label} artifact: {path}", label=label, path=path)
            except Exception as exc:
                logger.warning(
                    "Failed to load compiled {label} artifact at {path} ({exc})"
                    " — using bare program",
                    label=label,
                    path=path,
                    exc=exc,
                )
        else:
            logger.warning(
                "Compiled {label} artifact not found at {path} — using bare program",
                label=label,
                path=path,
            )
