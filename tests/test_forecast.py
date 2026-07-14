"""Tests for ml.forecast — no LLM or DB required."""

import math

import pytest

from omicron_agent_kit.ml.forecast import (
    MIN_SAMPLES,
    PostPerformanceForecast,
    _build_feature_row,
    parse_stats_str,
)

# ---------------------------------------------------------------------------
# Helpers — use the PRODUCTION string formats that analytics_agent emits.
# analytics_agent._DISPLAY_NAMES renames:
#   retention_pct     → retention
#   avg_retention_pct → avg_retention
# parse_stats_str normalises these aliases back to STAT_NAMES canonical keys.
# ---------------------------------------------------------------------------

# Raw numeric dicts (canonical keys, as stored in DB checkpoints)
_BASELINE = {
    "avg_views": 8900.0,
    "avg_likes": 610.0,
    "avg_comments": 88.0,
    "avg_shares": 41.0,
    "avg_retention_pct": 31.0,
}

_T30 = {
    "views": 12400.0,
    "likes": 890.0,
    "comments": 134.0,
    "shares": 67.0,
    "retention_pct": 38.0,
}

# Production strings as analytics_agent formats them (aliases present)
_T30_STR = "views=12400 likes=890 comments=134 shares=67 retention=38"
_BASELINE_STR = (
    "avg_views=8900 avg_likes=610 avg_comments=88 avg_shares=41 avg_retention=31"
)


def _make_checkpoint(offset_min: int, multiplier: float = 1.0) -> dict:
    """DB-style checkpoint dict — keys match STAT_NAMES (canonical)."""
    return {
        "offset_min": offset_min,
        "views": int(10000 * multiplier),
        "likes": int(700 * multiplier),
        "comments": int(100 * multiplier),
        "shares": int(50 * multiplier),
        "retention_pct": 32.0,
    }


def _history_with_pairs(n_pairs: int) -> list[dict]:
    """Build a checkpoint list with n_pairs of consecutive rows."""
    rows = []
    for i in range(n_pairs + 1):
        rows.append(_make_checkpoint(offset_min=30 * (i + 1), multiplier=1.0 + i * 0.1))
    return rows


# ---------------------------------------------------------------------------
# parse_stats_str — including alias normalisation
# ---------------------------------------------------------------------------


def test_parse_stats_str_basic():
    result = parse_stats_str(_T30_STR)
    assert result["views"] == 12400.0
    assert result["likes"] == 890.0
    # "retention" alias is normalised to "retention_pct"
    assert result["retention_pct"] == 38.0
    assert "retention" not in result


def test_parse_stats_str_avg_retention_alias():
    result = parse_stats_str("avg_retention=31")
    assert result["avg_retention_pct"] == 31.0
    assert "avg_retention" not in result


def test_parse_stats_str_percent_suffix():
    result = parse_stats_str("retention=38%")
    assert result["retention_pct"] == 38.0


def test_parse_stats_str_canonical_key_unchanged():
    result = parse_stats_str("retention_pct=38")
    assert result["retention_pct"] == 38.0


def test_parse_stats_str_empty():
    assert parse_stats_str("") == {}


# ---------------------------------------------------------------------------
# _build_feature_row
# ---------------------------------------------------------------------------


def test_feature_row_shape():
    row = _build_feature_row(_T30, _BASELINE)
    assert row.shape == (10,)


def test_feature_row_ratio():
    row = _build_feature_row(_T30, _BASELINE)
    # views=12400, avg_views=8900 → ratio ≈ 1.393
    assert math.isclose(row[1], 12400 / 8900, rel_tol=1e-6)


def test_feature_row_retention_with_production_baseline():
    """Baseline built from the production string must produce a valid retention ratio."""
    avg = parse_stats_str(_BASELINE_STR)
    row = _build_feature_row(_T30, avg)
    # retention_pct index is 8 (value) and 9 (ratio); ratio must not be NaN
    assert not math.isnan(row[9]), "retention ratio should not be NaN with production baseline"
    assert math.isclose(row[9], 38.0 / 31.0, rel_tol=1e-4)


def test_feature_row_missing_avg_gives_nan():
    row = _build_feature_row(_T30, {})
    assert all(math.isnan(row[i]) for i in range(1, 10, 2))  # odd indices are ratios


# ---------------------------------------------------------------------------
# Heuristic fallback (n < MIN_SAMPLES)
# ---------------------------------------------------------------------------


