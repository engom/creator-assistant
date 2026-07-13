"""TikTok platform adapter.

Self-contained module providing:
- PostStats: normalized per-post metrics dataclass
- OAuth 2.0 / PKCE helpers (stubs until Marketing API audit approval)
- InMemoryTokenStore: Phase 1 token store
- AdaptivePoller: schedules polls aligned with TikTok's 30-90 min algorithm window
- TikTokStatsClient: fetches post stats (Phase 1 stub; requires Research API approval)
"""

from __future__ import annotations

import math
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TIKTOK_AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"

_DEFAULT_SCOPES = ["user.info.basic", "video.list"]

# Checkpoint offsets in minutes, aligned with TikTok's algorithm window.
_CHECKPOINT_OFFSETS_MIN = [30, 45, 60, 90]

# Tolerance window (seconds) for is_checkpoint
_CHECKPOINT_TOLERANCE_S = 60


# ---------------------------------------------------------------------------
# A. Normalized stats dataclass
# ---------------------------------------------------------------------------


@dataclass
class PostStats:
    """Normalized per-post statistics, platform-agnostic shape."""

    post_id: str
    creator_id: str
    platform: str = "tiktok"
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    retention_pct: float = 0.0
    fetched_at: str = ""  # ISO-8601 UTC

    def to_stats_str(self) -> str:
        """Return a compact stats string expected by InsightAgent.

        Format: "views=12400 likes=890 comments=134 shares=67 retention=38.0%"
        """
        return (
            f"views={self.views} "
            f"likes={self.likes} "
            f"comments={self.comments} "
            f"shares={self.shares} "
            f"retention={self.retention_pct:.1f}%"
        )

    def to_dict(self) -> dict[str, Any]:
        """Return a plain dict of numeric metrics (no metadata fields)."""
        return {
            "views": self.views,
            "likes": self.likes,
            "comments": self.comments,
            "shares": self.shares,
            "retention_pct": self.retention_pct,
        }


# ---------------------------------------------------------------------------
# B. OAuth 2.0 / PKCE helpers
# ---------------------------------------------------------------------------


def estimate_retention_pct(
    views: int,
    likes: int,
    comments: int,
    shares: int,
) -> float:
    """Estimate retention % from engagement signals (Display API proxy).

    TikTok's completion rate isn't exposed in the Display API, but engagement
    actions (like, comment, share) require watching the video, so they correlate
    strongly with watch-through rate.

    Formula: weighted_engagement = (likes + comments×2 + shares×3) / views
    Comments and shares carry heavier weight — they signal fuller watch-through.
    Scale to a [0, 95] retention range using an empirical ×4.5 multiplier
    (TikTok avg retention ~35%, avg weighted engagement ~7-8%).

    Returns 0.0 if views == 0.
    """
    if views == 0:
        return 0.0
    weighted = (likes + comments * 2 + shares * 3) / views
    return round(min(weighted * 4.5 * 100, 95.0), 1)


def _check_tiktok_error(body: dict) -> None:
    """Raise RuntimeError if the TikTok response body signals an API error.

    Handles both dict-shaped errors ({"code": "...", "message": "..."}) and
    plain-string errors, avoiding AttributeError on unexpected response shapes.
    """
    err = body.get("error")
    if not err:
        return
    if isinstance(err, dict):
        if err.get("code", "ok") != "ok":
            raise RuntimeError(f"TikTok API error: {err}")
    else:
        raise RuntimeError(f"TikTok API error: {err}")


def build_authorization_url(
    client_id: str,
    redirect_uri: str,
    state: str,
    scopes: list[str] | None = None,
    code_challenge: str | None = None,
) -> str:
    """Return the TikTok authorization URL to redirect the creator to.

    Builds the URL per TikTok Login Kit v2 with PKCE (S256).
    Pass code_challenge (base64url of SHA-256 of the verifier) — TikTok
    requires it for the sandbox and recommends it for production.
    """
    if scopes is None:
        scopes = _DEFAULT_SCOPES

    params: dict[str, str] = {
        "client_key": client_id,
        "response_type": "code",
        "scope": ",".join(scopes),
        "redirect_uri": redirect_uri,
        "state": state,
    }
    if code_challenge:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
    return f"{TIKTOK_AUTH_BASE}?{urllib.parse.urlencode(params)}"


