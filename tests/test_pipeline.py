import os

# Pin all settings to test-safe values before the app module is imported.
os.environ["API_KEYS"] = "test-key"
os.environ["LLM_MODEL"] = "anthropic/claude-sonnet-4-6"
os.environ["ANTHROPIC_API_KEY"] = ""  # missing key → lm_error at startup

from fastapi.testclient import TestClient  # noqa: E402
from omicron_agent_kit.api.main import create_app  # noqa: E402
from omicron_agent_kit.config import get_settings  # noqa: E402

_VALID_PAYLOAD = {
    "creator_id": "creator_abc123",
    "post_id": "post_xyz789",
    "platform": "tiktok",
    "detected_at": "2026-07-07T10:00:00Z",
    "current_stats": {
        "views": 12400,
        "likes": 890,
        "comments": 134,
        "shares": 67,
        "retention_pct": 38.0,
    },
    "historical_baseline": {
        "avg_views": 8900.0,
        "std_views": 2100.0,
        "avg_likes": 610.0,
        "std_likes": 180.0,
        "avg_comments": 88.0,
        "std_comments": 25.0,
        "avg_shares": 41.0,
        "std_shares": 12.0,
        "avg_retention_pct": 31.0,
        "std_retention_pct": 4.5,
        "sample_size": 10,
    },
}


def _fresh_app():
    # get_settings() is @lru_cache — clear it so each test starts from the
    # patched os.environ rather than a stale cached Settings object.
    get_settings.cache_clear()
    return create_app()


def test_pipeline_requires_api_key():
    """Unauthenticated call to the pipeline endpoint must return 401 or 422."""
    app = _fresh_app()
    with TestClient(app) as client:
        resp = client.post("/v1/pipeline/analyze-post", json=_VALID_PAYLOAD)
        assert resp.status_code in (401, 422), (
            f"Expected 401/422 for missing API key, got {resp.status_code}: {resp.text}"
        )


def test_pipeline_analyze_post_lm_missing():
    """With a valid API key but no LLM configured, the pipeline must still return 200.

    InsightAgent will raise because ANTHROPIC_API_KEY is empty. The pipeline
    catches that error, falls back to urgency='low' and insight='Insight unavailable',
    and completes normally. All four trace IDs must be present in the response.
    """
    app = _fresh_app()
    with TestClient(app) as client:
        resp = client.post(
            "/v1/pipeline/analyze-post",
            json=_VALID_PAYLOAD,
            headers={"X-API-Key": "test-key"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        data = resp.json()

        # Core identity fields
        assert data["creator_id"] == "creator_abc123"
        assert data["post_id"] == "post_xyz789"
        assert data["platform"] == "tiktok"

        # MonitoringAgent output
        assert data["poll_offsets_min"] == [30, 45, 60, 90]

        # AnalyticsAgent output — z_scores dict must be present and non-empty
        assert isinstance(data["z_scores"], dict)
        assert len(data["z_scores"]) > 0

        # InsightAgent fallback — LM missing means graceful degradation
        assert data["urgency"] == "low"
        assert data["insight"] == "Insight unavailable"

        # NotificationAgent — low urgency means no dispatch
        assert data["notification_dispatched"] is False

        # All four agent trace IDs must be present
        expected_agents = {
            "monitoring-agent",
            "analytics-agent",
            "insight-agent",
            "notification-agent",
        }
        assert expected_agents == set(data["trace_ids"].keys()), (
            f"Missing trace IDs. Got: {set(data['trace_ids'].keys())}"
        )
        for agent_name, tid in data["trace_ids"].items():
            assert isinstance(tid, str) and len(tid) > 0, (
                f"trace_id for {agent_name!r} is empty or not a string"
            )

        # Latency must be a positive number
        assert data["total_latency_ms"] > 0


def test_pipeline_unknown_endpoint_404():
    """A request to a non-existent pipeline path must return 404."""
    app = _fresh_app()
    with TestClient(app) as client:
        resp = client.post(
            "/v1/pipeline/does-not-exist",
            json=_VALID_PAYLOAD,
            headers={"X-API-Key": "test-key"},
        )
        assert resp.status_code == 404, (
            f"Expected 404 for unknown endpoint, got {resp.status_code}: {resp.text}"
        )
