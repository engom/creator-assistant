import os

# Pin all settings to test-safe values before the app module is imported.
os.environ["API_KEYS"] = "test-key"
os.environ["LLM_MODEL"] = "anthropic/claude-sonnet-4-6"
os.environ["ANTHROPIC_API_KEY"] = ""  # missing key → lm_error at startup

from fastapi.testclient import TestClient  # noqa: E402
from omicron_agent_kit.api.main import create_app  # noqa: E402
from omicron_agent_kit.config import get_settings  # noqa: E402

_AGENT_NAMES = {
    "monitoring-agent",
    "analytics-agent",
    "insight-agent",
    "notification-agent",
}


def _fresh_app():
    # get_settings() is @lru_cache — clear it so each test starts from the
    # patched os.environ rather than a stale cached Settings object.
    get_settings.cache_clear()
    return create_app()


def test_health_degraded_when_lm_missing():
    """When ANTHROPIC_API_KEY is absent the app starts but /health reports degraded."""
    app = _fresh_app()
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 503
        assert resp.json()["status"] == "degraded"


def test_health_ok_when_lm_configured(monkeypatch):
    """When an API key is present /health returns 200 ok."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-fake")
    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


def test_list_agents_requires_api_key():
    """Listing agents requires a valid API key — unauthenticated callers get 401."""
    app = _fresh_app()
    with TestClient(app) as client:
        resp = client.get("/v1/agents")
        assert resp.status_code in (401, 422)

        resp = client.get("/v1/agents", headers={"X-API-Key": "test-key"})
        assert resp.status_code == 200
        names = {a["name"] for a in resp.json()}
        assert names == _AGENT_NAMES


def test_invoke_requires_api_key():
    app = _fresh_app()
    with TestClient(app) as client:
        resp = client.post(
            "/v1/agents/monitoring-agent/invoke",
            json={
                "input": {
                    "creator_id": "c1",
                    "post_id": "p1",
                    "detected_at": "2026-07-07T10:00:00Z",
                }
            },
        )
        assert resp.status_code in (401, 403, 422)


def test_invoke_unknown_agent_404():
    app = _fresh_app()
    with TestClient(app) as client:
        resp = client.post(
            "/v1/agents/does-not-exist/invoke",
            json={"input": {}},
            headers={"X-API-Key": "test-key"},
        )
        assert resp.status_code == 404