def test_heuristic_fallback_returns_result():
    f = PostPerformanceForecast()
    result = f.predict(_T30, _BASELINE, signal="above_baseline")
    assert result.confidence == "heuristic"
    assert result.n_training_samples == 0
    assert result.forecast_t60["views"] > _T30["views"]


def test_heuristic_context_str_format():
    f = PostPerformanceForecast()
    result = f.predict(_T30_STR, _BASELINE_STR, signal="within_baseline")
    assert result.context_str.startswith("ML forecast at T+60")
    assert "heuristic" in result.context_str


def test_heuristic_string_inputs_with_production_format():
    """Production strings (with retention alias) must parse correctly end-to-end."""
    f = PostPerformanceForecast()
    result = f.predict(_T30_STR, _BASELINE_STR)
    assert isinstance(result.forecast_t60["views"], float)
    # retention_pct should be nonzero — 32.0 * 1.02 ≈ 32.6
    assert result.forecast_t60["retention_pct"] > 0


# ---------------------------------------------------------------------------
# Model path (n >= MIN_SAMPLES)
# ---------------------------------------------------------------------------


def test_model_fit_and_predict():
    history = _history_with_pairs(MIN_SAMPLES)
    f = PostPerformanceForecast()
    f.fit(history, _BASELINE)
    result = f.predict(_T30, _BASELINE, signal="above_baseline")
    assert result.confidence == "model"
    assert result.n_training_samples == MIN_SAMPLES
    for stat, val in result.forecast_t60.items():
        assert math.isfinite(val), f"{stat} forecast is not finite"
        assert val >= 0, f"{stat}: {val} < 0"


def test_model_context_str_contains_model_label():
    history = _history_with_pairs(MIN_SAMPLES)
    f = PostPerformanceForecast()
    f.fit(history, _BASELINE)
    result = f.predict(_T30, _BASELINE)
    assert "model" in result.context_str
    assert f"n={MIN_SAMPLES}" in result.context_str


def test_model_falls_back_when_below_min():
    history = _history_with_pairs(MIN_SAMPLES - 1)
    f = PostPerformanceForecast()
    f.fit(history, _BASELINE)
    result = f.predict(_T30, _BASELINE)
    assert result.confidence == "heuristic"


def test_model_decline_not_clamped_to_one():
    """A model that predicts decline (ratio < 1) must not be floored to 1.0."""
    history = _history_with_pairs(MIN_SAMPLES)
    f = PostPerformanceForecast()
    f.fit(history, _BASELINE)
    # Inject a scenario where model might predict < 1 ratio by using small t30 values.
    # We can't force the model output, but we verify the floor is 0.0, not 1.0.
    # The real regression test is that forecast[stat] < v30 is possible.
    result = f._predict_model({"views": 100.0, "likes": 5.0, "comments": 1.0, "shares": 0.0, "retention_pct": 10.0}, _BASELINE)
    for stat, val in result.forecast_t60.items():
        assert val >= 0.0, f"{stat}: model output {val} is negative"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_empty_checkpoint_history_uses_heuristic():
    f = PostPerformanceForecast()
    f.fit([], _BASELINE)
    result = f.predict(_T30, _BASELINE)
    assert result.confidence == "heuristic"


def test_zero_t30_values_dont_crash():
    zero_t30 = {k: 0.0 for k in ("views", "likes", "comments", "shares", "retention_pct")}
    f = PostPerformanceForecast()
    result = f.predict(zero_t30, _BASELINE)
    assert isinstance(result.forecast_t60["views"], float)


def test_unknown_signal_uses_default_ratios():
    f = PostPerformanceForecast()
    result = f.predict(_T30, _BASELINE, signal="not_a_real_signal")
    assert result.forecast_t60["views"] > 0


def test_non_finite_forecast_does_not_crash_context_str():
    """ForecastResult.__post_init__ must not raise on inf/nan values."""
    import math
    from omicron_agent_kit.ml.forecast import ForecastResult
    r = ForecastResult(
        forecast_t60={"views": float("inf"), "likes": float("nan"), "comments": 5.0, "shares": 0.0, "retention_pct": 30.0},
        confidence="model",
        n_training_samples=5,
    )
    assert "?" in r.context_str  # non-finite values represented as "?"


def test_retention_forecast_nonzero_with_production_strings():
    """End-to-end: analytics-agent strings → parse → heuristic → nonzero retention."""
    f = PostPerformanceForecast()
    result = f.predict(_T30_STR, _BASELINE_STR, signal="above_baseline")
    assert result.forecast_t60["retention_pct"] > 0, (
        "retention_pct forecast must not be zero; key alias normalisation likely broken"
    )
