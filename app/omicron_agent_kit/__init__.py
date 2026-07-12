"""Omicron AI Labs — DSPy agent starter kit.

Architecture: API-first core (this package's `api` module) is the
source of truth for auth, billing metering, and EU AI Act audit
logging. The `mcp` submodule is a thin, optional adapter on top of
the API — it holds no business logic of its own. See mcp/README.md
for the rationale.
"""

__version__ = "0.1.0"
