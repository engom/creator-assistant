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

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from omicron_agent_kit.api.auth import require_api_key
from omicron_agent_kit.config import get_settings
from omicron_agent_kit.db import tokens as token_store
from omicron_agent_kit.platform.tiktok import (
    InMemoryTokenStore,
    TikTokStatsClient,
    build_authorization_url,
    exchange_code_for_tokens,
)

router = APIRouter(prefix="/auth/tiktok", tags=["auth"])

_SCOPES = ["user.info.profile", "user.info.stats", "video.list"]

# Maps state → (creator_id, code_verifier). Single-process Phase 1 store.
_pending: dict[str, tuple[str, str]] = {}

# Process-level token fallback used when Postgres is unavailable (dev without DB).
# Tokens survive the server session but are lost on restart.
_mem_token_store: InMemoryTokenStore = InMemoryTokenStore()


async def _fetch_token(creator_id: str, request: Request) -> dict | None:
    """Return the stored token dict for creator_id, using DB when available, memory otherwise."""
    if request.app.state.db_pool is not None:
        return await token_store.get_tokens(creator_id, platform="tiktok")
    return _mem_token_store.get(creator_id)


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

    token_payload = {
        "access_token": token_data["access_token"],
        "refresh_token": token_data.get("refresh_token", ""),
        "expires_at": expires_at.isoformat(),
        "open_id": token_data.get("open_id"),
    }

    # Always store in the process-level fallback (available even without Postgres).
    _mem_token_store.store(creator_id, token_payload)

    if request.app.state.db_pool is not None:
        await token_store.store_tokens(
            creator_id=creator_id,
            platform="tiktok",
            access_token=token_payload["access_token"],
            refresh_token=token_payload["refresh_token"],
            expires_at=expires_at,
            open_id=token_payload["open_id"],
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


def _is_expired(tokens: dict) -> bool:
    """Return True if the stored access token has expired, using the already-fetched tokens dict."""
    expires_at_str = tokens.get("expires_at", "")
    if not expires_at_str:
        return True
    try:
        expires_at = datetime.fromisoformat(expires_at_str)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return expires_at < datetime.now(timezone.utc)
    except ValueError:
        return True


async def _require_valid_token(creator_id: str, request: Request) -> dict:
    """Fetch and validate the stored token for creator_id. Raises HTTP 404/401 on failure.

    Falls back to the process-level in-memory store when Postgres is unavailable.
    """
    tokens = await _fetch_token(creator_id, request)
    if tokens is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No token for creator_id={creator_id!r}. Authorize at /auth/tiktok/authorize?creator_id={creator_id}",
        )
    if _is_expired(tokens):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token expired for creator_id={creator_id!r}. Re-authorize at /auth/tiktok/authorize?creator_id={creator_id}",
        )
    return tokens


def _build_client(tokens: dict, creator_id: str) -> TikTokStatsClient:
    settings = get_settings()
    mem_store = InMemoryTokenStore()
    mem_store.store(creator_id, tokens)
    return TikTokStatsClient(
        client_id=settings.tiktok_client_id or "",
        client_secret=settings.tiktok_client_secret or "",
        token_store=mem_store,
    )


@router.get("/status/{creator_id}")
async def tiktok_token_status(
    creator_id: str,
    request: Request,
    _: str = Depends(require_api_key),
) -> dict:
    """Return whether creator_id has a valid stored token."""
    tokens = await _fetch_token(creator_id, request)
    if tokens is None:
        return {"creator_id": creator_id, "authorized": False}
    return {
        "creator_id": creator_id,
        "authorized": not _is_expired(tokens),
        "expires_at": tokens.get("expires_at"),
        "open_id": tokens.get("open_id"),
    }


@router.get("/profile/{creator_id}", tags=["creators"])
async def get_creator_profile(
    creator_id: str,
    request: Request,
    _: str = Depends(require_api_key),
) -> dict:
    """Fetch TikTok profile + stats (follower_count, likes_count, video_count) for an authorized creator."""
    tokens = await _require_valid_token(creator_id, request)
    client = _build_client(tokens, creator_id)

    try:
        user = await asyncio.to_thread(client.fetch_user_info, creator_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"TikTok API error: {exc}") from exc

    # Explicit keys prevent TikTok response fields from silently overwriting creator_id/platform.
    return {
        "creator_id": creator_id,
        "platform": "tiktok",
        "display_name": user.get("display_name", ""),
        "avatar_url": user.get("avatar_url", ""),
        "follower_count": user.get("follower_count", 0),
        "following_count": user.get("following_count", 0),
        "likes_count": user.get("likes_count", 0),
        "video_count": user.get("video_count", 0),
        "open_id": user.get("open_id"),
    }


@router.get("/videos/{creator_id}", tags=["creators"])
async def list_creator_videos(
    creator_id: str,
    request: Request,
    _: str = Depends(require_api_key),
) -> dict:
    """Fetch the most recent TikTok videos for an authorized creator.

    Returns up to 20 videos with id, view_count, like_count, comment_count,
    share_count, video_description, duration, cover_image_url, create_time.
    Requires the creator to have completed OAuth at /auth/tiktok/authorize.
    """
    tokens = await _require_valid_token(creator_id, request)
    client = _build_client(tokens, creator_id)

    try:
        videos = await asyncio.to_thread(client.fetch_creator_videos, creator_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TikTok API error: {exc}",
        ) from exc

    return {"creator_id": creator_id, "platform": "tiktok", "videos": videos}
