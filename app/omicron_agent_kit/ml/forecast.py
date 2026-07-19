"""Sklearn-based T+30 → T+60 growth forecaster for creator post stats.

Approach
--------
Each stat (views, likes, comments, shares, retention_pct) is modelled
independently as a *growth ratio*: target = stat_t60 / stat_t30.  Modelling
the ratio (rather than raw values) makes training examples from small and
large creators comparable without any normalisation step.

Feature vector per training row (10 features):
    stat_t30, stat_t30 / avg_stat  — absolute value + creator-relative value
    × 5 stats = 10 inputs

Model: HistGradientBoostingRegressor
    • handles the tiny sample sizes typical of early post history (n ≥ 3)
    • native support for missing features (NaN) via surrogate splits
    • no scaling required — monotonic transforms don't change tree decisions

Fallback when n < MIN_SAMPLES: empirical median TikTok T+30→T+60 growth bands
(derived from published benchmarks; signal from analytics-agent tightens them).

Usage
-----
    forecaster = PostPerformanceForecast()
    forecaster.fit(checkpoint_history, historical_baseline)
    result = forecaster.predict(current_t30, historical_baseline)
    # result.forecast_t60  → {"views": 18600, "likes": ...}
    # result.confidence    → "model" | "heuristic"
    # result.context_str   → ready to inject into DSPy as forecast_context
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from omicron_agent_kit.stats import STAT_DISPLAY_ALIASES, STAT_NAMES

# Minimum checkpoint pairs (T+30 + T+60) before we trust the model.
MIN_SAMPLES = 3

# Reverse of analytics_agent's STAT_DISPLAY_ALIASES: normalises display-string
# keys back to STAT_NAMES canonical keys when parsing formatted input strings.
_KEY_ALIASES: dict[str, str] = {v: k for k, v in STAT_DISPLAY_ALIASES.items()}

# Empirical median T+30→T+60 growth ratios from TikTok benchmark reports.
# Keyed by analytics-agent signal, then stat name.
_HEURISTIC_RATIOS: dict[str, dict[str, float]] = {
    "above_baseline": {
        "views": 1.55,
        "likes": 1.45,
        "comments": 1.40,
        "shares": 1.50,
        "retention_pct": 1.05,
    },
    "within_baseline": {
        "views": 1.35,
        "likes": 1.30,
        "comments": 1.28,
        "shares": 1.32,
        "retention_pct": 1.02,
    },
    "below_baseline": {
        "views": 1.15,
        "likes": 1.12,
        "comments": 1.10,
        "shares": 1.12,
        "retention_pct": 1.00,
    },
}
_DEFAULT_RATIOS = dict(_HEURISTIC_RATIOS["within_baseline"])


@dataclass
class ForecastResult:
    forecast_t60: dict[str, float]
    confidence: str  # "model" | "heuristic"
    n_training_samples: int
    context_str: str = field(init=False)

    @property
    def is_meaningful(self) -> bool:
        """False for cold-start heuristics (no checkpoint history at all).

        Callers should return "" rather than injecting a benchmark-ratio
        projection into the LLM prompt when this is False.
        """
        return not (self.confidence == "heuristic" and self.n_training_samples == 0)

    def __post_init__(self) -> None:
        parts = []
        for stat, val in self.forecast_t60.items():
            if not math.isfinite(val):
                parts.append(f"forecast_{stat}=?")
            elif stat == "retention_pct":
                parts.append(f"forecast_{stat}={val:.1f}%")
            else:
                parts.append(f"forecast_{stat}={round(val)}")
        self.context_str = (
            f"ML forecast at T+60 ({self.confidence}, n={self.n_training_samples}): "
            + " ".join(parts)
        )


def parse_stats_str(stats_str: str) -> dict[str, float]:
    """Parse 'views=12400 likes=890 ...' into a float dict.

    Normalises analytics-agent display-name aliases to STAT_NAMES canonical
    keys: ``retention`` → ``retention_pct``, ``avg_retention`` → ``avg_retention_pct``.
    """
    out: dict[str, float] = {}
    for token in stats_str.split():
        if "=" not in token:
            continue
        key, _, raw = token.partition("=")
        key = _KEY_ALIASES.get(key.strip(), key.strip())
        raw = raw.strip().rstrip("%")
        try:
            out[key] = float(raw)
        except ValueError:
            pass
    return out


def _build_feature_row(
    t30: dict[str, float],
    avg: dict[str, float],
) -> np.ndarray:
    """Build a 10-element feature vector for one T+30 observation."""
    row: list[float] = []
    for stat in STAT_NAMES:
        v30 = t30.get(stat, math.nan)
        avg_v = avg.get(stat)
        if avg_v is None:
            avg_v = avg.get(f"avg_{stat}")
        ratio = v30 / avg_v if avg_v is not None and avg_v > 0 else math.nan
        row.extend([v30, ratio])
    return np.array(row, dtype=float)


class PostPerformanceForecast:
    """Fit per-stat HistGBR models on checkpoint pairs; predict T+60 from T+30.

    Lifecycle
    ---------
    1. Call ``fit(checkpoint_history, historical_baseline)`` with the post's
       existing checkpoint list (from ``db.checkpoints.get_checkpoints``) and
       the creator's rolling average dict.
    2. Call ``predict(current_t30, historical_baseline, signal)`` for the
       active forecast.  Returns a ``ForecastResult``.
    """

    def __init__(self) -> None:
        self._models: dict[str, Any] = {}
        self._n_samples: int = 0

    # ------------------------------------------------------------------
    # Fit
    # ------------------------------------------------------------------

    def fit(
        self,
        checkpoint_history: list[dict],
        historical_baseline: dict[str, float] | str,
    ) -> PostPerformanceForecast:
        """Train one model per stat on (T+30 features → T+60/T+30 ratio).

        Parameters
        ----------
        checkpoint_history:
            List of checkpoint dicts, each with keys ``offset_min`` + the 5
            stat names.  Rows from ``asyncpg.Record`` are accepted as-is
            because they support ``dict``-style access.
        historical_baseline:
            Creator rolling average dict, e.g. ``{"avg_views": 8900, ...}``.
        """
        if isinstance(historical_baseline, str):
            historical_baseline = parse_stats_str(historical_baseline)

        # Index by offset_min
        by_offset: dict[int, dict] = {}
        for row in checkpoint_history:
            by_offset[int(row["offset_min"])] = row

        keys = sorted(by_offset)
        pairs = list(zip(keys, keys[1:]))
        self._n_samples = len(pairs)
        if self._n_samples < MIN_SAMPLES:
            return self

        # Per-stat (X, y) lists — only include rows where v30 > 0 so we can
        # compute a meaningful growth ratio.  A zero v30 cannot contribute a
        # valid target and must not be imputed as ratio=1.0.
        Xs_per: dict[str, list[np.ndarray]] = {s: [] for s in STAT_NAMES}
        Ys: dict[str, list[float]] = {s: [] for s in STAT_NAMES}

        for t30_offset, t60_offset in pairs:
            r30 = by_offset[t30_offset]
            r60 = by_offset[t60_offset]
            t30_vals = {s: float(r30[s] or 0) for s in STAT_NAMES}
            t60_vals = {s: float(r60[s] or 0) for s in STAT_NAMES}
            feat_row = _build_feature_row(t30_vals, historical_baseline)
            for stat in STAT_NAMES:
                v30 = t30_vals[stat]
                v60 = t60_vals[stat]
                if v30 > 0:
                    Xs_per[stat].append(feat_row)
                    Ys[stat].append(v60 / v30)

        for stat in STAT_NAMES:
            xs = Xs_per[stat]
            if len(xs) >= MIN_SAMPLES:
                self._models[stat] = _fit_model(np.array(xs), np.array(Ys[stat]))

        return self

    # ------------------------------------------------------------------
    # Predict
    # ------------------------------------------------------------------

    def predict(
        self,
        current_t30: dict[str, float] | str,
        historical_baseline: dict[str, float] | str,
        signal: str = "within_baseline",
    ) -> ForecastResult:
        """Predict T+60 values from the current T+30 checkpoint.

        Parameters
        ----------
        current_t30:
            Either the raw stat dict or the agent input string
            ``"views=12400 likes=890 ..."``.
        historical_baseline:
            Creator rolling average dict or agent input string
            ``"avg_views=8900 ..."``.
        signal:
            ``above_baseline | within_baseline | below_baseline`` from the
            analytics-agent; used only when falling back to heuristics.
        """
        if isinstance(current_t30, str):
            current_t30 = parse_stats_str(current_t30)
        if isinstance(historical_baseline, str):
            historical_baseline = parse_stats_str(historical_baseline)

        if self._n_samples >= MIN_SAMPLES and self._models:
            return self._predict_model(current_t30, historical_baseline)
        return self._predict_heuristic(current_t30, signal)

    def _predict_model(
        self,
        t30: dict[str, float],
        avg: dict[str, float],
    ) -> ForecastResult:
        x = _build_feature_row(t30, avg).reshape(1, -1)
        forecast: dict[str, float] = {}
        for stat in STAT_NAMES:
            v30 = t30.get(stat, 0.0)
            if stat in self._models and v30 > 0:
                ratio = float(self._models[stat].predict(x)[0])
                ratio = max(ratio, 0.0)  # guard against physically impossible negative
                forecast[stat] = v30 * ratio
            else:
                forecast[stat] = v30
        return ForecastResult(
            forecast_t60=forecast,
            confidence="model",
            n_training_samples=self._n_samples,
        )

    def _predict_heuristic(
        self,
        t30: dict[str, float],
        signal: str,
    ) -> ForecastResult:
        ratios = _HEURISTIC_RATIOS.get(signal, _DEFAULT_RATIOS)
        forecast: dict[str, float] = {}
        for stat in STAT_NAMES:
            v30 = t30.get(stat, 0.0)
            forecast[stat] = v30 * ratios.get(stat, 1.0)
        return ForecastResult(
            forecast_t60=forecast,
            confidence="heuristic",
            n_training_samples=self._n_samples,
        )


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------


def _fit_model(X: np.ndarray, y: np.ndarray) -> Any:
    """Return a fitted HistGradientBoostingRegressor."""
    # Lazy import so sklearn is only required if this module is actually used.
    from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: PLC0415

    model = HistGradientBoostingRegressor(
        max_iter=200,
        max_depth=4,
        learning_rate=0.05,
        min_samples_leaf=1,  # necessary for very small datasets
        random_state=42,
    )
    model.fit(X, y)
    return model
