"""Tests for Pub-IQ workflow pure logic — no DBOS or Postgres needed."""

from omicron_agent_kit.workflows.pubiq import (
    _THRESHOLDS,
    PulseCheck,
    _offset_delay_seconds,
)


def test_offset_delay_from_zero():
    """First checkpoint at 30 min from t=0 should sleep 1800s."""
    assert _offset_delay_seconds(30, 0.0) == 1800.0


def test_offset_delay_partial_elapsed():
    """If 20 min have elapsed, delay to T+30 should be 10 min."""
    assert _offset_delay_seconds(30, 1200.0) == 600.0


def test_offset_delay_already_past():
    """If already past the target, delay is 0."""
    assert _offset_delay_seconds(30, 2000.0) == 0


def test_thresholds_defined():
    """All three checkpoint offsets have defined thresholds."""
    assert 30 in _THRESHOLDS
    assert 60 in _THRESHOLDS
    assert 90 in _THRESHOLDS


def test_pulse_check_dataclass():
    """PulseCheck can be constructed and converted to dict."""
    pc = PulseCheck(
        creator_id="c1",
        post_id="p1",
        platform="tiktok",
        offset_min=30,
        views=12000,
        likes=800,
        comments=100,
        shares=50,
        retention_pct=35.0,
        z_scores={"views": 1.67},
        signal="above_baseline",
        triggered=True,
        insight="Test insight",
        recommended_action="Pin comment",
    )
    from dataclasses import asdict

    d = asdict(pc)
    assert d["creator_id"] == "c1"
    assert d["triggered"] is True
    assert d["z_scores"]["views"] == 1.67
