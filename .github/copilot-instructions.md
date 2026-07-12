# Copilot Instructions

This file guides AI coding agents working in the omicron-agent-kit repository.

## Product mindset

This is a **partner-deliverable starter kit**, not a SaaS product.
- Prioritize stability and auditability over novel features.
- Make changes small and composable; preserve the existing API contract.
- Favor clarity and adoption: changes should be easy to explain and safe to deploy.

## Key constraints

### Python packaging and environment
- Use `uv` for all dependency and environment management; never raw `pip`.
- Install with: `uv venv && source .venv/bin/activate && uv pip install -e ".[dev]"`.
- Test with: `API_KEYS=test-key uv run pytest tests/ -v`.
- Lint and format with: `ruff check app/ scripts/ tests/ --fix && ruff format app/ scripts/ tests/`.
- **Never** introduce ad-hoc environment variable access; use `get_settings()` from `config.py`.

### API and agent architecture
- The REST API in `app/omicron_agent_kit/api/` is the source of truth.
- Every agent must subclass `BaseAgent` and implement `_run()`.
- Register new agents in `app/omicron_agent_kit/api/routes/agents.py` to expose at `/v1/agents/{name}/invoke`.
- The MCP adapter is optional and should remain thin — no separate logic paths.
- Use `BaseAgent._load_compiled(program, path, label)` to load compiled DSPy artifacts — never copy-paste the try/except/elif loading block per-agent.
- Use `_coerce_bool(value)` from `agents/base.py` for any `bool` DSPy OutputField — bare `bool()` is wrong when DSPy returns the string `"False"`.

### Agents in this kit

| Agent slug | Class | Signature | Compiled artifact |
|---|---|---|---|
| `rag` | `RagAgent` | `AnswerWithContext` | `data/compiled/rag.json` |
| `esg-extractor` | `EsgExtractorAgent` | `EsgIndicator` | `data/compiled/esg_extractor.json` |
| `tool-react` | `ToolAgent` | `ToolReactSignature` | — |

### DSPy vocabulary rule
**"metric"** is a DSPy-owned term: it means a scoring/evaluation function (`contains_answer`, `extraction_correct`, the `metric=` argument to `MIPROv2`). Domain quantities extracted from ESG/financial documents are called **indicators** (`indicator_name` field, `EsgIndicator` Signature). Never name a domain field `metric_name`.

### DSPy signatures and modules
- Signatures live in `app/omicron_agent_kit/signatures/`, one class per file.
- Import signatures as `omicron_agent_kit.signatures.<name>`, never from bare `signatures` at the project root.
- Write explicit docstrings on signatures (the docstring becomes the LLM instruction prompt).
- All `ReAct` agents must use a proper `Signature` class, not an inline string like `"question -> answer"`.
- Avoid ad-hoc LLM or retriever logic in routes; keep provider wiring centralized in `llm/providers.py`.
- Refer to the [dspy-conventions skill](./.claude/skills/dspy-conventions/skill.md) when implementing DSPy code.

### Tools inside ReAct agents
- Declare a **module-level** `ThreadPoolExecutor` for sandboxed tool calls — never create one per invocation.
- Tools must have type hints and a docstring; exclude `**` from arithmetic allowlists (bignum DoS).

### Compilation (offline, via `scripts/compile.py`)
- Use `--agent rag` or `--agent esg-extractor` to select the target.
- Input keys per agent: `rag` → `("context", "question")`; `esg-extractor` → `("context", "indicator_name", "company")`.
- `split_examples()` shuffles before splitting — requires at least 4 examples.
- Compiled artifacts are loaded at startup via `COMPILED_RAG_PATH` / `COMPILED_ESG_EXTRACTOR_PATH` in `.env`.
- Makefile targets: `make compile-rag`, `make compile-esg`, `make compile-all`.

### Testing and imports
- Always pin test environment variables **before import** in `tests/` modules (see `tests/test_health.py`).
- The health endpoint returns `503 degraded` when `ANTHROPIC_API_KEY` is missing — preserve this behavior.
- `GET /v1/agents` requires a valid `X-API-Key` header (same as the invoke endpoint).
- Never rely on live LLM credentials or OpenSearch during test runs.

### Security and compliance
- `API_KEYS` has no default — the app refuses to start if it is unset.
- Agent invocations (including errors and timeouts) must all produce an audit record; use the `_audit_error` closure in `invoke_agent`, not direct `audit.log()` calls.
- Audit timestamps use microsecond ISO-8601 (`datetime.now(timezone.utc).isoformat(timespec="microseconds")`).
- The `_hash()` function in `audit.py` rejects Python `set` values (non-deterministic repr) — serialize to `list` before passing to the audit logger.

## Workflow

1. **Plan before editing**: Create a git branch and a brief plan if the change spans multiple files.
2. **Preserve contracts**: Always keep `BaseAgent.run()` and `/v1/agents/{name}/invoke` as public APIs.
3. **Verify locally**: Run `API_KEYS=test-key uv run pytest tests/ -v` after changes to confirm tests pass.
4. **Lint and format**: Use ruff to clean up code before committing.

## Reference

- **CLAUDE.md** — Detailed architecture, configuration table, and command reference.
- **README.md** — Quick start and compilation examples.
- **dspy-conventions skill** — In-depth DSPy Signature, Module, and Optimizer patterns.
