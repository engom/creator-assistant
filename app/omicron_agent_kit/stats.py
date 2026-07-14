"""Shared stat-name constants for the creator-analytics domain.

All modules that need the canonical stat names or the display-name mapping
import from here, so a new stat (e.g. ``saves``) only requires one edit.
"""

# Canonical stat names — match the DB ``post_checkpoints`` column names and
# the ``current_stats`` dict shape produced by TikTokStatsClient.
STAT_NAMES: tuple[str, ...] = ("views", "likes", "comments", "shares", "retention_pct")

# Keys that analytics_agent renames in its display strings (e.g. for DSPy prompts).
# Maps canonical_key → display_key for the subset that differ.
# Used by analytics_agent to build current_stats_str / historical_baseline_str,
# and reversed by parse_stats_str to normalise incoming strings back to canonical keys.
STAT_DISPLAY_ALIASES: dict[str, str] = {
    "retention_pct": "retention",
    "avg_retention_pct": "avg_retention",
}
