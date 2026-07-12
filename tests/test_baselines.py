"""Tests for Welford baseline logic and baseline_to_agent_input conversion."""

import math

from omicron_agent_kit.db.baselines import BaselineStat, baseline_to_agent_input


def test_baseline_to_agent_input_basic():
    """Convert BaselineStat dict to analytics-agent input shape."""
    baseline = {
        "views": BaselineStat(count=10, mean=8900.0, std=2100.0),
        "likes": BaselineStat(count=10, mean=610.0, std=180.0),
        "comments": BaselineStat(count=10, mean=88.0, std=25.0),
        "shares": BaselineStat(count=10, mean=41.0, std=12.0),
        "retention_pct": BaselineStat(count=10, mean=31.0, std=4.5),
    }

    result = baseline_to_agent_input(baseline)

    assert result["avg_views"] == 8900.0
    assert result["std_views"] == 2100.0
    assert result["avg_likes"] == 610.0
    assert result["std_likes"] == 180.0
    assert result["sample_size"] == 10


def test_baseline_to_agent_input_empty():
    """Empty baseline returns sample_size 0."""
    result = baseline_to_agent_input({})
    assert result["sample_size"] == 0


def test_baseline_stat_std_zero_when_count_one():
    """A single observation has std=0."""
    bs = BaselineStat(count=1, mean=100.0, std=0.0)
    assert bs.std == 0.0


def test_baseline_stat_std_from_m2():
    """Verify std = sqrt(m2 / count) matches expected value."""
    count = 10
    m2 = 4410000.0  # sum of squared deviations
    expected_std = math.sqrt(m2 / count)
    bs = BaselineStat(count=count, mean=8900.0, std=expected_std)
    assert abs(bs.std - expected_std) < 0.01
