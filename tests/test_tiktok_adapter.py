"""Tests for the TikTok platform adapter.

All tests run without live TikTok credentials.
Environment variables are pinned before any app modules are imported.
"""

import os

# Pin required env vars before any app module is imported.
os.environ.setdefault("API_KEYS", "test-key")
os.environ.setdefault("LLM_MODEL", "anthropic/claude-sonnet-4-6")
os.environ.setdefault("ANTHROPIC_API_KEY", "")

from datetime import datetime, timedelta, timezone  # noqa: E402

import pytest  # noqa: E402
from omicron_agent_kit.platform.tiktok import (  # noqa: E402
    AdaptivePoller,
    InMemoryTokenStore,
    PostStats,
    TikTokStatsClient,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso(dt: datetime) -> str:
    """Format a datetime as an ISO-8601 UTC string."""
    return dt.isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# AdaptivePoller tests
# ---------------------------------------------------------------------------


def test_adaptive_poller_first_poll_immediate():
    """next_poll_delay_s with no last_poll_at must return 0 (poll immediately)."""
    poller = AdaptivePoller()
    detected_at = _iso(_now() - timedelta(seconds=10))
    delay = poller.next_poll_delay_s(detected_at, last_poll_at_iso=None)
    assert delay == 0


def test_adaptive_poller_active_window():
    """During the first 2h, delay must equal base_interval_s (75s)."""
    poller = AdaptivePoller(base_interval_s=75, decay_after_s=7200, stop_after_s=86400)
    detected_at = _now() - timedelta(hours=1)
    # last poll was 75s ago — still well within the active window
    last_poll_at = detected_at + timedelta(minutes=30)
    delay = poller.next_poll_delay_s(_iso(detected_at), _iso(last_poll_at))
    assert delay == 75


def test_adaptive_poller_decay_after_2h():
    """After 2h from detection, delay must be at least 2x base_interval_s."""
    poller = AdaptivePoller(base_interval_s=75, decay_after_s=7200, stop_after_s=86400)
    detected_at = _now() - timedelta(hours=5)
    last_poll_at = detected_at + timedelta(hours=3)
    delay = poller.next_poll_delay_s(_iso(detected_at), _iso(last_poll_at))
    assert delay is not None
    assert delay >= 75 * 2


def test_adaptive_poller_stops_after_24h():
    """After 24h from detection, next_poll_delay_s must return None."""
    poller = AdaptivePoller(base_interval_s=75, decay_after_s=7200, stop_after_s=86400)
    detected_at = _now() - timedelta(hours=25)
    last_poll_at = detected_at + timedelta(hours=24, minutes=1)
    delay = poller.next_poll_delay_s(_iso(detected_at), _iso(last_poll_at))
    assert delay is None


def test_adaptive_poller_is_checkpoint_true_at_t30():
    """At exactly T+30 min, is_checkpoint must return True."""
    poller = AdaptivePoller()
    detected_at = _now() - timedelta(minutes=30)
    now = _now()
    assert poller.is_checkpoint(_iso(detected_at), _iso(now)) is True


def test_adaptive_poller_is_checkpoint_false_before_tolerance():
    """At T+29 min (outside the 60s tolerance window), is_checkpoint must return False."""
    poller = AdaptivePoller()
    detected_at = _now() - timedelta(minutes=29)
    now = _now()
    # elapsed ≈ 29 min; nearest checkpoint is 30 min → gap ≈ 60s, which is *on* the boundary.
    # Use 28 min to be safely outside the tolerance window.
    detected_at = _now() - timedelta(minutes=28)
    assert poller.is_checkpoint(_iso(detected_at), _iso(now)) is False


# ---------------------------------------------------------------------------
# InMemoryTokenStore tests
# ---------------------------------------------------------------------------


def test_token_store_roundtrip():
    """store → get → delete cycle must work correctly."""
    store = InMemoryTokenStore()
    tokens = {"access_token": "tok_abc", "refresh_token": "ref_xyz", "expires_in": 3600}

    # Initially absent
    assert store.get("creator-1") is None

    # Store and retrieve
    store.store("creator-1", tokens)
    retrieved = store.get("creator-1")
    assert retrieved is not None
    assert retrieved["access_token"] == "tok_abc"
    assert retrieved["refresh_token"] == "ref_xyz"

    # Stored copy is independent of the original dict
    tokens["access_token"] = "mutated"
    assert store.get("creator-1")["access_token"] == "tok_abc"

    # Delete removes the entry
    store.delete("creator-1")
    assert store.get("creator-1") is None

    # Double-delete is a no-op
    store.delete("creator-1")


# ---------------------------------------------------------------------------
# TikTokStatsClient.mock_stats tests
# ---------------------------------------------------------------------------


def test_mock_stats_shape():
    """mock_stats must return a PostStats with all expected fields populated."""
    stats = TikTokStatsClient.mock_stats("creator-42", "post-99")

    assert isinstance(stats, PostStats)
    assert stats.post_id == "post-99"
    assert stats.creator_id == "creator-42"
    assert stats.platform == "tiktok"
    assert isinstance(stats.views, int) and stats.views > 0
    assert isinstance(stats.likes, int) and stats.likes >= 0
    assert isinstance(stats.comments, int) and stats.comments >= 0
    assert isinstance(stats.shares, int) and stats.shares >= 0
    assert isinstance(stats.retention_pct, float)
    assert stats.fetched_at != ""

    # to_dict must include exactly the numeric metric keys
    d = stats.to_dict()
    assert set(d.keys()) == {"views", "likes", "comments", "shares", "retention_pct"}


def test_mock_stats_overrides():
    """Overrides passed to mock_stats must take effect."""
    stats = TikTokStatsClient.mock_stats("creator-1", "post-1", views=99999, retention_pct=55.5)
    assert stats.views == 99999
    assert stats.retention_pct == 55.5


# ---------------------------------------------------------------------------
# PostStats.to_stats_str tests
# ---------------------------------------------------------------------------


def test_post_stats_to_str():
    """to_stats_str format must match what InsightAgent expects."""
    stats = PostStats(
        post_id="p1",
        creator_id="c1",
        views=12400,
        likes=890,
        comments=134,
        shares=67,
        retention_pct=38.0,
    )
    result = stats.to_stats_str()
    assert result == "views=12400 likes=890 comments=134 shares=67 retention=38.0%"


def test_post_stats_to_str_zero_values():
    """to_stats_str must render zero values correctly."""
    stats = PostStats(post_id="p2", creator_id="c2")
    result = stats.to_stats_str()
    assert result == "views=0 likes=0 comments=0 shares=0 retention=0.0%"


# ---------------------------------------------------------------------------
# OAuth helpers — real implementations (require live credentials / network)
# ---------------------------------------------------------------------------


def test_exchange_code_raises_without_network(monkeypatch):
    """exchange_code_for_tokens raises when httpx cannot connect (no mock credentials)."""
    import httpx
    from omicron_agent_kit.platform.tiktok import exchange_code_for_tokens

    def _fail(*a, **kw):
        raise httpx.ConnectError("no network in tests")

    monkeypatch.setattr(httpx, "post", _fail)
    with pytest.raises(httpx.ConnectError):
        exchange_code_for_tokens("id", "secret", "code", "http://localhost", "verifier")


def test_refresh_token_raises_without_network(monkeypatch):
    """refresh_access_token raises when httpx cannot connect."""
    import httpx
    from omicron_agent_kit.platform.tiktok import refresh_access_token

    def _fail(*a, **kw):
        raise httpx.ConnectError("no network in tests")

    monkeypatch.setattr(httpx, "post", _fail)
    with pytest.raises(httpx.ConnectError):
        refresh_access_token("id", "secret", "refresh_tok")


def test_fetch_post_stats_raises_without_token():
    """fetch_post_stats raises RuntimeError when no token is stored for creator."""
    client = TikTokStatsClient("id", "secret")
    with pytest.raises(RuntimeError, match="No access token"):
        client.fetch_post_stats("creator-1", "post-1")