def exchange_code_for_tokens(
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict:
    """Exchange an authorization code for tokens via TikTok Display API.

    Returns:
        {access_token, refresh_token, expires_in, open_id, scope}

    Requires the Display API product (no audit needed).
    Register at https://developers.tiktok.com and add the Display API product.
    """
    resp = httpx.post(
        TIKTOK_TOKEN_URL,
        data={
            "client_key": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(
            f"TikTok token exchange failed: {data.get('error_description', data['error'])}"
        )
    return data


def refresh_access_token(
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> dict:
    """Refresh an expired TikTok access token via Display API.

    Returns:
        {access_token, refresh_token, expires_in, open_id}
    """

    resp = httpx.post(
        TIKTOK_TOKEN_URL,
        data={
            "client_key": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(
            f"TikTok token refresh failed: {data.get('error_description', data['error'])}"
        )
    return data


# ---------------------------------------------------------------------------
# C. In-memory token store (Phase 1 only)
# ---------------------------------------------------------------------------


class InMemoryTokenStore:
    """Phase 1 only — swap for SecretsManagerTokenStore before production.

    Tokens are stored in a plain dict keyed by creator_id.  All data is lost
    when the process restarts; use this only for local development and testing.
    """

    def __init__(self) -> None:
        self._store: dict[str, dict] = {}

    def store(self, creator_id: str, tokens: dict) -> None:
        """Persist tokens for a creator (overwrites any existing entry)."""
        self._store[creator_id] = dict(tokens)

    def get(self, creator_id: str) -> dict | None:
        """Return the stored token dict for creator_id, or None if absent."""
        return self._store.get(creator_id)

    def delete(self, creator_id: str) -> None:
        """Remove tokens for creator_id.  No-op if not present."""
        self._store.pop(creator_id, None)


# ---------------------------------------------------------------------------
# D. Adaptive poller
# ---------------------------------------------------------------------------


@dataclass
class PollSchedule:
    """Describes the polling schedule emitted for a newly-detected post."""

    post_id: str
    creator_id: str
    detected_at: str  # ISO-8601 UTC
    checkpoint_offsets_min: list[int] = field(default_factory=lambda: list(_CHECKPOINT_OFFSETS_MIN))


def _parse_iso(ts: str) -> datetime:
    """Parse an ISO-8601 UTC timestamp into an aware datetime.

    Accepts both 'Z' suffix and '+00:00' offset.
    Uses only stdlib — no third-party libraries.
    """
    ts = ts.strip()
    # Replace trailing Z with +00:00 for fromisoformat compatibility (Python 3.10 and earlier)
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class AdaptivePoller:
    """Schedules polls aligned with TikTok's 30-90 min algorithm window.

    Polling phases:
    - First call (no last_poll_at): poll immediately (delay = 0)
    - Active window (elapsed < decay_after_s, default 2h): every base_interval_s (default 75s)
    - Decay phase (elapsed >= decay_after_s): interval doubles each step, capped at 1800s (30 min)
    - After stop_after_s (default 24h): return None (stop polling)

    Mandatory checkpoints at T+30, T+45, T+60, T+90 min are detected via
    is_checkpoint() so callers can trigger a checkpoint poll regardless of the
    regular schedule.
    """

    def __init__(
        self,
        base_interval_s: int = 75,
        decay_after_s: int = 7200,
        stop_after_s: int = 86400,
    ) -> None:
        self._base_interval_s = base_interval_s
        self._decay_after_s = decay_after_s
        self._stop_after_s = stop_after_s

    def next_poll_delay_s(
        self,
        detected_at_iso: str,
        last_poll_at_iso: str | None,
    ) -> int | None:
        """Return seconds to wait before the next poll, or None to stop.

        - No last_poll_at  → return 0 (poll immediately on first detection)
        - elapsed > stop_after_s (24h) → return None
        - elapsed > decay_after_s (2h) → exponential back-off
        - else → base_interval_s (75s)
        """
        if last_poll_at_iso is None:
            return 0

        # last_poll_at serves as the current-time reference: the caller passes
        # the actual timestamp of the most recent poll, so elapsed measures
        # how far into the post's lifecycle we are at the moment of this call.
        last_poll_at = _parse_iso(last_poll_at_iso)
        detected = _parse_iso(detected_at_iso)
        elapsed_s = (last_poll_at - detected).total_seconds()

        if elapsed_s >= self._stop_after_s:
            return None

        if elapsed_s >= self._decay_after_s:
            # Number of completed decay steps since entering decay phase.
            # Each step doubles the interval up to a 1800s cap.
            decay_elapsed_s = elapsed_s - self._decay_after_s
            n = int(math.log2(max(decay_elapsed_s / self._base_interval_s, 1)))
            interval = min(self._base_interval_s * (2**n), 1800)
            return interval

        return self._base_interval_s

    def is_checkpoint(self, detected_at_iso: str, now_iso: str) -> bool:
        """Return True if now is within _CHECKPOINT_TOLERANCE_S of any checkpoint.

        Checkpoints are at T+30, T+45, T+60, T+90 min from detected_at.
        """
        detected = _parse_iso(detected_at_iso)
        now = _parse_iso(now_iso)
        elapsed_s = (now - detected).total_seconds()

        for offset_min in _CHECKPOINT_OFFSETS_MIN:
            checkpoint_s = offset_min * 60
            if abs(elapsed_s - checkpoint_s) <= _CHECKPOINT_TOLERANCE_S:
                return True
        return False


# ---------------------------------------------------------------------------
# E. Stats fetcher stub
# ---------------------------------------------------------------------------


class TikTokStatsClient:
    """Fetches post stats from the TikTok Research API.

    Phase 1 stub: all fetch methods raise NotImplementedError with clear
    messages explaining what TikTok API permissions are required.

    TikTok Research API requires app audit approval.
    Apply at https://developers.tiktok.com/products/research-api.

    Replace the stubs with real HTTP calls once the audit is approved.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        token_store: InMemoryTokenStore | None = None,
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._token_store = token_store or InMemoryTokenStore()

    def _require_token(self, creator_id: str) -> dict:
        tokens = self._token_store.get(creator_id)
        if tokens is None:
            raise RuntimeError(
                f"No access token for creator_id={creator_id!r}. "
                "Complete the OAuth flow at /auth/tiktok/authorize first."
            )
        return tokens

    def fetch_post_stats(self, creator_id: str, post_id: str) -> PostStats:
        """Fetch normalized stats for a post via TikTok Display API.

        Endpoint: POST https://open.tiktokapis.com/v2/video/list/
        Required scope: video.list

        The access token for creator_id must be stored via the token store.
        retention_pct is not available from the Display API — set to 0.0.
        """

        tokens = self._require_token(creator_id)

        resp = httpx.post(
            "https://open.tiktokapis.com/v2/video/list/",
            params={"fields": "id,create_time,view_count,like_count,comment_count,share_count"},
            headers={
                "Authorization": f"Bearer {tokens['access_token']}",
                "Content-Type": "application/json",
            },
            json={"max_count": 20},
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()

        _check_tiktok_error(body)

        videos = body.get("data", {}).get("videos", [])
        matched = next((v for v in videos if v.get("id") == post_id), None)
        if matched is None:
            raise ValueError(
                f"post_id={post_id!r} not found in the most recent 20 videos for creator_id={creator_id!r}."
            )

        views = int(matched.get("view_count", 0))
        likes = int(matched.get("like_count", 0))
        comments = int(matched.get("comment_count", 0))
        shares = int(matched.get("share_count", 0))
        return PostStats(
            post_id=post_id,
            creator_id=creator_id,
            platform="tiktok",
            views=views,
            likes=likes,
            comments=comments,
            shares=shares,
            retention_pct=estimate_retention_pct(views, likes, comments, shares),
            fetched_at=datetime.now(timezone.utc).isoformat(),
        )

    def fetch_user_info(self, creator_id: str) -> dict:
        """Fetch profile + stats for creator_id via TikTok Display API.

        Required scopes: user.info.basic (display_name, avatar_url),
                         user.info.stats (follower_count, following_count, likes_count, video_count).
        Returns a dict with those fields.
        """

        tokens = self._require_token(creator_id)
        fields = "open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count"
        resp = httpx.get(
            "https://open.tiktokapis.com/v2/user/info/",
            params={"fields": fields},
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()
        _check_tiktok_error(body)
        return body.get("data", {}).get("user", {})

    def fetch_creator_videos(self, creator_id: str, max_count: int = 20) -> list[dict]:
        """Return up to max_count recent videos for creator_id as a list of dicts.

        Each dict has: id, create_time, view_count, like_count, comment_count,
        share_count, video_description, duration, cover_image_url.
        Requires the token to have been stored via the token store first.
        """
        tokens = self._require_token(creator_id)
        fields = "id,create_time,view_count,like_count,comment_count,share_count,video_description,duration,cover_image_url"
        resp = httpx.post(
            "https://open.tiktokapis.com/v2/video/list/",
            params={"fields": fields},
            headers={
                "Authorization": f"Bearer {tokens['access_token']}",
                "Content-Type": "application/json",
            },
            json={"max_count": max_count},
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()
        _check_tiktok_error(body)
        raw_videos = body.get("data", {}).get("videos", [])
        return [
            {
                **vid,
                "retention_pct": estimate_retention_pct(
                    int(vid.get("view_count", 0)),
                    int(vid.get("like_count", 0)),
                    int(vid.get("comment_count", 0)),
                    int(vid.get("share_count", 0)),
                ),
            }
            for vid in raw_videos
        ]

    @staticmethod
    def mock_stats(creator_id: str, post_id: str, **overrides: Any) -> PostStats:
        """Return a mock PostStats for local testing without API credentials.

        Sensible defaults are provided; pass keyword arguments to override any
        field (e.g. views=50000, retention_pct=42.5).
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        defaults: dict[str, Any] = {
            "post_id": post_id,
            "creator_id": creator_id,
            "platform": "tiktok",
            "views": 12400,
            "likes": 890,
            "comments": 134,
            "shares": 67,
            "retention_pct": 38.0,
            "fetched_at": now_iso,
        }
        defaults.update(overrides)
        return PostStats(**defaults)
