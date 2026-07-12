"""API entrypoint.

The MCP wrapper in `omicron_agent_kit.mcp` talks to this API over HTTP like any
other client — it never imports the agent registry directly — so auth, audit
logging, and billing metering all happen in exactly one place regardless of
which surface is used to reach an agent.
"""

from contextlib import asynccontextmanager

from dbos import DBOS, DBOSConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from omicron_agent_kit.api.audit import AuditLogger
from omicron_agent_kit.api.routes import agents, auth, health, pipeline, workflows
from omicron_agent_kit.api.routes.agents import build_registry
from omicron_agent_kit.api.schemas import (
    AnalyticsAgentInput,
    AnalyzePostRequest,
    AnalyzePostResponse,
    InsightAgentInput,
    MonitoringAgentInput,
    NotificationAgentInput,
)
from omicron_agent_kit.config import get_settings
from omicron_agent_kit.db.connection import close_pool, init_pool
from omicron_agent_kit.llm.providers import configure_dspy
from omicron_agent_kit.workflows import (
    pubiq as _pubiq_workflows,  # noqa: F401 — registers DBOS workflows
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.audit_logger = AuditLogger(settings.audit_log_path)

    # Initialize Postgres connection pool
    app.state.db_pool = None
    try:
        app.state.db_pool = await init_pool(settings.database_url)
        logger.info("Postgres pool initialized: {url}", url=settings.database_url.split("@")[-1])
    except Exception as exc:
        logger.warning("Postgres pool failed to initialize ({exc}) — DB features disabled", exc=exc)

    # Launch DBOS runtime (instance created at app construction time)
    app.state.dbos_ready = False
    if app.state.db_pool is not None:
        try:
            DBOS.launch()
            app.state.dbos_ready = True
            logger.info("DBOS workflow runtime launched")
        except Exception as exc:
            logger.warning("DBOS launch failed ({exc}) — workflow features disabled", exc=exc)

    app.state.lm_error = None
    try:
        configure_dspy(settings)
    except RuntimeError as exc:
        app.state.lm_error = str(exc)

    app.state.agent_registry = build_registry(settings)
    yield
    app.state.audit_logger.close()
    if app.state.dbos_ready:
        DBOS.destroy()
    await close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Omicron Creator Agent API",
        description=(
            "AI operations agent for creator teams — Omicron AI Labs.\n\n"
            "## Agents\n\n"
            "| Agent | Input fields | Description |\n"
            "|---|---|---|\n"
            "| `monitoring-agent` | `creator_id`, `post_id`, `detected_at` | Detect new post, return adaptive polling schedule |\n"
            "| `analytics-agent` | `creator_id`, `post_id`, `current_stats`, `historical_baseline` | Z-score vs creator's own rolling baseline |\n"
            "| `insight-agent` | `current_stats`, `historical_baseline` | Stats delta → grounded insight, urgency, recommended action |\n"
            "| `notification-agent` | `creator_id`, `post_id`, `urgency`, `insight` | Route alert by urgency (low → log, medium/high → notify) |\n\n"
            "Use the **Examples** dropdown on the `/invoke` endpoint to see the correct payload for each agent."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    # DBOS must be instantiated before the app starts (it adds middleware).
    try:
        DBOS(
            config=DBOSConfig(
                name="omicron-creator-agent",
                database_url=settings.database_url,
            ),
            fastapi=app,
        )
    except Exception as exc:
        logger.warning("DBOS init skipped ({exc}) — workflow features disabled", exc=exc)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(agents.router)
    app.include_router(pipeline.router)
    app.include_router(workflows.router)

    _original_openapi = app.openapi

    def _patched_openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        schema = _original_openapi()
        components = schema.setdefault("components", {})
        schemas = components.setdefault("schemas", {})
        for model in (
            MonitoringAgentInput,
            AnalyticsAgentInput,
            InsightAgentInput,
            NotificationAgentInput,
            AnalyzePostRequest,
            AnalyzePostResponse,
        ):
            model_schema = model.model_json_schema()
            if "json_schema_extra" in model.model_config:
                extra = model.model_config["json_schema_extra"]
                if "example" in extra:
                    model_schema["example"] = extra["example"]
            schemas[model.__name__] = model_schema
        app.openapi_schema = schema
        return schema

    app.openapi = _patched_openapi  # type: ignore[method-assign]

    return app


app = create_app()


def run() -> None:
    """Entrypoint for `omicron-serve` CLI command (see pyproject.toml [project.scripts])."""
    import uvicorn

    uvicorn.run("omicron_agent_kit.api.main:app", host="0.0.0.0", port=8000, reload=False)
