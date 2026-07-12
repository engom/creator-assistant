"""Pipeline route — single POST endpoint that chains all four agents in sequence.

Execution order:
    1. MonitoringAgent   — deterministic: detects post, emits polling schedule
    2. AnalyticsAgent    — deterministic: z-scores vs rolling baseline
    3. InsightAgent      — DSPy ChainOfThought: stats delta → insight + urgency + recommended_action
    4. NotificationAgent — deterministic: routes by urgency (low → log only, medium/high → dispatch)

InsightAgent errors (LM not configured, timeout, etc.) are caught and handled gracefully:
the pipeline falls back to urgency="low" and insight="Insight unavailable" and still
runs NotificationAgent and emits a full audit record.
"""

import asyncio
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from loguru import logger

from omicron_agent_kit.api.auth import require_api_key
from omicron_agent_kit.api.schemas import AnalyzePostRequest, AnalyzePostResponse

router = APIRouter(prefix="/v1/pipeline", tags=["pipeline"])


@router.post("/analyze-post", response_model=AnalyzePostResponse)
async def analyze_post(
    body: AnalyzePostRequest,
    request: Request,
    tenant_id: str = Depends(require_api_key),
) -> AnalyzePostResponse:
    registry = request.app.state.agent_registry
    settings = request.app.state.settings
    audit = request.app.state.audit_logger

    trace_ids: dict[str, str] = {}
    pipeline_start = time.perf_counter()

    # ------------------------------------------------------------------
    # Closure: write an error audit record for the named agent stage.
    # Preserves the actual inputs that caused the failure for post-mortem.
    # ------------------------------------------------------------------
    async def _audit_error(
        agent_name: str, error_name: str, latency_ms: float, inputs: dict | None = None
    ) -> None:
        tid = await asyncio.to_thread(
            audit.log,
            tenant_id=tenant_id,
            agent=agent_name,
            input_payload=inputs or {},
            output_payload={"error": error_name},
            latency_ms=latency_ms,
            model=settings.llm_model,
            status="error",
        )
        trace_ids[agent_name] = tid

    # ------------------------------------------------------------------
    # Helper: run one agent, audit it, return its output dict.
    # Errors are audited via _audit_error and re-raised so the caller
    # can decide whether to 404/504/502 or fall back gracefully.
    # ------------------------------------------------------------------
    async def _run_agent(agent_name: str, inputs: dict) -> dict:
        agent = registry.get(agent_name)
        if agent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown agent '{agent_name}' in pipeline. Available: {list(registry)}",
            )
        t0 = time.perf_counter()
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(agent.run, inputs),
                timeout=settings.agent_timeout_s,
            )
        except Exception as exc:
            wall_ms = (time.perf_counter() - t0) * 1000
            await _audit_error(agent_name, type(exc).__name__, round(wall_ms, 2), inputs)
            raise
        wall_ms = (time.perf_counter() - t0) * 1000
        tid = await asyncio.to_thread(
            audit.log,
            tenant_id=tenant_id,
            agent=agent_name,
            input_payload=inputs,
            output_payload=result.output,
            latency_ms=wall_ms,
            model=settings.llm_model,
        )
        trace_ids[agent_name] = tid
        logger.info(
            "Pipeline stage {agent} completed in {ms:.1f} ms (trace={tid})",
            agent=agent_name,
            ms=wall_ms,
            tid=tid,
        )
        return result.output

    # ------------------------------------------------------------------
    # Stage 1 — MonitoringAgent
    # ------------------------------------------------------------------
    monitoring_input = {
        "creator_id": body.creator_id,
        "post_id": body.post_id,
        "platform": body.platform,
        "detected_at": body.detected_at,
    }
    monitoring_output = await _run_agent("monitoring-agent", monitoring_input)

    # ------------------------------------------------------------------
    # Stage 2 — AnalyticsAgent
    # current_stats and historical_baseline come from the request, NOT
    # from MonitoringAgent output.
    # ------------------------------------------------------------------
    analytics_input = {
        "creator_id": body.creator_id,
        "post_id": body.post_id,
        "platform": body.platform,
        "current_stats": body.current_stats,
        "historical_baseline": body.historical_baseline,
    }
    analytics_output = await _run_agent("analytics-agent", analytics_input)

    # ------------------------------------------------------------------
    # Stage 3 — InsightAgent (may fail when LM is not configured)
    # On any error, fall back to low-urgency placeholders.
    # ------------------------------------------------------------------
    insight_input = {
        "creator_id": body.creator_id,
        "post_id": body.post_id,
        "platform": body.platform,
        "signal": analytics_output.get("signal", ""),
        "current_stats": analytics_output.get("current_stats_str", ""),
        "historical_baseline": analytics_output.get("historical_baseline_str", ""),
    }

    insight_output: dict
    t0_insight = time.perf_counter()
    try:
        insight_output = await _run_agent("insight-agent", insight_input)
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - t0_insight) * 1000
        logger.warning(
            "InsightAgent failed ({exc}); falling back to low urgency",
            exc=type(exc).__name__,
        )
        await _audit_error("insight-agent", type(exc).__name__, round(elapsed_ms, 2), insight_input)
        insight_output = {
            "creator_id": body.creator_id,
            "post_id": body.post_id,
            "platform": body.platform,
            "signal": analytics_output.get("signal", ""),
            "insight": "Insight unavailable",
            "urgency": "low",
            "recommended_action": "",
        }

    # ------------------------------------------------------------------
    # Stage 4 — NotificationAgent
    # ------------------------------------------------------------------
    notification_input = {
        "creator_id": body.creator_id,
        "post_id": body.post_id,
        "platform": body.platform,
        "urgency": insight_output.get("urgency", "low"),
        "insight": insight_output.get("insight", ""),
        "recommended_action": insight_output.get("recommended_action", ""),
    }
    notification_output = await _run_agent("notification-agent", notification_input)

    total_latency_ms = (time.perf_counter() - pipeline_start) * 1000

    return AnalyzePostResponse(
        creator_id=body.creator_id,
        post_id=body.post_id,
        platform=body.platform,
        poll_offsets_min=monitoring_output.get("poll_offsets_min", []),
        z_scores=analytics_output.get("z_scores", {}),
        signal=analytics_output.get("signal", ""),
        insight=insight_output.get("insight", ""),
        urgency=insight_output.get("urgency", "low"),
        recommended_action=insight_output.get("recommended_action", ""),
        notification_dispatched=notification_output.get("dispatched", False),
        trace_ids=trace_ids,
        total_latency_ms=round(total_latency_ms, 2),
    )
