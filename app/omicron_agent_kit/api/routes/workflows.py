"""Workflow routes — trigger durable Pub-IQ monitoring workflows.

POST /v1/workflows/pubiq starts a DBOS workflow for a newly-detected post.
The workflow runs durably in the background (survives process restarts).
"""

from dbos import DBOS
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from omicron_agent_kit.api.auth import require_api_key
from omicron_agent_kit.stats import WORKFLOW_CHECKPOINT_OFFSETS_MIN
from omicron_agent_kit.workflows.pubiq import pubiq_workflow

router = APIRouter(prefix="/v1/workflows", tags=["workflows"])


class PubIQRequest(BaseModel):
    """Request to start a Pub-IQ monitoring workflow for a new post."""

    creator_id: str = Field(..., description="Platform-scoped creator identifier.")
    post_id: str = Field(..., description="Platform-scoped post identifier.")
    platform: str = Field(default="tiktok", description="Platform slug.")

    model_config = {
        "json_schema_extra": {
            "example": {
                "creator_id": "creator_abc123",
                "post_id": "post_xyz789",
                "platform": "tiktok",
            }
        }
    }


class PubIQResponse(BaseModel):
    """Response confirming a Pub-IQ workflow was started."""

    status: str = Field(..., description="'started' if the workflow was queued.")
    workflow_id: str = Field(..., description="DBOS workflow handle ID for tracking.")
    creator_id: str
    post_id: str
    platform: str
    checkpoints: list[int] = Field(..., description="Scheduled checkpoint offsets in minutes.")


@router.post("/pubiq", response_model=PubIQResponse)
async def start_pubiq_workflow(
    body: PubIQRequest,
    request: Request,
    tenant_id: str = Depends(require_api_key),
) -> PubIQResponse:
    """Start a durable Pub-IQ monitoring workflow for a newly-detected post.

    The workflow sleeps to T+30, T+60, T+90 min checkpoints, fetches metrics,
    computes z-scores, and fires insight+notification only when thresholds are
    exceeded. All state survives process restarts via DBOS + Postgres.
    """
    if not getattr(request.app.state, "dbos_ready", False):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DBOS workflow runtime not available — requires Postgres.",
        )

    settings = request.app.state.settings

    handle = DBOS.start_workflow(
        pubiq_workflow,
        body.creator_id,
        body.post_id,
        body.platform,
        settings.compiled_insight_path,
    )

    return PubIQResponse(
        status="started",
        workflow_id=handle.get_workflow_id(),
        creator_id=body.creator_id,
        post_id=body.post_id,
        platform=body.platform,
        checkpoints=WORKFLOW_CHECKPOINT_OFFSETS_MIN,
    )
