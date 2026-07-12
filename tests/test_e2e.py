"""End-to-end integration tests — hit the real FastAPI app over HTTP.

These tests require:
  • The API server running on http://localhost:8000
  • API_KEYS set to include 'test-key' (or the key in E2E_API_KEY env var)

They are excluded from the normal `make test` suite (no server needed there).
Run with:
    make e2e                  # starts server automatically, runs, stops it
    make test-e2e-live        # assumes server is already running

All assertions are against the contract defined in api/schemas.py so that
this file acts as a living spec.
"""

import os
import time

import pytest
import requests

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8000")
API_KEY = os.getenv("E2E_API_KEY", "test-key")
HEADERS = {"X-API-Key": API_KEY}

_ANALYZE_PAYLOAD = {
    "creator_id": "e2e_creator_01",
    "post_id": "e2e_post_001",
    "platform": "tiktok",
    "detected_at": "2026-07-12T10:00:00Z",
    "current_stats": {
        "views": 18500,
        "likes": 1340,
        "comments": 112,
        "shares": 88,
        "retention_pct": 39.5,
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


def wait_for_server(timeout: int = 30) -> bool:
    """Poll /health until it responds (any status) or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            requests.get(f"{BASE_URL}/health", timeout=2)
            return True
        except requests.exceptions.ConnectionError:
            time.sleep(0.5)
    return False


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #


class TestHealth:
    def test_health_reachable(self):
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        assert r.status_code in (200, 503), f"Unexpected status: {r.status_code}"
        body = r.json()
        assert body["status"] in ("ok", "degraded")

    def test_health_json_schema(self):
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        body = r.json()
        assert "status" in body


# --------------------------------------------------------------------------- #
# Agents listing
# --------------------------------------------------------------------------- #


class TestAgents:
    def test_list_agents_unauth_fails(self):
        r = requests.get(f"{BASE_URL}/v1/agents", timeout=10)
        assert r.status_code in (401, 422)

    def test_list_agents_returns_all_four(self):
        r = requests.get(f"{BASE_URL}/v1/agents", headers=HEADERS, timeout=10)
        assert r.status_code == 200
        names = {a["name"] for a in r.json()}
        expected = {
            "monitoring-agent",
            "analytics-agent",
            "insight-agent",
            "notification-agent",
        }
        assert expected == names

    def test_list_agents_schema(self):
        r = requests.get(f"{BASE_URL}/v1/agents", headers=HEADERS, timeout=10)
        for agent in r.json():
            assert "name" in agent
            assert "description" in agent
            assert isinstance(agent["description"], str)


# --------------------------------------------------------------------------- #
# Agent invocations
# --------------------------------------------------------------------------- #


class TestAgentInvoke:
    def test_monitoring_agent(self):
        r = requests.post(
            f"{BASE_URL}/v1/agents/monitoring-agent/invoke",
            headers=HEADERS,
            json={
                "input": {
                    "creator_id": "e2e_creator_01",
                    "post_id": "e2e_post_001",
                    "detected_at": "2026-07-12T10:00:00Z",
                    "platform": "tiktok",
                }
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["agent"] == "monitoring-agent"
        assert "trace_id" in data
        assert "latency_ms" in data
        out = data["output"]
        assert out["poll_offsets_min"] == [30, 45, 60, 90]
        assert out["status"] == "scheduled"

    def test_analytics_agent(self):
        r = requests.post(
            f"{BASE_URL}/v1/agents/analytics-agent/invoke",
            headers=HEADERS,
            json={
                "input": {
                    "creator_id": "e2e_creator_01",
                    "post_id": "e2e_post_001",
                    "platform": "tiktok",
                    "current_stats": _ANALYZE_PAYLOAD["current_stats"],
                    "historical_baseline": _ANALYZE_PAYLOAD["historical_baseline"],
                }
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["agent"] == "analytics-agent"
        out = data["output"]
        assert "z_scores" in out
        assert "signal" in out
        assert out["signal"] in (
            "above_baseline",
            "within_baseline",
            "below_baseline",
            "insufficient_data",
        )
        for stat in ("views", "likes", "comments", "shares", "retention_pct"):
            assert stat in out["z_scores"], f"z_scores missing '{stat}'"

    def test_notification_agent_low_urgency(self):
        r = requests.post(
            f"{BASE_URL}/v1/agents/notification-agent/invoke",
            headers=HEADERS,
            json={
                "input": {
                    "creator_id": "e2e_creator_01",
                    "post_id": "e2e_post_001",
                    "urgency": "low",
                    "insight": "Within baseline — no action needed.",
                }
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        out = r.json()["output"]
        assert out["action"] == "log_only"
        assert out["dispatched"] is False

    def test_notification_agent_high_urgency(self):
        r = requests.post(
            f"{BASE_URL}/v1/agents/notification-agent/invoke",
            headers=HEADERS,
            json={
                "input": {
                    "creator_id": "e2e_creator_01",
                    "post_id": "e2e_post_001",
                    "urgency": "high",
                    "insight": "Views at 2.1× baseline.",
                    "recommended_action": "Cross-post to Instagram Reels.",
                }
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        out = r.json()["output"]
        assert out["action"] == "notified"
        assert out["dispatched"] is True

    def test_unknown_agent_404(self):
        r = requests.post(
            f"{BASE_URL}/v1/agents/no-such-agent/invoke",
            headers=HEADERS,
            json={"input": {}},
            timeout=10,
        )
        assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Full pipeline
# --------------------------------------------------------------------------- #


class TestPipeline:
    def test_analyze_post_full_response_shape(self):
        r = requests.post(
            f"{BASE_URL}/v1/pipeline/analyze-post",
            headers=HEADERS,
            json=_ANALYZE_PAYLOAD,
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        d = r.json()

        # Identity
        assert d["creator_id"] == "e2e_creator_01"
        assert d["post_id"] == "e2e_post_001"
        assert d["platform"] == "tiktok"

        # Monitoring
        assert d["poll_offsets_min"] == [30, 45, 60, 90]

        # Analytics
        assert isinstance(d["z_scores"], dict)
        assert d["signal"] in (
            "above_baseline", "within_baseline",
            "below_baseline", "insufficient_data"
        )

        # Insight (may be 'Insight unavailable' if LM not configured)
        assert isinstance(d["insight"], str) and len(d["insight"]) > 0
        assert d["urgency"] in ("low", "medium", "high")
        assert isinstance(d["recommended_action"], str)

        # Notification
        assert isinstance(d["notification_dispatched"], bool)

        # Trace IDs — one per agent
        expected_agents = {
            "monitoring-agent", "analytics-agent",
            "insight-agent", "notification-agent",
        }
        assert set(d["trace_ids"].keys()) == expected_agents
        for tid in d["trace_ids"].values():
            assert isinstance(tid, str) and len(tid) > 0

        # Latency
        assert d["total_latency_ms"] > 0

    def test_analyze_post_above_baseline_stats(self):
        """Stats that are clearly above baseline should produce above_baseline signal."""
        payload = {
            **_ANALYZE_PAYLOAD,
            "current_stats": {
                "views": 40000,   # ~2.4σ above 8900 avg, 2100 std
                "likes": 3000,
                "comments": 300,
                "shares": 200,
                "retention_pct": 45.0,
            },
        }
        r = requests.post(
            f"{BASE_URL}/v1/pipeline/analyze-post",
            headers=HEADERS,
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["signal"] == "above_baseline", (
            f"Expected above_baseline for very high stats, got {d['signal']}"
        )
        assert d["z_scores"]["views"] >= 1.5, (
            f"Expected views z-score ≥ 1.5, got {d['z_scores']['views']}"
        )

    def test_analyze_post_below_baseline_stats(self):
        """Stats clearly below baseline should produce below_baseline signal."""
        payload = {
            **_ANALYZE_PAYLOAD,
            "current_stats": {
                "views": 2000,    # ~-3.3σ below baseline
                "likes": 100,
                "comments": 10,
                "shares": 5,
                "retention_pct": 15.0,
            },
        }
        r = requests.post(
            f"{BASE_URL}/v1/pipeline/analyze-post",
            headers=HEADERS,
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["signal"] == "below_baseline", (
            f"Expected below_baseline for very low stats, got {d['signal']}"
        )

    def test_analyze_post_unauthenticated(self):
        r = requests.post(
            f"{BASE_URL}/v1/pipeline/analyze-post",
            json=_ANALYZE_PAYLOAD,
            timeout=10,
        )
        assert r.status_code in (401, 422)

    def test_analyze_post_missing_required_fields(self):
        r = requests.post(
            f"{BASE_URL}/v1/pipeline/analyze-post",
            headers=HEADERS,
            json={"creator_id": "x"},   # missing almost everything
            timeout=10,
        )
        assert r.status_code == 422

    def test_pipeline_latency_reasonable(self):
        """Full pipeline (no LLM) should complete in under 10 seconds."""
        start = time.monotonic()
        r = requests.post(
            f"{BASE_URL}/v1/pipeline/analyze-post",
            headers=HEADERS,
            json=_ANALYZE_PAYLOAD,
            timeout=30,
        )
        elapsed = time.monotonic() - start
        assert r.status_code == 200
        assert elapsed < 10, f"Pipeline took {elapsed:.2f}s (limit 10s)"


# --------------------------------------------------------------------------- #
# Frontend static check (dev server must be on :5173)
# --------------------------------------------------------------------------- #


class TestFrontend:
    """Smoke-test that the Vite dev server (or built dist) is reachable."""

    FRONTEND_URL = os.getenv("E2E_FRONTEND_URL", "http://localhost:5173")

    def test_frontend_reachable(self):
        try:
            r = requests.get(self.FRONTEND_URL, timeout=5)
            assert r.status_code == 200
            assert "Omicron" in r.text
        except requests.exceptions.ConnectionError:
            pytest.skip("Frontend dev server not running — skipping frontend smoke test")

    def test_frontend_api_proxy(self):
        """The Vite proxy should forward /api/health to the backend."""
        try:
            r = requests.get(f"{self.FRONTEND_URL}/api/health", timeout=5)
            assert r.status_code in (200, 503)
            assert "status" in r.json()
        except requests.exceptions.ConnectionError:
            pytest.skip("Frontend dev server not running — skipping proxy test")
