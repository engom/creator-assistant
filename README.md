# Omicron Agent Kit

Production-grade DSPy agent starter kit — **Omicron AI Labs**.

API-first core. MCP exposed as a thin, optional adapter. See
`app/omicron_agent_kit/mcp/README.md` for why, in detail.

## Architecture

```
partner backend / your app
        │
        ▼
   REST API (source of truth: auth, audit log, billing)
   ├── /v1/agents            list available agents
   └── /v1/agents/{name}/invoke
        │
        ▼
   agent registry (BaseAgent → DSPy program)
   ├── rag               ChainOfThought over a pluggable retriever
   ├── esg-extractor     structured ESG/financial indicator extraction (value, unit, year, source)
   └── tool-react        ReAct with tool-calling

   ── optional ──
   MCP adapter (uv pip install -e ".[mcp]")
   calls the REST API over HTTP — no separate logic path
```

## Quick start

```bash
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
cp .env.example .env   # fill in ANTHROPIC_API_KEY (or AWS creds for Bedrock)

omicron-serve          # starts the API on :8000
# or: uvicorn omicron_agent_kit.api.main:app --reload
```

```bash
curl http://localhost:8000/health
curl http://localhost:8000/v1/agents
```

**Free-text question answering (RAG agent):**

```bash
curl -X POST http://localhost:8000/v1/agents/rag/invoke \
  -H "X-API-Key: change-me-before-deploy" -H "Content-Type: application/json" \
  -d '{"input": {"question": "What are LVMH GHG reduction targets?"}}'
```

**Structured ESG indicator extraction:**

```bash
curl -X POST http://localhost:8000/v1/agents/esg-extractor/invoke \
  -H "X-API-Key: change-me-before-deploy" -H "Content-Type: application/json" \
  -d '{"input": {"indicator_name": "Scope 1+2 GHG reduction target by 2030", "company": "LVMH"}}'
```

Returns:

```json
{
  "output": {
    "found": true,
    "value": "68",
    "unit": "%",
    "year": "2030",
    "source": "[LVMH URD 2025 (en) p49]",
    "sources_used": 4
  }
}
```

Run the test suite (no LLM credentials required):

```bash
API_KEYS=test-key uv run pytest tests/ -v
```

Lint and format:

```bash
ruff check app/ scripts/ tests/ --fix
ruff format app/ scripts/ tests/
```

## Adding an agent

1. Subclass `BaseAgent` in `app/omicron_agent_kit/agents/`.
2. Register it in `build_registry()` in `api/routes/agents.py`.
3. It's now reachable at `/v1/agents/{name}/invoke` — and, if you run
   the MCP adapter, add a matching `@mcp.tool()` wrapper in `mcp/server.py`.

## Compiling agents with DSPy optimizers

The bare `ChainOfThought`/`ReAct` programs in this kit are a starting
point, not the finished product — DSPy's value is in compiling them
against labeled examples for a partner's actual domain.

**Compile the RAG agent:**

```bash
python scripts/compile.py \
    --examples data/examples/cac40_rag_pilot.jsonl \
    --output   data/compiled/rag.json \
    --model    anthropic/claude-sonnet-4-6 \
    --effort   light \
    --train-fraction 0.7
```

Set `COMPILED_RAG_PATH=data/compiled/rag.json` in `.env` to load at startup.

**Compile the esg-extractor agent:**

```bash
python scripts/compile.py \
    --agent    esg-extractor \
    --examples data/examples/cac40_esg_extractor.jsonl \
    --output   data/compiled/esg_extractor.json \
    --model    anthropic/claude-sonnet-4-6 \
    --effort   medium \
    --train-fraction 0.7
```

Set `COMPILED_ESG_EXTRACTOR_PATH=data/compiled/esg_extractor.json` in `.env`.

The eval set (`cac40_esg_extractor.jsonl`) contains labeled examples covering
GHG targets, revenue, diversity ratios, R&D spend, and true-negative cases where the
indicator is absent from context. The `extraction_correct` DSPy metric rewards exact
numeric value match plus source citation.

> **Naming note**: `indicator_name` is the input field (not `metric_name`) to avoid
> collision with DSPy's own `metric=` vocabulary (evaluation/scoring functions).

## Provider configuration

Change `LLM_MODEL` in `.env` — no code changes needed:

| Provider | Example value |
|---|---|
| Anthropic (direct) | `anthropic/claude-sonnet-4-6` |
| AWS Bedrock | `bedrock/anthropic.claude-sonnet-4-6-v1:0` |

For Bedrock, also set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
and install the extra: `uv pip install -e ".[bedrock]"`.

## Roadmap notes

- v1 scope: RAG + structured ESG indicator extraction + tool-calling archetypes,
  EU AI Act–oriented audit logging, provider-agnostic LLM config, MCP adapter.
- Licensing model: code license + implementation sprint, not a SaaS
  wrapper — matches a solo-consultancy delivery model better.
- MCP: the next spec revision (2026-07-28) is a stateless-core
  rewrite. Re-validate `mcp/server.py` once that spec is final, not
  against the current release candidate.
