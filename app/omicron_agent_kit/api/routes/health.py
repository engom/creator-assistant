from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> JSONResponse:
    lm_error = getattr(request.app.state, "lm_error", None)
    if lm_error:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "lm_error": lm_error},
        )
    return JSONResponse(content={"status": "ok"})
