"""TikTok OAuth callback — exchanges code for tokens, stores in Postgres.

Flow:
    1. GET /auth/tiktok/authorize?creator_id=X  → browser redirect to TikTok consent screen
    2. TikTok redirects to GET /auth/tiktok/callback?code=...&state=...
    3. Server exchanges code for tokens (PKCE), stores in oauth_tokens table
    4. Creator is now authorized — pubiq_workflow can fetch their stats

No API key is required on /authorize — it's opened directly in the creator's browser.
"""

from __future__ import annotations

import base64
import hashlib
import html
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from omicron_agent_kit.config import get_settings
from omicron_agent_kit.db import tokens as token_store
from omicron_agent_kit.platform.tiktok import build_authorization_url, exchange_code_for_tokens

router = APIRouter(prefix="/auth/tiktok", tags=["auth"])

_SCOPES = ["user.info.profile", "user.info.stats", "video.list"]

# Maps state → (creator_id, code_verifier). Single-process Phase 1 store.
_pending: dict[str, tuple[str, str]] = {}


def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) using S256 method."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


@router.get("/authorize")
async def tiktok_authorize(creator_id: str) -> RedirectResponse:
    """Redirect creator's browser to TikTok consent screen (no API key needed).

    Open in the browser: http://localhost:8000/auth/tiktok/authorize?creator_id=elpanthio
    """
    settings = get_settings()
    if not settings.tiktok_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TIKTOK_CLIENT_ID not configured.",
        )

    state = secrets.token_urlsafe(16)
    code_verifier, code_challenge = _pkce_pair()
    _pending[state] = (creator_id, code_verifier)

    url = build_authorization_url(
        client_id=settings.tiktok_client_id,
        redirect_uri=settings.tiktok_redirect_uri,
        state=state,
        scopes=_SCOPES,
        code_challenge=code_challenge,
    )
    return RedirectResponse(url)


@router.get("/callback")
async def tiktok_callback(code: str, state: str, request: Request) -> HTMLResponse:
    """Handle TikTok OAuth callback, exchange code for tokens, persist to Postgres."""
    settings = get_settings()

    entry = _pending.pop(state, None)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown or expired state.")

    creator_id, code_verifier = entry

    if not settings.tiktok_client_id or not settings.tiktok_client_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="TikTok credentials not configured.")

    try:
        token_data = exchange_code_for_tokens(
            client_id=settings.tiktok_client_id,
            client_secret=settings.tiktok_client_secret,
            code=code,
            redirect_uri=settings.tiktok_redirect_uri,
            code_verifier=code_verifier,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Token exchange failed: {exc}") from exc

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 86400))

    if request.app.state.db_pool is not None:
        await token_store.store_tokens(
            creator_id=creator_id,
            platform="tiktok",
            access_token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token", ""),
            expires_at=expires_at,
            open_id=token_data.get("open_id"),
        )

    return HTMLResponse(f"""
<html><body style="font-family:sans-serif;padding:2rem">
<h2>&#x2705; @{html.escape(creator_id)} authorized</h2>
<p><b>open_id:</b> {html.escape(str(token_data.get("open_id") or ""))}</p>
<p><b>scope:</b> {html.escape(str(token_data.get("scope", "")))}</p>
<p><b>expires_at:</b> {html.escape(expires_at.isoformat())}</p>
<p>You can close this tab. The server has stored the token.</p>
</body></html>
""")
