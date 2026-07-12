# MCP adapter — read this before touching this folder

This package is an **adapter, not a second product**. It exists so
partners who want their agents reachable as MCP tools can get that
without the core product depending on MCP's still-moving spec.

## Why API-first, MCP-as-adapter

- The next MCP spec revision (2026-07-28) is a stateless-core rewrite
  with breaking changes to the current release candidate. Building
  the core product on a spec mid-rewrite is a stability risk.
- MCP's authorization story is still maturing — there's no dedicated
  Enterprise Working Group yet, and early enterprise adopters found
  auth/governance features lacking. EU AI Act audit logging needs a
  contract we fully control, which is the REST API, not MCP.
- Enterprise demand for MCP is real and growing fast, so we ship it —
  just as a thin layer, not the foundation.

## Rules for this package

1. No business logic here. If you're about to import `dspy` or the
   agent registry in this folder, stop — that belongs in the API.
2. Every tool function calls the API over HTTP (see `server.py`).
   That's not a shortcut, it's the point: one code path for auth,
   audit, and billing, no matter which surface a partner uses.
3. Before adopting the 2026-07-28 spec as the target, confirm it has
   actually shipped (it's a release candidate as of this writing) and
   re-test the transport/auth assumptions in `server.py`.

## Running it

```bash
pip install -e ".[mcp]"
export OMICRON_API_BASE_URL="http://localhost:8000"
export OMICRON_API_KEY="dev-key-change-me"
python -m omicron_agent_kit.mcp.server
```

Requires the API (`omicron_agent_kit.api.main:app`) running separately.
