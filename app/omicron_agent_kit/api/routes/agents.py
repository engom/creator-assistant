import asyncio
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from loguru import logger
from pydantic import ValidationError

from omicron_agent_kit.agents.analytics_agent import AnalyticsAgent
from omicron_agent_kit.agents.base import BaseAgent
from omicron_agent_kit.agents.insight_agent import InsightAgent
from omicron_agent_kit.agents.monitoring_agent import MonitoringAgent
from omicron_agent_kit.agents.notification_agent import NotificationAgent
from omicron_agent_kit.api.auth import require_api_key
from omicron_agent_kit.api.schemas import (
    INVOKE_EXAMPLES,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentSummary,
)
from omicron_agent_kit.config import Settings

router = APIRouter(prefix="/v1/agents", tags=["agents"])


def build_registry(settings: Settings) -> dict[str, BaseAgent]:
    monitoring = MonitoringAgent()
    logger.info("MonitoringAgent ready")

    analytics = AnalyticsAgent()
    logger.info("AnalyticsAgent ready")

    insight = InsightAgent(compiled_path=settings.compiled_insight_path)
    logger.info(
        "InsightAgent ready: compiled_path={path}",
        path=settings.compiled_insight_path,
    )

    notification = NotificationAgent()
    logger.info("NotificationAgent ready (noop dispatcher — wire real transport in production)")

    return {
        "monitoring-agent": monitoring,
        "analytics-agent": analytics,
        "insight-agent": insight,
        "notification-agent": notification,
    }


def get_registry(request: Request) -> dict[str, BaseAgent]:
    return request.app.state.agent_registry


@router.get("", response_model=list[AgentSummary])
async def list_agents(
    registry: dict[str, BaseAgent] = Depends(get_registry),
    tenant_id: str = Depends(require_api_key),
):
    return [
        AgentSummary(name=name, description=agent.__class__.__doc__ or "")
        for name, agent in registry.items()
    ]


@router.post(
    "/{agent_name}/invoke",
    response_model=AgentInvokeResponse,
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/AgentInvokeRequest"},
                    "examples": INVOKE_EXAMPLES,
                }
            },
            "required": True,
        }
    },
)
async def invoke_agent(
    agent_name: str,
    body: AgentInvokeRequest,
    request: Request,
    registry: dict[str, BaseAgent] = Depends(get_registry),
    tenant_id: str = Depends(require_api_key),
):
    agent = registry.get(agent_name)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown agent '{agent_name}'. Available: {list(registry)}",
        )

    settings = request.app.state.settings
    audit = request.app.state.audit_logger

    async def _audit_error(error_name: str, latency_ms: float) -> None:
        await asyncio.to_thread(
            audit.log,
            tenant_id=tenant_id,
            agent=agent_name,
            input_payload=body.input,
            output_payload={"error": error_name},
            latency_ms=latency_ms,
            model=settings.llm_model,
            status="error",
        )

    _LM_AGENTS = {"insight-agent"}
    if agent_name in _LM_AGENTS and request.app.state.lm_error:
        await _audit_error("LMNotConfigured", 0.0)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LM not configured — check /health for details.",
        )

    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(agent.run, body.input),
            timeout=settings.agent_timeout_s,
        )
    except asyncio.TimeoutError as exc:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.warning(
            "Agent {agent} timed out for tenant {tenant}", agent=agent_name, tenant=tenant_id
        )
        await _audit_error("TimeoutError", round(elapsed_ms, 2))
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Agent timed out.",
        ) from exc
    except ValidationError as exc:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        await _audit_error("ValidationError", round(elapsed_ms, 2))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid input for {agent_name}: {exc}",
        ) from exc
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.exception(
            "Agent {agent} failed for tenant {tenant}", agent=agent_name, tenant=tenant_id
        )
        await _audit_error(type(exc).__name__, round(elapsed_ms, 2))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Agent invocation failed.",
        ) from exc

    trace_id = str(uuid.uuid4())
    await asyncio.to_thread(
        audit.log,
        tenant_id=tenant_id,
        agent=agent_name,
        input_payload=body.input,
        output_payload=result.output,
        latency_ms=result.latency_ms,
        trace_id=trace_id,
        model=settings.llm_model,
    )

    return AgentInvokeResponse(
        agent=agent_name,
        output=result.output,
        latency_ms=result.latency_ms,
        trace_id=trace_id,
    )
