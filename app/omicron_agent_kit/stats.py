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

# Checkpoint offsets in minutes, aligned with TikTok's algorithm window.
# Used by both the monitoring agent and the durable Pub-IQ workflow.
CHECKPOINT_OFFSETS_MIN: tuple[int, ...] = (30, 45, 60, 90)

# Subset used by the durable workflow (T+30, T+60, T+90 only — T+45 is
# handled by the adaptive poller, not by DBOS checkpoints).
WORKFLOW_CHECKPOINT_OFFSETS_MIN: tuple[int, ...] = (30, 60, 90)
